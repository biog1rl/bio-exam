import crypto from 'node:crypto'

import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { Router } from 'express'
import jwt from 'jsonwebtoken'

import { AUTH_CONFIG } from '../../config/auth.js'
import { db } from '../../db/index.js'
import { users, userRoles, refreshTokens } from '../../db/schema.js'
import { ERROR_MESSAGES } from '../../lib/constants.js'
import { setSessionCookie } from '../../middleware/auth/session.js'
import { rateLimiter } from '../../middleware/rateLimiter.js'
import { loginRateLimiter } from '../../middleware/rateLimiter.js'

const router = Router()

// Фиктивный хэш для защиты от timing-атак
// Заранее вычисленный bcrypt хэш случайной строки для использования когда пользователь не существует
const DUMMY_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy'

const usersColumns = (
	users as unknown as {
		_?: {
			columns?: Record<string, unknown>
		}
	}
)._?.columns

const hasFailedLoginAttemptsColumn = Boolean(usersColumns && 'failedLoginAttempts' in usersColumns)
const hasLockedUntilColumn = Boolean(usersColumns && 'lockedUntil' in usersColumns)

function getLoginGuardUpdates(payload: {
	failedLoginAttempts?: number
	lockedUntil?: Date | null
}): Record<string, unknown> {
	const updates: Record<string, unknown> = {}

	// Keep login working even if these columns are absent in current schema/migrations.
	if (hasFailedLoginAttemptsColumn && payload.failedLoginAttempts !== undefined) {
		updates.failedLoginAttempts = payload.failedLoginAttempts
	}
	if (hasLockedUntilColumn && payload.lockedUntil !== undefined) {
		updates.lockedUntil = payload.lockedUntil
	}

	return updates
}

async function updateLoginGuardFields(
	userId: string,
	payload: {
		failedLoginAttempts?: number
		lockedUntil?: Date | null
	}
): Promise<void> {
	const updates = getLoginGuardUpdates(payload)
	if (Object.keys(updates).length === 0) return

	await db
		.update(users)
		.set(updates as any)
		.where(eq(users.id, userId))
}

/**
 * POST /api/auth/login
 * body: { username, password }
 *
 * Защищён rate limiting (5 попыток в минуту на IP)
 * Защищён от timing-атак через constant-time сравнение
 */
router.post('/', async (req, res, next) => {
	try {
		const { username, password } = (req.body ?? {}) as { username?: string; password?: string }
		const login = (username ?? '').toLowerCase().trim()
		if (!login || !password) {
			return res.status(400).json({ error: ERROR_MESSAGES.MISSING_CREDENTIALS })
		}

		// Rate limiter per login+IP to make brute-force harder
		const limiter = rateLimiter({ maxAttempts: 5, windowMs: 60 * 1000, keyPrefix: `login:${login}` })
		try {
			await new Promise<void>((resolve, reject) => {
				try {
					limiter(req, res, (err?: unknown) => {
						if (err) return reject(err)
						resolve()
					})
				} catch (e) {
					reject(e)
				}
			})
		} catch (e) {
			return next(e)
		}

		const u = await db.query.users.findFirst({ where: eq(users.login, login) })

		// Проверка блокировки аккаунта
		if (u && (u as any).lockedUntil && new Date((u as any).lockedUntil) > new Date()) {
			return res.status(403).json({ error: ERROR_MESSAGES.ACCOUNT_LOCKED })
		}

		// Всегда выполняем bcrypt compare для защиты от timing-атак
		const hashToCompare = u?.passwordHash || DUMMY_HASH
		const passwordMatches = await bcrypt.compare(password, hashToCompare)

		// Обработка неуспешного входа: увеличиваем счётчик и блокируем при достижении порога
		if (!u || !passwordMatches) {
			if (u) {
				const current = Number((u as any).failedLoginAttempts ?? (u as any).failed_login_attempts ?? 0) + 1
				const THRESHOLD = 5
				const LOCK_MINUTES = 30
				if (current >= THRESHOLD) {
					await updateLoginGuardFields(u.id, {
						failedLoginAttempts: 0,
						lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60 * 1000),
					})
				} else {
					await updateLoginGuardFields(u.id, { failedLoginAttempts: current })
				}
			}
			return res.status(401).json({ error: ERROR_MESSAGES.INVALID_CREDENTIALS })
		}

		if (!u.isActive) {
			return res.status(403).json({ error: ERROR_MESSAGES.ACCOUNT_NOT_ACTIVATED })
		}

		// Успешный вход - обнуляем счётчики
		if (u) {
			await updateLoginGuardFields(u.id, { failedLoginAttempts: 0, lockedUntil: null })
		}

		// Получаем роли из БД
		const rs = await db.select({ role: userRoles.roleKey }).from(userRoles).where(eq(userRoles.userId, u.id))
		const roles = rs.map((r) => r.role)

		// Create short-lived access token (1 hour default)
		const ACCESS_EXPIRES_SEC = Number(process.env.ACCESS_TOKEN_EXPIRES_SEC ?? 60 * 60)
		const token = jwt.sign({ sub: u.id, login: u.login ?? null, roles }, AUTH_CONFIG.jwtSecret, {
			expiresIn: `${ACCESS_EXPIRES_SEC}s`,
		})

		// Create refresh token and store hash in DB
		const REFRESH_EXPIRES_DAYS = Number(process.env.REFRESH_TOKEN_EXPIRES_DAYS ?? 30)
		const refreshToken = crypto.randomBytes(64).toString('hex')
		const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex')
		const expiresAt = new Date(Date.now() + REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000)

		await db.insert(refreshTokens).values({
			userId: u.id,
			tokenHash: tokenHash,
			expiresAt,
			createdByIp: req.headers['x-forwarded-for']
				? String(req.headers['x-forwarded-for']).split(',')[0].trim()
				: req.socket.remoteAddress || null,
		} as any)

		// Set cookies: access token (short-lived) + refresh token (long-lived)
		setSessionCookie(res, token, ACCESS_EXPIRES_SEC)

		const secure = process.env.NODE_ENV === 'production'
		const refreshParts = [
			`refresh_token=${encodeURIComponent(refreshToken)}`,
			`Path=/api/auth/refresh`,
			`HttpOnly`,
			`SameSite=Lax`,
			`Max-Age=${REFRESH_EXPIRES_DAYS * 24 * 60 * 60}`,
			secure ? 'Secure' : undefined,
		].filter(Boolean)

		const refreshCookie = refreshParts.join('; ')
		const prev = res.getHeader('Set-Cookie')
		if (!prev) {
			res.setHeader('Set-Cookie', refreshCookie)
		} else if (Array.isArray(prev)) {
			res.setHeader('Set-Cookie', [...prev, refreshCookie])
		} else {
			res.setHeader('Set-Cookie', [String(prev), refreshCookie])
		}

		res.json({ ok: true })
	} catch (e) {
		next(e)
	}
})

export default router

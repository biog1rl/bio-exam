import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { Router } from 'express'

import { db } from '../../db/index.js'
import { users } from '../../db/schema.js'
import { ERROR_MESSAGES } from '../../lib/constants.js'
import { rateLimiter } from '../../middleware/rateLimiter.js'
import { loginRateLimiter } from '../../middleware/rateLimiter.js'
import { openSession, setSessionCookies } from '../../services/session/index.js'

const router = Router()

// Фиктивный хэш для защиты от timing-атак
// Заранее вычисленный bcrypt хэш случайной строки для использования когда пользователь не существует
const DUMMY_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy'

async function updateLoginGuardFields(
	userId: string,
	payload: {
		failedLoginAttempts?: number
		lockedUntil?: Date | null
	}
): Promise<void> {
	const updates: Partial<typeof users.$inferInsert> = {}
	if (payload.failedLoginAttempts !== undefined) {
		updates.failedLoginAttempts = payload.failedLoginAttempts
	}
	if (payload.lockedUntil !== undefined) {
		updates.lockedUntil = payload.lockedUntil
	}
	if (Object.keys(updates).length === 0) return
	await db.update(users).set(updates).where(eq(users.id, userId))
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
		if (u && u.lockedUntil && new Date(u.lockedUntil) > new Date()) {
			return res.status(403).json({ error: ERROR_MESSAGES.ACCOUNT_LOCKED })
		}

		// Всегда выполняем bcrypt compare для защиты от timing-атак
		const hashToCompare = u?.passwordHash || DUMMY_HASH
		const passwordMatches = await bcrypt.compare(password, hashToCompare)

		// Обработка неуспешного входа: увеличиваем счётчик и блокируем при достижении порога
		if (!u || !passwordMatches) {
			if (u) {
				const current = (u.failedLoginAttempts ?? 0) + 1
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

		const session = await openSession({
			userId: u.id,
			login: u.login ?? null,
			ip: req.ip || req.socket.remoteAddress || null,
		})
		setSessionCookies(res, { accessToken: session.accessToken, refreshToken: session.refreshToken })

		res.json({ ok: true })
	} catch (e) {
		next(e)
	}
})

export default router

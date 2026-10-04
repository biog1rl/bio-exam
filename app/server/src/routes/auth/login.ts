import bcrypt from 'bcryptjs'
import { and, eq } from 'drizzle-orm'
import { Router } from 'express'
import { z } from 'zod'

import { db } from '../../db/index.js'
import { users } from '../../db/schema.js'
import { BCRYPT_COST, ERROR_MESSAGES } from '../../lib/constants.js'
import { clientIp, recordSuccess, reserveAttempt } from '../../services/login-throttle/index.js'
import { openSession, setSessionCookies } from '../../services/session/index.js'

const router = Router()

const LoginBodySchema = z.object({
	username: z.string().max(64),
	password: z.string().max(1024),
})

function isBlank(value: unknown): boolean {
	return value === undefined || value === null || (typeof value === 'string' && value.trim() === '')
}

// Фиктивный хэш для защиты от timing-атак
// Заранее вычисленный bcrypt хэш случайной строки для использования когда пользователь не существует
const DUMMY_HASH = '$2b$12$mR6tcve9fdb8Mgf.fTH4HO6hRawUCw8Yq9bFJxXdsVD./YF1ZnTG.'

async function upgradePasswordHash(userId: string, password: string, currentHash: string): Promise<void> {
	if (bcrypt.getRounds(currentHash) === BCRYPT_COST) return
	const upgraded = await bcrypt.hash(password, BCRYPT_COST)
	await db
		.update(users)
		.set({ passwordHash: upgraded })
		.where(and(eq(users.id, userId), eq(users.passwordHash, currentHash)))
}

/**
 * POST /api/auth/login
 * body: { username, password }
 *
 * Защищён от timing-атак через constant-time сравнение
 */
router.post('/', async (req, res, next) => {
	try {
		const raw = (req.body ?? {}) as { username?: unknown; password?: unknown }
		if (isBlank(raw.username) || raw.password === undefined || raw.password === null || raw.password === '') {
			return res.status(400).json({ error: ERROR_MESSAGES.MISSING_CREDENTIALS })
		}
		const parsed = LoginBodySchema.safeParse(raw)
		if (!parsed.success) {
			return res.status(400).json({ error: ERROR_MESSAGES.BAD_REQUEST })
		}
		const { password } = parsed.data
		const login = parsed.data.username.toLowerCase().trim()

		const ip = clientIp(req)
		const reserved = await reserveAttempt({ login, ip })
		if (reserved.blocked) {
			res.setHeader('Retry-After', String(reserved.retryAfterSec))
			return res.status(429).json({ error: ERROR_MESSAGES.TOO_MANY_REQUESTS })
		}

		const u = await db.query.users.findFirst({ where: eq(users.login, login) })

		// Всегда выполняем bcrypt compare для защиты от timing-атак
		const hashToCompare = u?.passwordHash || DUMMY_HASH
		const passwordMatches = await bcrypt.compare(password, hashToCompare)

		if (!u || !passwordMatches) {
			return res.status(401).json({ error: ERROR_MESSAGES.INVALID_CREDENTIALS })
		}

		await recordSuccess({ login, ip })

		if (!u.isActive) {
			return res.status(403).json({ error: ERROR_MESSAGES.ACCOUNT_NOT_ACTIVATED })
		}

		try {
			await upgradePasswordHash(u.id, password, hashToCompare)
		} catch (error) {
			req.log?.warn?.({ userId: u.id, err: error, event: 'password_rehash_failed' }, 'password hash upgrade failed')
		}

		const session = await openSession({
			userId: u.id,
			login: u.login ?? null,
			ip: req.ip || req.socket.remoteAddress || null,
		})
		setSessionCookies(res, { accessToken: session.accessToken, refreshToken: session.refreshToken })

		res.json({ ok: true, accessExpiresAt: session.accessExpiresAt.toISOString() })
	} catch (e) {
		next(e)
	}
})

export default router

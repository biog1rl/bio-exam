import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { Router } from 'express'

import { db } from '../../db/index.js'
import { users } from '../../db/schema.js'
import { ERROR_MESSAGES } from '../../lib/constants.js'
import { clientIp, recordSuccess, reserveAttempt } from '../../services/login-throttle/index.js'
import { openSession, setSessionCookies } from '../../services/session/index.js'

const router = Router()

// Фиктивный хэш для защиты от timing-атак
// Заранее вычисленный bcrypt хэш случайной строки для использования когда пользователь не существует
const DUMMY_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy'

/**
 * POST /api/auth/login
 * body: { username, password }
 *
 * Защищён от timing-атак через constant-time сравнение
 */
router.post('/', async (req, res, next) => {
	try {
		const { username, password } = (req.body ?? {}) as { username?: string; password?: string }
		const login = (username ?? '').toLowerCase().trim()
		if (!login || !password) {
			return res.status(400).json({ error: ERROR_MESSAGES.MISSING_CREDENTIALS })
		}

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

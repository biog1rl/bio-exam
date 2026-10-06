import { Router } from 'express'

import { ERROR_MESSAGES } from '../../lib/constants.js'
import { readCookie, REFRESH_COOKIE, rotateRefreshToken, setSessionCookies } from '../../services/session/index.js'

const router = Router()

router.post('/', async (req, res, next) => {
	try {
		const raw = readCookie(req, REFRESH_COOKIE)
		if (!raw) return res.status(401).json({ error: ERROR_MESSAGES.UNAUTHORIZED })

		const result = await rotateRefreshToken({ raw, ip: req.ip || req.socket.remoteAddress || null })
		switch (result.outcome) {
			case 'rotated':
				if (result.regranted) {
					req.log?.info?.(
						{ userId: result.userId, sessionId: result.sessionId, event: 'refresh_regrant' },
						'refresh token reissued after a lost rotation'
					)
				}
				setSessionCookies(res, { accessToken: result.accessToken, refreshToken: result.refreshToken })
				return res.json({ ok: true, accessExpiresAt: result.accessExpiresAt.toISOString() })
			case 'reused':
				setSessionCookies(res, { accessToken: result.accessToken })
				return res.json({ ok: true, accessExpiresAt: result.accessExpiresAt.toISOString() })
			case 'replay':
				req.log?.warn?.(
					{ userId: result.userId, sessionId: result.sessionId, event: 'refresh_replay' },
					'refresh token replay, session revoked'
				)
				return res.status(401).json({ error: ERROR_MESSAGES.UNAUTHORIZED })
			default:
				return res.status(401).json({ error: ERROR_MESSAGES.UNAUTHORIZED })
		}
	} catch (e) {
		next(e)
	}
})

export default router

import { Router } from 'express'

import { ERROR_MESSAGES } from '../../lib/constants.js'
import { readCookie, REFRESH_COOKIE, rotateRefreshToken, setSessionCookies } from '../../services/session/index.js'

const router = Router()

router.post('/', async (req, res, next) => {
	try {
		const raw = readCookie(req, REFRESH_COOKIE)
		if (!raw) return res.status(401).json({ error: ERROR_MESSAGES.UNAUTHORIZED })

		const result = await rotateRefreshToken({ raw, ip: req.ip || req.socket.remoteAddress || null })
		if (result.outcome !== 'rotated') return res.status(401).json({ error: ERROR_MESSAGES.UNAUTHORIZED })

		setSessionCookies(res, { accessToken: result.accessToken, refreshToken: result.refreshToken })
		res.json({ ok: true })
	} catch (e) {
		next(e)
	}
})

export default router

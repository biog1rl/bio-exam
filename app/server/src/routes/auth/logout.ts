import { Router } from 'express'

import {
	ACCESS_COOKIE,
	clearSessionCookies,
	endSession,
	readCookie,
	REFRESH_COOKIE,
} from '../../services/session/index.js'

const router = Router()

router.post('/', async (req, res, next) => {
	let failure: unknown = null
	try {
		await endSession({ accessToken: readCookie(req, ACCESS_COOKIE), refreshToken: readCookie(req, REFRESH_COOKIE) })
	} catch (e) {
		failure = e
	} finally {
		clearSessionCookies(res)
	}
	if (failure) return next(failure)
	res.json({ ok: true })
})

export default router

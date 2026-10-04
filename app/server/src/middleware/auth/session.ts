import { NextFunction, Request, Response } from 'express'

import { ACCESS_COOKIE, loadSessionUser, readCookie, verifyAccessToken } from '../../services/session/index.js'

export type SessionUser = {
	id: string
	login?: string | null
	sessionId: string
}

declare module 'express-serve-static-core' {
	interface Request {
		authUser?: SessionUser | null
	}
}

export function sessionOptional() {
	return async (req: Request, _res: Response, next: NextFunction) => {
		const token = readCookie(req, ACCESS_COOKIE)
		const claims = token ? verifyAccessToken(token) : null
		if (!claims) {
			req.authUser = null
			return next()
		}

		try {
			const user = await loadSessionUser(claims.sessionId, claims.userId)
			req.authUser = user ? { id: user.id, login: user.login, sessionId: claims.sessionId } : null
		} catch (error) {
			return next(error)
		}
		next()
	}
}

export function sessionRequired() {
	const opt = sessionOptional()
	return async (req: Request, res: Response, next: NextFunction) => {
		const proceed = (error?: unknown) => {
			if (error) return next(error)
			if (!req.authUser) return res.status(401).json({ error: 'Unauthorized' })
			next()
		}
		if (req.authUser !== undefined) return proceed()
		await opt(req, res, proceed)
	}
}

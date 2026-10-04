import { eq } from 'drizzle-orm'
import { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'

import { AUTH_CONFIG } from '../../config/auth.js'
import { db } from '../../db/index.js'
import { users } from '../../db/schema.js'

export type SessionUser = {
	id: string
	login?: string | null
}

declare module 'express-serve-static-core' {
	interface Request {
		authUser?: SessionUser | null
	}
}

const { sessionCookieName: COOKIE, jwtSecret: JWT_SECRET } = AUTH_CONFIG

function readCookie(req: Request, name: string): string | null {
	const raw = req.headers.cookie
	if (!raw) return null
	const found = raw
		.split(';')
		.map((p) => p.trim())
		.find((p) => p.startsWith(name + '='))
	if (!found) return null
	try {
		return decodeURIComponent(found.split('=').slice(1).join('='))
	} catch {
		return null
	}
}

export function setSessionCookie(res: Response, token: string, maxAgeSec: number) {
	const secure = process.env.NODE_ENV === 'production'
	const parts = [
		`${COOKIE}=${encodeURIComponent(token)}`,
		`Path=/`,
		`HttpOnly`,
		`SameSite=Lax`,
		`Max-Age=${maxAgeSec}`,
		secure ? 'Secure' : undefined,
	].filter(Boolean)
	res.setHeader('Set-Cookie', parts.join('; '))
}

export function clearSessionCookie(res: Response) {
	const secure = process.env.NODE_ENV === 'production'
	const parts = [`${COOKIE}=`, `Path=/`, `HttpOnly`, `SameSite=Lax`, `Max-Age=0`, secure ? 'Secure' : undefined].filter(
		Boolean
	)
	res.setHeader('Set-Cookie', parts.join('; '))
}

type JwtPayload = { sub?: string }

function verifiedUserId(token: string): string | null {
	try {
		const payload = jwt.verify(token, JWT_SECRET) as JwtPayload
		return typeof payload.sub === 'string' && payload.sub ? payload.sub : null
	} catch {
		return null
	}
}

export function sessionOptional() {
	return async (req: Request, _res: Response, next: NextFunction) => {
		const token = readCookie(req, COOKIE)
		const userId = token ? verifiedUserId(token) : null
		if (!userId) {
			req.authUser = null
			return next()
		}

		try {
			const u = await db.query.users.findFirst({ where: eq(users.id, userId) })
			if (!u || !u.isActive) {
				req.authUser = null
				return next()
			}

			req.authUser = { id: userId, login: u.login }
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

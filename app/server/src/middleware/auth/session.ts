import { normaliseRoleKeys, type RoleKey } from '@bio-exam/rbac'

import { eq } from 'drizzle-orm'
import { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'

import { db } from '../../db/index.js'
import { userRoles, users } from '../../db/schema.js'

export type SessionUser = {
	id: string
	roles: RoleKey[]
	login?: string | null
}

declare module 'express-serve-static-core' {
	interface Request {
		authUser?: SessionUser | null
	}
}

const COOKIE = process.env.SESSION_COOKIE_NAME || 'itsdoc_session'
const AC_COOKIE = 'itsdoc_ac_token'
const JWT_SECRET = process.env.AUTH_JWT_SECRET || 'dev-secret-change-me'

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

// ActiveCollab token cookie helpers
export function setActiveCollabTokenCookie(res: Response, token: string, maxAgeSec: number = 30 * 24 * 60 * 60) {
	const secure = process.env.NODE_ENV === 'production'
	const parts = [
		`${AC_COOKIE}=${encodeURIComponent(token)}`,
		`Path=/`,
		`HttpOnly`,
		`SameSite=Lax`,
		`Max-Age=${maxAgeSec}`,
		secure ? 'Secure' : undefined,
	].filter(Boolean)
	res.setHeader('Set-Cookie', parts.join('; '))
}

export function clearActiveCollabTokenCookie(res: Response) {
	const secure = process.env.NODE_ENV === 'production'
	const parts = [`${AC_COOKIE}=`, `Path=/`, `HttpOnly`, `SameSite=Lax`, `Max-Age=0`, secure ? 'Secure' : undefined].filter(
		Boolean
	)
	res.setHeader('Set-Cookie', parts.join('; '))
}

export function readActiveCollabToken(req: Request): string | null {
	return readCookie(req, AC_COOKIE)
}

type JwtPayload = { sub: string; roles?: string[] } // роли в токене могут быть строками

export function sessionOptional() {
	return async (req: Request, _res: Response, next: NextFunction) => {
		try {
			const token = readCookie(req, COOKIE)
			if (!token) {
				req.authUser = null
				return next()
			}

			const payload = jwt.verify(token, JWT_SECRET) as JwtPayload
			const userId = payload.sub
			if (!userId) {
				req.authUser = null
				return next()
			}

			const u = await db.query.users.findFirst({ where: eq(users.id, userId) })
			if (!u || !u.isActive) {
				req.authUser = null
				return next()
			}

			// Роли из БД -> нормализуем в RoleKey[]
			const rs = await db.select({ role: userRoles.roleKey }).from(userRoles).where(eq(userRoles.userId, userId))
			const dbRoles = normaliseRoleKeys(rs.map((r) => r.role as string))

			// При желании можно объединять с ролями из JWT (если они там есть)
			const jwtRoles = payload.roles ? normaliseRoleKeys(payload.roles) : []
			// Убираем дубли:
			const rolesSet = new Set<RoleKey>([...dbRoles, ...jwtRoles])
			const roles: RoleKey[] = Array.from(rolesSet)

			req.authUser = { id: userId, roles, login: u.login }
			next()
		} catch {
			req.authUser = null
			next()
		}
	}
}

export function sessionRequired() {
	const opt = sessionOptional()
	return async (req: Request, res: Response, next: NextFunction) => {
		await opt(req, res, () => {})
		if (!req.authUser) return res.status(401).json({ error: 'Unauthorized' })
		next()
	}
}

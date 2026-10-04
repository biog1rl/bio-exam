import type { Request } from 'express'

import { AUTH_CONFIG } from '../../config/auth.js'

export const ACCESS_COOKIE = AUTH_CONFIG.sessionCookieName
export const REFRESH_COOKIE = 'refresh_token'

const SECONDS_PER_DAY = 24 * 60 * 60

export type CookieTarget = {
	getHeader(name: string): unknown
	setHeader(name: string, value: string[]): unknown
}

export function readCookie(req: Pick<Request, 'headers'>, name: string): string | null {
	const raw = req.headers.cookie
	if (!raw) return null
	const found = raw
		.split(';')
		.map((part) => part.trim())
		.find((part) => part.startsWith(name + '='))
	if (!found) return null
	try {
		return decodeURIComponent(found.split('=').slice(1).join('='))
	} catch {
		return null
	}
}

export function appendSetCookie(res: CookieTarget, cookie: string): void {
	const previous = res.getHeader('Set-Cookie')
	const list =
		previous === undefined || previous === null
			? []
			: Array.isArray(previous)
				? previous.map(String)
				: [String(previous)]
	res.setHeader('Set-Cookie', [...list, cookie])
}

export function serializeSessionCookie(name: string, value: string, maxAgeSec: number): string {
	return [
		`${name}=${encodeURIComponent(value)}`,
		'Path=/',
		'HttpOnly',
		'SameSite=Lax',
		`Max-Age=${maxAgeSec}`,
		process.env.NODE_ENV === 'production' ? 'Secure' : undefined,
	]
		.filter(Boolean)
		.join('; ')
}

export function setSessionCookies(res: CookieTarget, tokens: { accessToken: string; refreshToken?: string }): void {
	appendSetCookie(res, serializeSessionCookie(ACCESS_COOKIE, tokens.accessToken, AUTH_CONFIG.accessTokenTtlSec))
	if (tokens.refreshToken !== undefined) {
		appendSetCookie(
			res,
			serializeSessionCookie(REFRESH_COOKIE, tokens.refreshToken, AUTH_CONFIG.refreshTokenTtlDays * SECONDS_PER_DAY)
		)
	}
}

export function clearSessionCookies(res: CookieTarget): void {
	appendSetCookie(res, serializeSessionCookie(ACCESS_COOKIE, '', 0))
	appendSetCookie(res, serializeSessionCookie(REFRESH_COOKIE, '', 0))
}

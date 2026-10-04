import jwt from 'jsonwebtoken'
import crypto from 'node:crypto'

import { AUTH_CONFIG } from '../../config/auth.js'

export type AccessClaims = {
	userId: string
	sessionId: string
	login: string | null
	expiresAt: Date | null
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUuid(value: unknown): value is string {
	return typeof value === 'string' && UUID_PATTERN.test(value)
}

export function signAccessToken(input: { userId: string; sessionId: string; login: string | null }): {
	token: string
	expiresAt: Date
} {
	const issuedAtSec = Math.floor(Date.now() / 1000)
	const expiresAtSec = issuedAtSec + AUTH_CONFIG.accessTokenTtlSec
	const token = jwt.sign(
		{ sub: input.userId, sid: input.sessionId, login: input.login, iat: issuedAtSec, exp: expiresAtSec },
		AUTH_CONFIG.jwtSecret,
		{ algorithm: 'HS256' }
	)
	return { token, expiresAt: new Date(expiresAtSec * 1000) }
}

export function verifyAccessToken(token: string, options: { allowExpired?: boolean } = {}): AccessClaims | null {
	let payload: unknown
	try {
		payload = jwt.verify(token, AUTH_CONFIG.jwtSecret, {
			algorithms: ['HS256'],
			ignoreExpiration: options.allowExpired === true,
		})
	} catch {
		return null
	}
	if (typeof payload !== 'object' || payload === null) return null
	const { sub, sid, login, exp } = payload as Record<string, unknown>
	if (!isUuid(sub) || !isUuid(sid)) return null
	return {
		userId: sub,
		sessionId: sid,
		login: typeof login === 'string' ? login : null,
		expiresAt: typeof exp === 'number' ? new Date(exp * 1000) : null,
	}
}

export function hashRefreshToken(raw: string): string {
	return crypto.createHash('sha256').update(raw).digest('hex')
}

export function newRefreshToken(): { raw: string; hash: string } {
	const raw = crypto.randomBytes(64).toString('hex')
	return { raw, hash: hashRefreshToken(raw) }
}

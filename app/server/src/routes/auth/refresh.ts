import crypto from 'node:crypto'

import { eq } from 'drizzle-orm'
import { Router } from 'express'
import jwt from 'jsonwebtoken'

import { AUTH_CONFIG } from '../../config/auth.js'
import { db } from '../../db/index.js'
import { refreshTokens, userRoles } from '../../db/schema.js'
import { ERROR_MESSAGES } from '../../lib/constants.js'
import { setSessionCookie } from '../../middleware/auth/session.js'

const router = Router()

function readCookie(req: any, name: string): string | null {
	const raw = req.headers.cookie
	if (!raw) return null
	const found = raw
		.split(';')
		.map((p: string) => p.trim())
		.find((p: string) => p.startsWith(name + '='))
	if (!found) return null
	try {
		return decodeURIComponent(found.split('=').slice(1).join('='))
	} catch {
		return null
	}
}

router.post('/', async (req, res) => {
	try {
		const raw = readCookie(req, 'refresh_token')
		if (!raw) return res.status(401).json({ error: ERROR_MESSAGES.UNAUTHORIZED })

		const tokenHash = crypto.createHash('sha256').update(raw).digest('hex')

		// find token
		const rows = await db
			.select()
			.from(refreshTokens)
			.where(eq(refreshTokens.tokenHash, tokenHash))
			.limit(1)
		const row = rows[0]
		if (!row) return res.status(401).json({ error: ERROR_MESSAGES.UNAUTHORIZED })

		if (row.revokedAt) return res.status(401).json({ error: ERROR_MESSAGES.UNAUTHORIZED })
		if (new Date(row.expiresAt) < new Date()) return res.status(401).json({ error: ERROR_MESSAGES.UNAUTHORIZED })

		// Issue new access token
		const rs = await db.select({ role: userRoles.roleKey }).from(userRoles).where(eq(userRoles.userId, row.userId))
		const roles = rs.map((r) => r.role)

		const ACCESS_EXPIRES_SEC = Number(process.env.ACCESS_TOKEN_EXPIRES_SEC ?? 60 * 60)
		const token = jwt.sign({ sub: row.userId, roles }, AUTH_CONFIG.jwtSecret, { expiresIn: `${ACCESS_EXPIRES_SEC}s` })

		setSessionCookie(res, token, ACCESS_EXPIRES_SEC)

		// Optionally rotate refresh token: create new and revoke old
		const REFRESH_EXPIRES_DAYS = Number(process.env.REFRESH_TOKEN_EXPIRES_DAYS ?? 30)
		const newRefresh = crypto.randomBytes(64).toString('hex')
		const newHash = crypto.createHash('sha256').update(newRefresh).digest('hex')
		const newExpires = new Date(Date.now() + REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000)

		await db
			.update(refreshTokens)
			.set({ revokedAt: new Date() } as any)
			.where(eq(refreshTokens.id, row.id))
		await db
			.insert(refreshTokens)
			.values({
				userId: row.userId,
				tokenHash: newHash,
				expiresAt: newExpires,
				createdByIp: req.headers['x-forwarded-for']
					? String(req.headers['x-forwarded-for']).split(',')[0].trim()
					: req.socket.remoteAddress || null,
			} as any)

		const secure = process.env.NODE_ENV === 'production'
		const refreshParts = [
			`refresh_token=${encodeURIComponent(newRefresh)}`,
			`Path=/api/auth/refresh`,
			`HttpOnly`,
			`SameSite=Lax`,
			`Max-Age=${REFRESH_EXPIRES_DAYS * 24 * 60 * 60}`,
			secure ? 'Secure' : undefined,
		].filter(Boolean)

		const refreshCookie = refreshParts.join('; ')
		const prev = res.getHeader('Set-Cookie')
		if (!prev) {
			res.setHeader('Set-Cookie', refreshCookie)
		} else if (Array.isArray(prev)) {
			res.setHeader('Set-Cookie', [...prev, refreshCookie])
		} else {
			res.setHeader('Set-Cookie', [String(prev), refreshCookie])
		}

		res.json({ ok: true })
	} catch (e) {
		// eslint-disable-next-line no-console
		console.error('Refresh token error', e)
		res.status(500).json({ error: 'Internal Server Error' })
	}
})

export default router

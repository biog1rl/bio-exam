import crypto from 'node:crypto'

import { eq } from 'drizzle-orm'
import { Router } from 'express'

import { db } from '../../db/index.js'
import { refreshTokens } from '../../db/schema.js'
import { clearSessionCookie } from '../../middleware/auth/session.js'

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
		// Revoke refresh token if present
		const raw = readCookie(req, 'refresh_token')
		if (raw) {
			const tokenHash = crypto.createHash('sha256').update(raw).digest('hex')
			await db
				.update(refreshTokens)
				.set({ revokedAt: new Date() } as any)
				.where(eq(refreshTokens.tokenHash, tokenHash))
		}

		clearSessionCookie(res)
		// Clear refresh cookie
		const secure = process.env.NODE_ENV === 'production'
		const parts = [
			`refresh_token=`,
			`Path=/api/auth/refresh`,
			`HttpOnly`,
			`SameSite=Lax`,
			`Max-Age=0`,
			secure ? 'Secure' : undefined,
		].filter(Boolean)
		res.setHeader('Set-Cookie', parts.join('; '))

		res.json({ ok: true })
	} catch (e) {
		// eslint-disable-next-line no-console
		console.error('Logout error', e)
		res.status(500).json({ error: 'Internal Server Error' })
	}
})

export default router

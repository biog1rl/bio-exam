import bcrypt from 'bcryptjs'
import type { Request, Response, NextFunction } from 'express'

// Расширяем тип Request — без any
declare module 'express-serve-static-core' {
	interface Request {
		adminUser?: string
	}
}

/**
 * Проверяет Authorization: Basic ... по ADMIN_LOGIN + ADMIN_PASSWORD_HASH/ADMIN_PASSWORD.
 */
export async function requireAdminBasic(req: Request, res: Response, next: NextFunction): Promise<void> {
	const login = process.env.ADMIN_LOGIN
	const pwdHash = process.env.ADMIN_PASSWORD_HASH
	const plain = process.env.ADMIN_PASSWORD // fallback только для DEV

	if (!login || (!pwdHash && !plain)) {
		res.status(500).json({
			error: 'Admin basic auth is not configured. Set ADMIN_LOGIN and ADMIN_PASSWORD_HASH (bcrypt) or ADMIN_PASSWORD.',
		})
		return
	}

	const header = req.headers['authorization'] || ''
	const m = header.match(/^Basic\s+(.+)$/i)
	if (!m) {
		res.status(401).json({ error: 'Admin auth required' })
		return
	}

	const decoded = Buffer.from(m[1], 'base64').toString('utf8')
	const sep = decoded.indexOf(':')
	const u = sep >= 0 ? decoded.slice(0, sep) : decoded
	const p = sep >= 0 ? decoded.slice(sep + 1) : ''

	if (u !== login) {
		res.status(403).json({ error: 'Invalid credentials' })
		return
	}

	let ok = false
	if (pwdHash) ok = await bcrypt.compare(p, pwdHash)
	else ok = p === (plain as string)

	if (!ok) {
		res.status(403).json({ error: 'Invalid credentials' })
		return
	}

	req.adminUser = u
	next()
}

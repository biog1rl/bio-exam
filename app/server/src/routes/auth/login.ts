import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { Router } from 'express'
import jwt from 'jsonwebtoken'

import { db } from '../../db/index.js'
import { users, userRoles } from '../../db/schema.js'
import { setSessionCookie } from '../../middleware/auth/session.js'

const router = Router()

const JWT_SECRET = process.env.AUTH_JWT_SECRET || 'dev-secret-change-me'
const SESSION_MAX_AGE_DAYS = Number(process.env.SESSION_MAX_AGE_DAYS ?? 30)

/**
 * POST /api/auth/login
 * body: { username, password }
 * username = login (email Сѓ С‚РµР±СЏ СѓР¶Рµ СѓРґР°Р»С‘РЅ)
 */
router.post('/', async (req, res, next) => {
	try {
		const { username, password } = (req.body ?? {}) as { username?: string; password?: string }
		const login = (username ?? '').toLowerCase().trim()
		if (!login || !password) return res.status(400).json({ error: 'Missing credentials' })

		const u = await db.query.users.findFirst({ where: eq(users.login, login) })
		if (!u) return res.status(401).json({ error: 'Invalid credentials' })
		if (!u.isActive) return res.status(403).json({ error: 'Account is not activated' })

		const ok = u.passwordHash ? await bcrypt.compare(password, u.passwordHash) : false
		if (!ok) return res.status(401).json({ error: 'Invalid credentials' })

		// СЂРѕР»Рё РїРѕР»РѕР¶РёРј РІ С‚РѕРєРµРЅ РґР»СЏ СѓРґРѕР±СЃС‚РІР° (РёСЃС‚РёРЅР° РІСЃС‘ СЂР°РІРЅРѕ РІ Р‘Р”)
		const rs = await db.select({ role: userRoles.roleKey }).from(userRoles).where(eq(userRoles.userId, u.id))
		const roles = rs.map((r) => r.role)

		const token = jwt.sign({ sub: u.id, login: u.login ?? null, roles }, JWT_SECRET, {
			expiresIn: `${SESSION_MAX_AGE_DAYS}d`,
		})

		setSessionCookie(res, token, SESSION_MAX_AGE_DAYS * 24 * 60 * 60)
		res.json({ ok: true })
	} catch (e) {
		next(e)
	}
})

export default router



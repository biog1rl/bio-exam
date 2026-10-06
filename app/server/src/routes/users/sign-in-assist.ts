import { eq } from 'drizzle-orm'
import { Router, type Response } from 'express'

import { db } from '../../db/index.js'
import { users } from '../../db/schema.js'
import { ERROR_MESSAGES } from '../../lib/constants.js'
import { sessionRequired } from '../../middleware/auth/session.js'
import { validateUUID } from '../../middleware/validateParams.js'
import { canAssistSignIn } from '../../services/access-policy/index.js'
import { clearForLogin } from '../../services/login-throttle/index.js'
import { revokeUserSessions } from '../../services/session/index.js'

const router = Router()

async function existingUser(id: string, res: Response): Promise<{ login: string | null } | null> {
	const [user] = await db.select({ login: users.login }).from(users).where(eq(users.id, id)).limit(1)
	if (!user) res.status(404).json({ error: ERROR_MESSAGES.USER_NOT_FOUND })
	return user ?? null
}

router.post('/:id/sessions/revoke', validateUUID('id'), sessionRequired(), async (req, res, next) => {
	try {
		const id = req.params.id as string
		if (!(await canAssistSignIn(req, id))) return res.status(403).json({ error: 'Forbidden' })
		if (!(await existingUser(id, res))) return

		const revoked = await revokeUserSessions(id, { reason: 'admin' })
		return res.json({ ok: true, revoked })
	} catch (e) {
		next(e)
	}
})

router.delete('/:id/login-throttle', validateUUID('id'), sessionRequired(), async (req, res, next) => {
	try {
		const id = req.params.id as string
		if (!(await canAssistSignIn(req, id))) return res.status(403).json({ error: 'Forbidden' })
		const user = await existingUser(id, res)
		if (!user) return

		const normalizedLogin = (user.login ?? '').toLowerCase().trim()
		const cleared = normalizedLogin ? await clearForLogin(normalizedLogin) : 0
		return res.json({ ok: true, cleared })
	} catch (e) {
		next(e)
	}
})

export default router

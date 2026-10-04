import { eq } from 'drizzle-orm'
import { Router } from 'express'

import { db } from '../../db/index.js'
import { users } from '../../db/schema.js'
import { ERROR_MESSAGES } from '../../lib/constants.js'
import { sessionRequired } from '../../middleware/auth/session.js'
import { validateUUID } from '../../middleware/validateParams.js'
import { canAssistSignIn } from '../../services/access-policy/index.js'
import { revokeUserSessions } from '../../services/session/index.js'

const router = Router()

router.post('/:id/sessions/revoke', validateUUID('id'), sessionRequired(), async (req, res, next) => {
	try {
		const id = req.params.id as string
		if (!(await canAssistSignIn(req, id))) return res.status(403).json({ error: 'Forbidden' })
		const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1)
		if (!existing) return res.status(404).json({ error: ERROR_MESSAGES.USER_NOT_FOUND })

		const revoked = await revokeUserSessions(id, { reason: 'admin' })
		return res.json({ ok: true, revoked })
	} catch (e) {
		next(e)
	}
})

export default router

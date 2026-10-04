import { eq } from 'drizzle-orm'
import { Router } from 'express'

import { db } from '../../db/index.js'
import { users } from '../../db/schema.js'
import { ERROR_MESSAGES } from '../../lib/constants.js'
import { requirePerm } from '../../middleware/auth/requirePerm.js'
import { sessionRequired } from '../../middleware/auth/session.js'
import { validateUUID } from '../../middleware/validateParams.js'
import { clearForLogin } from '../../services/login-throttle/index.js'

const router = Router()

router.delete(
	'/:id/login-throttle',
	validateUUID('id'),
	sessionRequired(),
	requirePerm('users', 'edit'),
	async (req, res, next) => {
		try {
			const id = req.params.id as string
			const [existing] = await db
				.select({ id: users.id, login: users.login })
				.from(users)
				.where(eq(users.id, id))
				.limit(1)
			if (!existing) return res.status(404).json({ error: ERROR_MESSAGES.USER_NOT_FOUND })

			const normalizedLogin = (existing.login ?? '').toLowerCase().trim()
			const cleared = normalizedLogin ? await clearForLogin(normalizedLogin) : 0
			return res.json({ ok: true, cleared })
		} catch (e) {
			next(e)
		}
	}
)

export default router

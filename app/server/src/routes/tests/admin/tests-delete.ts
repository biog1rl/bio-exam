import { Router } from 'express'

import { isApiError } from '../../../lib/errors.js'
import { sessionRequired } from '../../../middleware/auth/session.js'
import { validateUUID } from '../../../middleware/validateParams.js'
import { canWriteTest, hasGlobalZone } from '../../../services/access-policy/index.js'
import { deleteTest } from '../../../services/question-content/index.js'

const router = Router()

router.delete('/:id', validateUUID('id'), sessionRequired(), async (req, res, next) => {
	try {
		const id = req.params.id as string
		if (!(await canWriteTest(req, id))) {
			return res.status(403).json({ error: 'Forbidden' })
		}

		await deleteTest({ testId: id, refuseWithAttempts: !(await hasGlobalZone(req)) })

		return res.json({ ok: true })
	} catch (e) {
		if (isApiError(e) && e.statusCode < 500) return res.status(e.statusCode).json({ error: e.message })
		return next(e)
	}
})

export { router as testsDeleteRouter }

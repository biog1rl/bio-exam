import { Router } from 'express'

import { sessionRequired } from '../../../middleware/auth/session.js'
import { canReadTest, testScope } from '../../../services/access-policy/index.js'
import { readAdminTest } from '../../../services/question-content/index.js'

const router = Router()

router.get('/by-slug/:topicSlug/:testSlug', sessionRequired(), async (req, res, next) => {
	try {
		const scope = await testScope(req)
		if (!scope.all && scope.topicIds.length === 0) {
			return res.status(403).json({ error: 'Forbidden' })
		}

		const { topicSlug, testSlug } = req.params as { topicSlug: string; testSlug: string }
		res.json(
			await readAdminTest(
				{ topicSlug, testSlug },
				{
					view: req.query.view === 'summary' ? 'summary' : undefined,
					canRead: (testId) => canReadTest(req, testId),
				}
			)
		)
	} catch (e) {
		next(e)
	}
})

export { router as testsBySlugRouter }

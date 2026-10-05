import { Router } from 'express'

import { sessionRequired } from '../../../middleware/auth/session.js'
import { validateUUID } from '../../../middleware/validateParams.js'
import { canReadTest, canWriteTest, canWriteTopic, testScope } from '../../../services/access-policy/index.js'
import { prepareTestArchive, prepareTopicArchive } from '../../../services/question-content/index.js'
import { sendArchive } from '../export-response.js'

const router = Router()

router.get('/:id/export', validateUUID('id'), sessionRequired(), async (req, res, next) => {
	try {
		const id = req.params.id as string
		if (!(await canReadTest(req, id))) return res.status(403).json({ error: 'Forbidden' })

		const withAnswers = req.query.withAnswers === 'true' && (await canWriteTest(req, id))
		const prepared = await prepareTestArchive({ testId: id, withAnswers })
		return await sendArchive(req, res, prepared)
	} catch (e) {
		return next(e)
	}
})

router.get('/topics/:slug/export', sessionRequired(), async (req, res, next) => {
	try {
		const scope = await testScope(req)
		if (!scope.all && scope.topicIds.length === 0) return res.status(403).json({ error: 'Forbidden' })

		const withAnswers = req.query.withAnswers === 'true'
		const prepared = await prepareTopicArchive({
			topicSlug: req.params.slug as string,
			withAnswers,
			scope,
			answersAllowed: (topicId) => canWriteTopic(req, topicId),
		})
		return await sendArchive(req, res, prepared)
	} catch (e) {
		return next(e)
	}
})

export { router as exportRouter }

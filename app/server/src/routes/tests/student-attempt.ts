import { Router } from 'express'

import { sessionRequired } from '../../middleware/auth/session.js'
import { validateUUID } from '../../middleware/validateParams.js'
import { listAttemptAnswerPhotos } from '../../services/answer-photos/attempt-photos.js'
import { readLatestReviews } from '../../services/answer-reviews/index.js'
import { findOwnAttempt } from '../../services/attempt-sessions/index.js'
import { readAttemptView } from '../../services/scored-attempt/index.js'
import { readStudentQuestions } from './student-question-view.js'

const router = Router()

router.get('/attempts/:attemptId', validateUUID('attemptId'), sessionRequired(), async (req, res, next) => {
	try {
		const attemptId = req.params.attemptId as string
		const own = await findOwnAttempt(attemptId, req.authUser!.id)
		if (!own) return res.status(404).json({ error: 'Attempt not found' })

		const attempt = await readAttemptView(
			attemptId,
			{ kind: 'student', showCorrectAnswer: own.test.showCorrectAnswer },
			readLatestReviews
		)
		const questions = await readStudentQuestions({
			id: own.test.id,
			slug: own.test.slug,
			topicSlug: own.test.topicSlug,
		})
		const openIds = questions
			.filter((question) => question.questionUiTemplate === 'open')
			.map((question) => question.id)
		const photos = await listAttemptAnswerPhotos({ attemptId, sessionId: own.sessionId, questionIds: openIds })

		return res.json({ attempt, test: own.test, questions, photos: Object.fromEntries(photos) })
	} catch (e) {
		return next(e)
	}
})

export default router

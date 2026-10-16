import { OpenReviewRequestSchema, REVIEW_ERROR_CODES } from '@bio-exam/exam-core'

import { Router } from 'express'

import { ERROR_MESSAGES } from '../../../lib/constants.js'
import { sessionRequired } from '../../../middleware/auth/session.js'
import { validateUUID } from '../../../middleware/validateParams.js'
import { canReviewAttempt } from '../../../services/access-policy/index.js'
import { saveAnswerReview } from '../../../services/answer-reviews/index.js'

const router = Router()

router.post(
	'/admin/attempts/:attemptId/questions/:questionId/review',
	validateUUID('attemptId'),
	validateUUID('questionId'),
	sessionRequired(),
	async (req, res, next) => {
		try {
			const attemptId = req.params.attemptId as string
			const questionId = req.params.questionId as string

			if (!(await canReviewAttempt(req, attemptId))) {
				return res.status(403).json({ error: 'Forbidden' })
			}

			const parsed = OpenReviewRequestSchema.safeParse(req.body)
			if (!parsed.success) {
				return res.status(400).json({ error: ERROR_MESSAGES.BAD_REQUEST, details: parsed.error.flatten() })
			}

			const outcome = await saveAnswerReview({
				attemptId,
				questionId,
				reviewerId: req.authUser!.id,
				score: parsed.data.score,
				comment: parsed.data.comment,
			})

			switch (outcome.kind) {
				case 'not_found':
					return res.status(404).json({ error: 'Attempt not found' })
				case 'own_attempt':
					return res.status(403).json({ error: 'OWN_ATTEMPT' })
				case 'not_ready':
					return res.status(409).json({ error: REVIEW_ERROR_CODES.notReady })
				case 'not_open_question':
					return res.status(404).json({ error: 'Question not found' })
				case 'saved':
					return res.json({ review: outcome.review, attempt: outcome.attempt })
			}
		} catch (e) {
			next(e)
		}
	}
)

export { router as reviewsRouter }

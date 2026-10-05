import { Router } from 'express'

import { ERROR_MESSAGES } from '../../../lib/constants.js'
import { sessionRequired } from '../../../middleware/auth/session.js'
import { validateUUID } from '../../../middleware/validateParams.js'
import { MoveQuestionSchema, ReorderQuestionsSchema, SaveQuestionSchema } from '../../../schemas/tests.js'
import { canWriteTest, canWriteTopic } from '../../../services/access-policy/index.js'
import {
	createQuestion,
	deleteQuestion,
	moveQuestion,
	reorderQuestions,
	updateQuestion,
} from '../../../services/question-content/index.js'

const router = Router()

router.post('/:id/questions', validateUUID('id'), sessionRequired(), async (req, res, next) => {
	try {
		const testId = req.params.id as string
		if (!(await canWriteTest(req, testId))) {
			return res.status(403).json({ error: 'Forbidden' })
		}
		const parsed = SaveQuestionSchema.safeParse(req.body)
		if (!parsed.success) {
			return res.status(400).json({ error: ERROR_MESSAGES.BAD_REQUEST, details: parsed.error.flatten() })
		}

		const result = await createQuestion({ testId, data: parsed.data, userId: req.authUser?.id ?? null })

		return res.status(201).json({
			ok: true,
			questionId: result.questionId,
			order: result.order,
		})
	} catch (e) {
		return next(e)
	}
})

router.patch(
	'/:id/questions/:questionId',
	validateUUID('id'),
	validateUUID('questionId'),
	sessionRequired(),
	async (req, res, next) => {
		try {
			const testId = req.params.id as string
			const questionId = req.params.questionId as string
			if (!(await canWriteTest(req, testId))) {
				return res.status(403).json({ error: 'Forbidden' })
			}
			const parsed = SaveQuestionSchema.safeParse(req.body)
			if (!parsed.success) {
				return res.status(400).json({ error: ERROR_MESSAGES.BAD_REQUEST, details: parsed.error.flatten() })
			}

			await updateQuestion({ testId, questionId, data: parsed.data, userId: req.authUser?.id ?? null })

			return res.json({ ok: true, questionId })
		} catch (e) {
			return next(e)
		}
	}
)

router.put('/:id/questions/reorder', validateUUID('id'), sessionRequired(), async (req, res, next) => {
	try {
		const testId = req.params.id as string
		if (!(await canWriteTest(req, testId))) {
			return res.status(403).json({ error: 'Forbidden' })
		}
		const parsed = ReorderQuestionsSchema.safeParse(req.body)
		if (!parsed.success) {
			return res.status(400).json({ error: ERROR_MESSAGES.BAD_REQUEST, details: parsed.error.flatten() })
		}

		await reorderQuestions({ testId, questionIds: parsed.data.questionIds, userId: req.authUser?.id ?? null })

		return res.json({ ok: true })
	} catch (e) {
		return next(e)
	}
})

router.post(
	'/:id/questions/:questionId/move',
	validateUUID('id'),
	validateUUID('questionId'),
	sessionRequired(),
	async (req, res, next) => {
		try {
			const sourceTestId = req.params.id as string
			const questionId = req.params.questionId as string
			if (!(await canWriteTest(req, sourceTestId))) {
				return res.status(403).json({ error: 'Forbidden' })
			}
			const parsed = MoveQuestionSchema.safeParse(req.body)
			if (!parsed.success) {
				return res.status(400).json({ error: ERROR_MESSAGES.BAD_REQUEST, details: parsed.error.flatten() })
			}
			const { targetTestId, targetTopicId } = parsed.data
			const targetAllowed = targetTestId
				? await canWriteTest(req, targetTestId)
				: await canWriteTopic(req, targetTopicId as string)
			if (!targetAllowed) {
				return res.status(403).json({ error: 'Forbidden' })
			}

			const { target } = await moveQuestion({
				sourceTestId,
				questionId,
				targetTestId,
				targetTopicId,
				userId: req.authUser?.id ?? null,
			})

			return res.json({ ok: true, questionId, target })
		} catch (e) {
			return next(e)
		}
	}
)

router.delete(
	'/:id/questions/:questionId',
	validateUUID('id'),
	validateUUID('questionId'),
	sessionRequired(),
	async (req, res, next) => {
		try {
			const testId = req.params.id as string
			const questionId = req.params.questionId as string
			if (!(await canWriteTest(req, testId))) {
				return res.status(403).json({ error: 'Forbidden' })
			}

			const { assetsDeleted } = await deleteQuestion({ testId, questionId, userId: req.authUser?.id ?? null })

			return res.json({ ok: true, questionId, assetsDeleted })
		} catch (e) {
			return next(e)
		}
	}
)

export { router as questionsRouter }

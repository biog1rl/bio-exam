import { Router } from 'express'

import { ERROR_MESSAGES } from '../../../lib/constants.js'
import { getQuestionTypeMapForTest, validateQuestionWithType } from '../../../lib/tests/question-type-resolver.js'
import { sessionRequired } from '../../../middleware/auth/session.js'
import { validateUUID } from '../../../middleware/validateParams.js'
import { SaveTestSchema, UpdateTestSettingsSchema } from '../../../schemas/tests.js'
import { canReadTest, canWriteTest, canWriteTopic } from '../../../services/access-policy/index.js'
import { createTestWithQuestions, readAdminTest, updateTestSettings } from '../../../services/question-content/index.js'
import { ensureGlobalScoringRules } from './shared.js'

const router = Router()

router.get('/:id', validateUUID('id'), sessionRequired(), async (req, res, next) => {
	try {
		const id = req.params.id as string
		if (!(await canReadTest(req, id))) {
			return res.status(403).json({ error: 'Forbidden' })
		}

		res.json(await readAdminTest({ testId: id }))
	} catch (e) {
		next(e)
	}
})

router.post('/save', sessionRequired(), async (req, res, next) => {
	try {
		if (!(await canWriteTopic(req, String(req.body?.topicId ?? '')))) {
			return res.status(403).json({ error: 'Forbidden' })
		}

		const parsed = SaveTestSchema.safeParse(req.body)
		if (!parsed.success) {
			return res.status(400).json({ error: ERROR_MESSAGES.BAD_REQUEST, details: parsed.error.flatten() })
		}

		const userId = req.authUser?.id ?? null
		const data = parsed.data
		await ensureGlobalScoringRules(userId)
		const globalQuestionTypesMap = await getQuestionTypeMapForTest({ includeInactive: true })

		for (let index = 0; index < data.questions.length; index++) {
			const question = data.questions[index]
			const questionValidationError = validateQuestionWithType(question, globalQuestionTypesMap)
			if (questionValidationError) {
				return res.status(400).json({
					error: ERROR_MESSAGES.BAD_REQUEST,
					details: {
						formErrors: [],
						fieldErrors: {
							questions: [`Вопрос ${index + 1}: ${questionValidationError}`],
						},
					},
				})
			}
		}

		const { test, topicSlug } = await createTestWithQuestions({ data, userId, typeMap: globalQuestionTypesMap })

		res.status(201).json({ test: { ...test, topicSlug } })
	} catch (e) {
		next(e)
	}
})

router.patch('/:id/settings', validateUUID('id'), sessionRequired(), async (req, res, next) => {
	try {
		const testId = req.params.id as string
		if (!(await canWriteTest(req, testId))) {
			return res.status(403).json({ error: 'Forbidden' })
		}
		const parsed = UpdateTestSettingsSchema.safeParse(req.body)
		if (!parsed.success) {
			return res.status(400).json({ error: ERROR_MESSAGES.BAD_REQUEST, details: parsed.error.flatten() })
		}
		const data = parsed.data
		if (!(await canWriteTopic(req, data.topicId))) {
			return res.status(403).json({ error: 'Forbidden' })
		}

		const userId = req.authUser?.id ?? null
		await ensureGlobalScoringRules(userId)
		const { test, topicSlug, assetsMoved } = await updateTestSettings({ testId, data, userId })

		return res.json({ test: { ...test, topicSlug }, ...(assetsMoved ? { assetsMoved } : {}) })
	} catch (e) {
		return next(e)
	}
})

export { router as testsCoreRouter }

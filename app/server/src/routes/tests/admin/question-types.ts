import {
	QUESTION_UI_TEMPLATES,
	QuestionTypeDefinitionSchema,
	QuestionTypeScoringRuleSchema,
	QuestionTypeValidationSchema,
	getBuiltinQuestionTypeByKey,
	isAutoScoredTemplate,
} from '@bio-exam/exam-core'

import { and, eq } from 'drizzle-orm'
import { Router } from 'express'
import { isDeepStrictEqual } from 'node:util'
import { z } from 'zod'

import { db } from '../../../db/index.js'
import { questionTypes, testQuestionTypeOverrides, tests } from '../../../db/schema.js'
import { ERROR_MESSAGES } from '../../../lib/constants.js'
import {
	getEffectiveQuestionTypesForTest,
	getGlobalQuestionTypes,
	questionTypeToDefinition,
	readTestOverrides,
} from '../../../lib/tests/question-type-resolver.js'
import { requirePerm } from '../../../middleware/auth/requirePerm.js'
import { sessionRequired } from '../../../middleware/auth/session.js'
import { validateUUID } from '../../../middleware/validateParams.js'
import { canManageCatalog, canReadTest, canWriteTest } from '../../../services/access-policy/index.js'
import {
	syncQuestionPointsForTestByTypeConfig,
	syncQuestionPointsForTests,
	validateScoringRuleTemplateCompatibility,
} from './shared.js'

const router = Router()

const OPEN_TYPE_UNAVAILABLE_MESSAGE = 'Открытые вопросы пока недоступны'
const OPEN_TYPE_SCORING_FIXED_MESSAGE = 'Баллы за открытый вопрос выставляет учитель: от 0 до 3'
const OPEN_TYPE_SYSTEM_ONLY_MESSAGE = 'Открытый тип вопроса создаётся системой'

const QuestionTypeKeySchema = z
	.string()
	.min(1)
	.max(100)
	.regex(/^[a-z0-9_]+$/)

const CreateQuestionTypePayloadSchema = z.object({
	key: QuestionTypeKeySchema,
	title: z.string().min(1).max(120),
	description: z.string().max(500).optional().nullable(),
	uiTemplate: z.enum(QUESTION_UI_TEMPLATES),
	validationSchema: QuestionTypeValidationSchema,
	scoringRule: QuestionTypeScoringRuleSchema,
	isActive: z.boolean().optional(),
})

const UpdateQuestionTypePayloadSchema = z.object({
	title: z.string().min(1).max(120).optional(),
	description: z.string().max(500).optional().nullable(),
	uiTemplate: z.enum(QUESTION_UI_TEMPLATES).optional(),
	validationSchema: QuestionTypeValidationSchema.optional(),
	scoringRule: QuestionTypeScoringRuleSchema.optional(),
	isActive: z.boolean().optional(),
})

const PutTestQuestionTypeOverrideSchema = z.object({
	titleOverride: z.string().max(120).optional().nullable(),
	scoringRuleOverride: QuestionTypeScoringRuleSchema.optional().nullable(),
	isDisabled: z.boolean().optional(),
})

router.get('/question-types', sessionRequired(), requirePerm('tests', 'read'), async (req, res, next) => {
	try {
		const testId = typeof req.query.testId === 'string' ? req.query.testId : undefined
		const includeInactive = req.query.includeInactive === 'true'

		if (testId) {
			if (!(await canReadTest(req, testId))) return res.status(403).json({ error: 'Forbidden' })
			const test = await db.query.tests.findFirst({ where: eq(tests.id, testId) })
			if (!test) return res.status(404).json({ error: ERROR_MESSAGES.TEST_NOT_FOUND })

			const resolved = await getEffectiveQuestionTypesForTest({ testId, includeInactive })
			const overrides = await readTestOverrides(testId)
			const overridesMap = new Map(overrides.map((item) => [item.questionTypeKey, item]))

			return res.json({
				scope: 'test',
				testId,
				questionTypes: resolved.map((item) => {
					const override = overridesMap.get(item.key)
					return {
						...questionTypeToDefinition(item),
						hasOverride: Boolean(override),
						override: override
							? {
									titleOverride: override.titleOverride,
									scoringRuleOverride: override.scoringRuleOverride,
									isDisabled: override.isDisabled,
								}
							: null,
					}
				}),
			})
		}

		const globalTypes = await getGlobalQuestionTypes({ includeInactive })
		res.json({
			scope: 'global',
			questionTypes: globalTypes.map((item) => ({
				...questionTypeToDefinition(item),
				hasOverride: false,
				override: null,
			})),
		})
	} catch (e) {
		next(e)
	}
})

router.get('/question-types/:key', sessionRequired(), requirePerm('tests', 'read'), async (req, res, next) => {
	try {
		const key = req.params.key as string
		const parsedKey = QuestionTypeKeySchema.safeParse(key)
		if (!parsedKey.success) {
			return res.status(400).json({ error: ERROR_MESSAGES.BAD_REQUEST, details: parsedKey.error.flatten() })
		}

		const globalTypes = await getGlobalQuestionTypes({ includeInactive: true })
		const found = globalTypes.find((item) => item.key === parsedKey.data)
		if (!found) return res.status(404).json({ error: 'Question type not found' })

		res.json({ questionType: questionTypeToDefinition(found) })
	} catch (e) {
		next(e)
	}
})

router.post('/question-types', sessionRequired(), async (req, res, next) => {
	try {
		if (!(await canManageCatalog(req))) return res.status(403).json({ error: 'Forbidden' })
		const parsed = CreateQuestionTypePayloadSchema.safeParse(req.body)
		if (!parsed.success) {
			return res.status(400).json({ error: ERROR_MESSAGES.BAD_REQUEST, details: parsed.error.flatten() })
		}
		if (!isAutoScoredTemplate(parsed.data.uiTemplate)) {
			return res.status(400).json({ error: OPEN_TYPE_SYSTEM_ONLY_MESSAGE })
		}
		const normalizedCreate = QuestionTypeDefinitionSchema.safeParse({
			...parsed.data,
			isSystem: false,
			isActive: parsed.data.isActive ?? true,
		})
		if (!normalizedCreate.success) {
			return res.status(400).json({ error: ERROR_MESSAGES.BAD_REQUEST, details: normalizedCreate.error.flatten() })
		}

		const existing = await db.query.questionTypes.findFirst({ where: eq(questionTypes.key, parsed.data.key) })
		if (existing) {
			return res.status(409).json({ error: 'Question type with this key already exists' })
		}

		const userId = req.authUser?.id ?? null
		const [created] = await db
			.insert(questionTypes)
			.values({
				key: normalizedCreate.data.key,
				title: normalizedCreate.data.title,
				description: normalizedCreate.data.description ?? null,
				uiTemplate: normalizedCreate.data.uiTemplate,
				validationSchema: normalizedCreate.data.validationSchema ?? null,
				scoringRule: normalizedCreate.data.scoringRule,
				isSystem: false,
				isActive: normalizedCreate.data.isActive ?? true,
				createdBy: userId,
				updatedBy: userId,
			})
			.returning()

		res.status(201).json({
			questionType: {
				key: created.key,
				title: created.title,
				description: created.description,
				uiTemplate: created.uiTemplate,
				validationSchema: created.validationSchema,
				scoringRule: created.scoringRule,
				isSystem: created.isSystem,
				isActive: created.isActive,
			},
		})
	} catch (e) {
		next(e)
	}
})

router.patch('/question-types/:key', sessionRequired(), async (req, res, next) => {
	try {
		if (!(await canManageCatalog(req))) return res.status(403).json({ error: 'Forbidden' })
		const key = req.params.key as string
		const parsedKey = QuestionTypeKeySchema.safeParse(key)
		if (!parsedKey.success) {
			return res.status(400).json({ error: ERROR_MESSAGES.BAD_REQUEST, details: parsedKey.error.flatten() })
		}

		const parsed = UpdateQuestionTypePayloadSchema.safeParse(req.body)
		if (!parsed.success) {
			return res.status(400).json({ error: ERROR_MESSAGES.BAD_REQUEST, details: parsed.error.flatten() })
		}

		const existing = await db.query.questionTypes.findFirst({ where: eq(questionTypes.key, parsedKey.data) })
		if (!existing) return res.status(404).json({ error: 'Question type not found' })
		if (existing.isSystem && parsed.data.uiTemplate && parsed.data.uiTemplate !== existing.uiTemplate) {
			return res.status(400).json({ error: 'Cannot change uiTemplate for system question type' })
		}
		const nextUiTemplate = parsed.data.uiTemplate ?? existing.uiTemplate
		if (!existing.isSystem && !isAutoScoredTemplate(nextUiTemplate)) {
			return res.status(400).json({ error: OPEN_TYPE_SYSTEM_ONLY_MESSAGE })
		}
		const nextScoringRuleRaw = parsed.data.scoringRule ?? existing.scoringRule
		const parsedNextRule = QuestionTypeScoringRuleSchema.safeParse(nextScoringRuleRaw)
		if (!parsedNextRule.success) {
			return res.status(400).json({ error: ERROR_MESSAGES.BAD_REQUEST, details: parsedNextRule.error.flatten() })
		}
		if (!isAutoScoredTemplate(nextUiTemplate)) {
			if (parsed.data.isActive === true) {
				return res.status(400).json({ error: OPEN_TYPE_UNAVAILABLE_MESSAGE })
			}
			const builtinRule = getBuiltinQuestionTypeByKey(existing.key)?.scoringRule
			const builtinParsed = QuestionTypeScoringRuleSchema.safeParse(builtinRule)
			if (!builtinParsed.success || !isDeepStrictEqual(parsedNextRule.data, builtinParsed.data)) {
				return res.status(400).json({ error: OPEN_TYPE_SCORING_FIXED_MESSAGE })
			}
		}
		const normalizedDefinition = QuestionTypeDefinitionSchema.safeParse({
			key: existing.key,
			title: parsed.data.title ?? existing.title,
			description: parsed.data.description === undefined ? existing.description : parsed.data.description,
			uiTemplate: nextUiTemplate,
			validationSchema:
				parsed.data.validationSchema === undefined ? existing.validationSchema : parsed.data.validationSchema,
			scoringRule: parsedNextRule.data,
			isSystem: existing.isSystem,
			isActive: parsed.data.isActive ?? existing.isActive,
		})
		if (!normalizedDefinition.success) {
			return res.status(400).json({ error: ERROR_MESSAGES.BAD_REQUEST, details: normalizedDefinition.error.flatten() })
		}

		const [updated] = await db
			.update(questionTypes)
			.set({
				title: normalizedDefinition.data.title,
				description: normalizedDefinition.data.description ?? null,
				uiTemplate: normalizedDefinition.data.uiTemplate,
				validationSchema: normalizedDefinition.data.validationSchema ?? null,
				scoringRule: normalizedDefinition.data.scoringRule,
				isActive: normalizedDefinition.data.isActive,
				updatedAt: new Date(),
				updatedBy: req.authUser?.id ?? null,
			})
			.where(eq(questionTypes.id, existing.id))
			.returning()

		await syncQuestionPointsForTests()

		res.json({
			questionType: {
				key: updated.key,
				title: updated.title,
				description: updated.description,
				uiTemplate: updated.uiTemplate,
				validationSchema: updated.validationSchema,
				scoringRule: updated.scoringRule,
				isSystem: updated.isSystem,
				isActive: updated.isActive,
			},
		})
	} catch (e) {
		next(e)
	}
})

router.delete('/question-types/:key', sessionRequired(), async (req, res, next) => {
	try {
		if (!(await canManageCatalog(req))) return res.status(403).json({ error: 'Forbidden' })
		const key = req.params.key as string
		const parsedKey = QuestionTypeKeySchema.safeParse(key)
		if (!parsedKey.success) {
			return res.status(400).json({ error: ERROR_MESSAGES.BAD_REQUEST, details: parsedKey.error.flatten() })
		}

		const existing = await db.query.questionTypes.findFirst({ where: eq(questionTypes.key, parsedKey.data) })
		if (!existing) return res.status(404).json({ error: 'Question type not found' })
		if (existing.isSystem) {
			return res.status(400).json({ error: 'System question types cannot be removed' })
		}

		await db
			.update(questionTypes)
			.set({
				isActive: false,
				updatedAt: new Date(),
				updatedBy: req.authUser?.id ?? null,
			})
			.where(eq(questionTypes.id, existing.id))

		await syncQuestionPointsForTests()

		res.json({ ok: true })
	} catch (e) {
		next(e)
	}
})

router.get('/question-types/tests/:id/overrides', validateUUID('id'), sessionRequired(), async (req, res, next) => {
	try {
		const testId = req.params.id as string
		if (!(await canReadTest(req, testId))) return res.status(403).json({ error: 'Forbidden' })
		const test = await db.query.tests.findFirst({ where: eq(tests.id, testId) })
		if (!test) return res.status(404).json({ error: ERROR_MESSAGES.TEST_NOT_FOUND })

		const overrides = await readTestOverrides(testId)
		res.json({ overrides })
	} catch (e) {
		next(e)
	}
})

router.put(
	'/question-types/tests/:id/overrides/:key',
	validateUUID('id'),
	sessionRequired(),
	async (req, res, next) => {
		try {
			const testId = req.params.id as string
			if (!(await canWriteTest(req, testId))) return res.status(403).json({ error: 'Forbidden' })
			const key = req.params.key as string
			const parsedKey = QuestionTypeKeySchema.safeParse(key)
			if (!parsedKey.success) {
				return res.status(400).json({ error: ERROR_MESSAGES.BAD_REQUEST, details: parsedKey.error.flatten() })
			}
			const parsed = PutTestQuestionTypeOverrideSchema.safeParse(req.body)
			if (!parsed.success) {
				return res.status(400).json({ error: ERROR_MESSAGES.BAD_REQUEST, details: parsed.error.flatten() })
			}

			const test = await db.query.tests.findFirst({ where: eq(tests.id, testId) })
			if (!test) return res.status(404).json({ error: ERROR_MESSAGES.TEST_NOT_FOUND })

			const availableTypes = await getGlobalQuestionTypes({ includeInactive: true })
			const targetType = availableTypes.find((item) => item.key === parsedKey.data)
			if (!targetType) return res.status(404).json({ error: 'Question type not found' })
			if (parsed.data.scoringRuleOverride) {
				const compatibilityError = validateScoringRuleTemplateCompatibility({
					uiTemplate: targetType.uiTemplate,
					scoringRule: parsed.data.scoringRuleOverride,
				})
				if (compatibilityError) {
					return res.status(400).json({
						error: ERROR_MESSAGES.BAD_REQUEST,
						details: {
							formErrors: [compatibilityError],
							fieldErrors: { scoringRuleOverride: [compatibilityError] },
						},
					})
				}
			}

			const existing = await db.query.testQuestionTypeOverrides.findFirst({
				where: and(
					eq(testQuestionTypeOverrides.testId, testId),
					eq(testQuestionTypeOverrides.questionTypeKey, parsedKey.data)
				),
			})

			if (!existing) {
				await db.insert(testQuestionTypeOverrides).values({
					testId,
					questionTypeKey: parsedKey.data,
					titleOverride: parsed.data.titleOverride ?? null,
					scoringRuleOverride: parsed.data.scoringRuleOverride ?? null,
					isDisabled: parsed.data.isDisabled ?? false,
					createdBy: req.authUser?.id ?? null,
					updatedBy: req.authUser?.id ?? null,
				})
			} else {
				await db
					.update(testQuestionTypeOverrides)
					.set({
						titleOverride: parsed.data.titleOverride ?? null,
						scoringRuleOverride: parsed.data.scoringRuleOverride ?? null,
						isDisabled: parsed.data.isDisabled ?? false,
						updatedAt: new Date(),
						updatedBy: req.authUser?.id ?? null,
					})
					.where(eq(testQuestionTypeOverrides.id, existing.id))
			}

			await syncQuestionPointsForTestByTypeConfig(testId)

			const effectiveTypes = await getEffectiveQuestionTypesForTest({ testId, includeInactive: true })
			res.json({
				ok: true,
				effectiveType: effectiveTypes.find((item) => item.key === parsedKey.data) ?? null,
			})
		} catch (e) {
			next(e)
		}
	}
)

router.delete(
	'/question-types/tests/:id/overrides/:key',
	validateUUID('id'),
	sessionRequired(),
	async (req, res, next) => {
		try {
			const testId = req.params.id as string
			if (!(await canWriteTest(req, testId))) return res.status(403).json({ error: 'Forbidden' })
			const key = req.params.key as string
			const parsedKey = QuestionTypeKeySchema.safeParse(key)
			if (!parsedKey.success) {
				return res.status(400).json({ error: ERROR_MESSAGES.BAD_REQUEST, details: parsedKey.error.flatten() })
			}
			const test = await db.query.tests.findFirst({ where: eq(tests.id, testId) })
			if (!test) return res.status(404).json({ error: ERROR_MESSAGES.TEST_NOT_FOUND })

			await db
				.delete(testQuestionTypeOverrides)
				.where(
					and(
						eq(testQuestionTypeOverrides.testId, testId),
						eq(testQuestionTypeOverrides.questionTypeKey, parsedKey.data)
					)
				)
			await syncQuestionPointsForTestByTypeConfig(testId)

			res.json({ ok: true })
		} catch (e) {
			next(e)
		}
	}
)

export { router as questionTypesRouter }

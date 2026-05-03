/**
 * API роуты для управления тестами
 */
import crypto from 'crypto'
import { and, asc, count, desc, eq, gt, inArray, isNull, sql } from 'drizzle-orm'
import { Router } from 'express'
import fs from 'fs'
import multer from 'multer'
import path from 'path'
import { z } from 'zod'

import { db } from '../../db/index.js'
import {
	answerKeys,
	questionDrafts,
	questionTypes,
	questions,
	testAttempts,
	testQuestionTypeOverrides,
	testScoringSettings,
	tests,
	topics,
	userRoles,
	users,
} from '../../db/schema.js'
import { ERROR_MESSAGES } from '../../lib/constants.js'
import {
	getEffectiveQuestionTypesForTest,
	getGlobalQuestionTypes,
	getQuestionTypeMapForTest,
	questionTypeToDefinition,
	validateQuestionWithType,
} from '../../lib/tests/question-type-resolver.js'
import {
	QuestionTypeDefinitionSchema,
	QuestionTypeScoringRuleSchema,
	QuestionTypeValidationSchema,
	isMistakeMetricAllowedForTemplate,
} from '../../lib/tests/question-types.js'
import {
	TestScoringRulesSchema,
	createDefaultTestScoringRules,
	resolveEffectiveScoringRules,
} from '../../lib/tests/scoring.js'
import { requirePerm } from '../../middleware/auth/requirePerm.js'
import { sessionRequired } from '../../middleware/auth/session.js'
import { validateUUID } from '../../middleware/validateParams.js'
import {
	MoveQuestionSchema,
	ReorderQuestionsSchema,
	SaveQuestionSchema,
	SaveTestSchema,
	TopicSchema,
	UpdateQuestionDraftSchema,
	UpdateTestSettingsSchema,
} from '../../schemas/tests.js'
import { storageService } from '../../services/storage/storage.js'
import { assignmentsRouter } from './assignments.js'

const router = Router()

const GlobalScoringRulesPayloadSchema = z.object({
	rules: TestScoringRulesSchema,
})

const TestScoringRulesPayloadSchema = z
	.object({
		rules: TestScoringRulesSchema.optional(),
		useGlobal: z.boolean().optional(),
	})
	.superRefine((value, ctx) => {
		if (value.useGlobal === true) return
		if (!value.rules) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['rules'],
				message: 'rules обязательны, если useGlobal не установлен',
			})
		}
	})

const QuestionTypeKeySchema = z
	.string()
	.min(1)
	.max(100)
	.regex(/^[a-z0-9_]+$/)

const CreateQuestionTypePayloadSchema = z.object({
	key: QuestionTypeKeySchema,
	title: z.string().min(1).max(120),
	description: z.string().max(500).optional().nullable(),
	uiTemplate: z.enum(['single_choice', 'multi_choice', 'matching', 'short_text', 'sequence_digits']),
	validationSchema: QuestionTypeValidationSchema,
	scoringRule: QuestionTypeScoringRuleSchema,
	isActive: z.boolean().optional(),
})

const UpdateQuestionTypePayloadSchema = z.object({
	title: z.string().min(1).max(120).optional(),
	description: z.string().max(500).optional().nullable(),
	uiTemplate: z.enum(['single_choice', 'multi_choice', 'matching', 'short_text', 'sequence_digits']).optional(),
	validationSchema: QuestionTypeValidationSchema.optional(),
	scoringRule: QuestionTypeScoringRuleSchema.optional(),
	isActive: z.boolean().optional(),
})

const PutTestQuestionTypeOverrideSchema = z.object({
	titleOverride: z.string().max(120).optional().nullable(),
	scoringRuleOverride: QuestionTypeScoringRuleSchema.optional().nullable(),
	isDisabled: z.boolean().optional(),
})

function validateScoringRuleTemplateCompatibility(params: {
	uiTemplate: 'single_choice' | 'multi_choice' | 'matching' | 'short_text' | 'sequence_digits'
	scoringRule: z.infer<typeof QuestionTypeScoringRuleSchema>
}): string | null {
	if (!isMistakeMetricAllowedForTemplate(params.uiTemplate, params.scoringRule.mistakeMetric)) {
		return `Метрика ${params.scoringRule.mistakeMetric} несовместима с шаблоном ${params.uiTemplate}`
	}
	return null
}

async function ensureGlobalScoringRules(updatedBy?: string | null) {
	const existing = await db.query.testScoringSettings.findFirst({
		where: eq(testScoringSettings.id, 'global'),
	})
	if (existing) {
		return TestScoringRulesSchema.parse(existing.rules)
	}

	const defaults = createDefaultTestScoringRules()
	await db
		.insert(testScoringSettings)
		.values({
			id: 'global',
			rules: defaults,
			updatedBy: updatedBy ?? null,
			updatedAt: new Date(),
		})
		.onConflictDoNothing()

	return defaults
}

function resolveQuestionPoints(params: {
	type: string
	fallbackPoints: number
	typeMap: Awaited<ReturnType<typeof getQuestionTypeMapForTest>>
}): number {
	const rulePoints = params.typeMap[params.type]?.scoringRule?.correctPoints
	if (typeof rulePoints === 'number' && Number.isFinite(rulePoints) && rulePoints >= 0) {
		return rulePoints
	}
	return params.fallbackPoints
}

async function writeTestSettingsFile(params: {
	topicSlug: string
	testSlug: string
	testId: string
	title: string
	description: string | null | undefined
	isPublished: boolean
	showCorrectAnswer: boolean
	timeLimitMinutes: number | null | undefined
	redThresholdMinutes: number | null | undefined
	warningThresholdMinutes: number | null | undefined
	passingScore: number | null | undefined
	version: number
	effectiveScoringRules: z.infer<typeof TestScoringRulesSchema>
	testOverrideRules: z.infer<typeof TestScoringRulesSchema> | null | undefined
}) {
	const testPath = storageService.getTestPath(params.topicSlug, params.testSlug)
	await storageService.writeJson(`${testPath}/settings.json`, {
		id: params.testId,
		title: params.title,
		description: params.description,
		isPublished: params.isPublished,
		showCorrectAnswer: params.showCorrectAnswer,
		scoringRules: params.effectiveScoringRules,
		useGlobalScoringRules: params.testOverrideRules == null,
		timeLimitMinutes: params.timeLimitMinutes,
		redThresholdMinutes: params.redThresholdMinutes,
		warningThresholdMinutes: params.warningThresholdMinutes,
		passingScore: params.passingScore,
		version: params.version,
		updatedAt: new Date().toISOString(),
	})
}

async function syncQuestionPointsForTestByTypeConfig(testId: string) {
	const typeMap = await getQuestionTypeMapForTest({ testId, includeInactive: true })
	const existingQuestions = await db
		.select({
			id: questions.id,
			type: questions.type,
			points: questions.points,
		})
		.from(questions)
		.where(eq(questions.testId, testId))

	for (const question of existingQuestions) {
		const points = resolveQuestionPoints({
			type: question.type,
			fallbackPoints: Number(question.points ?? 0),
			typeMap,
		})
		await db
			.update(questions)
			.set({
				points,
				updatedAt: new Date(),
			})
			.where(eq(questions.id, question.id))
	}
}

type QuestionDraftRow = typeof questionDrafts.$inferSelect
type QuestionDraftPayload = Record<string, unknown>

const QUESTION_DRAFT_NOT_FOUND_ERROR = 'Question draft not found'
const QUESTION_DRAFT_LOCK_CONFLICT_ERROR = 'Question draft lock version mismatch'

const DEFAULT_QUESTION_DRAFT_PAYLOAD: QuestionDraftPayload = {
	question: {},
}

const questionDraftSelect = {
	id: questionDrafts.id,
	testId: questionDrafts.testId,
	payload: questionDrafts.payload,
	lockVersion: questionDrafts.lockVersion,
	createdAt: questionDrafts.createdAt,
	updatedAt: questionDrafts.updatedAt,
}

function normalizeQuestionDraftPayload(payload: unknown): QuestionDraftPayload {
	if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
		return payload as QuestionDraftPayload
	}
	return {}
}

function toQuestionDraftResponse(
	draft: Pick<QuestionDraftRow, 'id' | 'testId' | 'payload' | 'lockVersion' | 'createdAt' | 'updatedAt'>
) {
	return {
		id: draft.id,
		testId: draft.testId,
		payload: normalizeQuestionDraftPayload(draft.payload),
		lockVersion: draft.lockVersion,
		createdAt: draft.createdAt,
		updatedAt: draft.updatedAt,
	}
}

function toQuestionDraftListItem(
	draft: Pick<QuestionDraftRow, 'id' | 'testId' | 'payload' | 'lockVersion' | 'createdAt' | 'updatedAt'>
) {
	const payload = normalizeQuestionDraftPayload(draft.payload)
	return {
		id: draft.id,
		testId: draft.testId,
		payload,
		lockVersion: draft.lockVersion,
		createdAt: draft.createdAt,
		updatedAt: draft.updatedAt,
	}
}

// =============================================================================
// Topics
// =============================================================================

// GET /api/tests/topics - список всех тем
router.get('/topics', sessionRequired(), requirePerm('tests', 'read'), async (_req, res, next) => {
	try {
		// Используем LEFT JOIN с GROUP BY вместо коррелированного подзапроса для лучшей производительности
		const rows = await db
			.select({
				id: topics.id,
				slug: topics.slug,
				title: topics.title,
				description: topics.description,
				order: topics.order,
				isActive: topics.isActive,
				createdAt: topics.createdAt,
				testsCount: sql<number>`count(${tests.id})::int`.as('testsCount'),
			})
			.from(topics)
			.leftJoin(tests, eq(tests.topicId, topics.id))
			.groupBy(topics.id)
			.orderBy(asc(topics.order), asc(topics.title))

		res.json({ topics: rows })
	} catch (e) {
		next(e)
	}
})

// POST /api/tests/topics - создать тему
router.post('/topics', sessionRequired(), requirePerm('tests', 'write'), async (req, res, next) => {
	try {
		const parsed = TopicSchema.safeParse(req.body)
		if (!parsed.success) {
			return res.status(400).json({ error: ERROR_MESSAGES.BAD_REQUEST, details: parsed.error.flatten() })
		}

		const userId = req.authUser?.id
		const { slug, title, description, order, isActive } = parsed.data

		// Проверяем уникальность slug
		const existing = await db.query.topics.findFirst({ where: eq(topics.slug, slug) })
		if (existing) {
			return res.status(409).json({ error: ERROR_MESSAGES.TOPIC_SLUG_EXISTS })
		}

		const [inserted] = await db
			.insert(topics)
			.values({
				slug,
				title,
				description,
				order,
				isActive,
				createdBy: userId,
			})
			.returning()

		res.status(201).json({ topic: inserted })
	} catch (e) {
		next(e)
	}
})

// PATCH /api/tests/topics/:id - редактировать тему
router.patch(
	'/topics/:id',
	validateUUID('id'),
	sessionRequired(),
	requirePerm('tests', 'write'),
	async (req, res, next) => {
		try {
			const id = req.params.id as string
			const parsed = TopicSchema.partial().safeParse(req.body)
			if (!parsed.success) {
				return res.status(400).json({ error: ERROR_MESSAGES.BAD_REQUEST, details: parsed.error.flatten() })
			}

			const existing = await db.query.topics.findFirst({ where: eq(topics.id, id) })
			if (!existing) {
				return res.status(404).json({ error: ERROR_MESSAGES.TOPIC_NOT_FOUND })
			}

			// Если меняется slug, проверяем уникальность
			if (parsed.data.slug && parsed.data.slug !== existing.slug) {
				const slugExists = await db.query.topics.findFirst({ where: eq(topics.slug, parsed.data.slug) })
				if (slugExists) {
					return res.status(409).json({ error: ERROR_MESSAGES.TOPIC_SLUG_EXISTS })
				}
			}

			const [updated] = await db
				.update(topics)
				.set({
					...parsed.data,
					updatedAt: new Date(),
				})
				.where(eq(topics.id, id))
				.returning()

			res.json({ topic: updated })
		} catch (e) {
			next(e)
		}
	}
)

// DELETE /api/tests/topics/:id - удалить тему
router.delete(
	'/topics/:id',
	validateUUID('id'),
	sessionRequired(),
	requirePerm('tests', 'write'),
	async (req, res, next) => {
		try {
			const id = req.params.id as string

			const existing = await db.query.topics.findFirst({ where: eq(topics.id, id) })
			if (!existing) {
				return res.status(404).json({ error: ERROR_MESSAGES.TOPIC_NOT_FOUND })
			}

			// Удаляем файлы из Storage
			await storageService.deleteDirectory(`topics/${existing.slug}`)

			// Удаляем из БД (каскадно удалятся тесты, вопросы, ответы)
			await db.delete(topics).where(eq(topics.id, id))

			res.json({ ok: true })
		} catch (e) {
			next(e)
		}
	}
)

// =============================================================================
// Tests
// =============================================================================

// GET /api/tests - список тестов (с опциональным фильтром по topicId)
router.get('/', sessionRequired(), requirePerm('tests', 'read'), async (req, res, next) => {
	try {
		const topicId = req.query.topicId as string | undefined

		// Используем LEFT JOIN с GROUP BY вместо коррелированного подзапроса
		let query = db
			.select({
				id: tests.id,
				topicId: tests.topicId,
				slug: tests.slug,
				title: tests.title,
				description: tests.description,
				version: tests.version,
				isPublished: tests.isPublished,
				showCorrectAnswer: tests.showCorrectAnswer,
				timeLimitMinutes: tests.timeLimitMinutes,
				passingScore: tests.passingScore,
				order: tests.order,
				createdAt: tests.createdAt,
				updatedAt: tests.updatedAt,
				topicTitle: topics.title,
				topicSlug: topics.slug,
				questionsCount: sql<number>`count(${questions.id})::int`.as('questionsCount'),
			})
			.from(tests)
			.leftJoin(topics, eq(tests.topicId, topics.id))
			.leftJoin(questions, eq(questions.testId, tests.id))
			.groupBy(tests.id, topics.title, topics.slug)
			.orderBy(asc(tests.order), asc(tests.title))

		if (topicId) {
			query = query.where(eq(tests.topicId, topicId)) as typeof query
		}

		const rows = await query

		res.json({ tests: rows })
	} catch (e) {
		next(e)
	}
})

// =============================================================================
// Question Types
// =============================================================================

// GET /api/tests/question-types - список типов вопросов (глобально или эффективно для теста)
router.get('/question-types', sessionRequired(), requirePerm('tests', 'read'), async (req, res, next) => {
	try {
		const testId = typeof req.query.testId === 'string' ? req.query.testId : undefined
		const includeInactive = req.query.includeInactive === 'true'

		if (testId) {
			const test = await db.query.tests.findFirst({ where: eq(tests.id, testId) })
			if (!test) return res.status(404).json({ error: ERROR_MESSAGES.TEST_NOT_FOUND })

			const resolved = await getEffectiveQuestionTypesForTest({ testId, includeInactive })
			const overrides = await db.query.testQuestionTypeOverrides.findMany({
				where: eq(testQuestionTypeOverrides.testId, testId),
			})
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

// GET /api/tests/question-types/:key - получить тип вопроса по ключу
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

// POST /api/tests/question-types - создать новый тип вопроса
router.post('/question-types', sessionRequired(), requirePerm('tests', 'write'), async (req, res, next) => {
	try {
		const parsed = CreateQuestionTypePayloadSchema.safeParse(req.body)
		if (!parsed.success) {
			return res.status(400).json({ error: ERROR_MESSAGES.BAD_REQUEST, details: parsed.error.flatten() })
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

// PATCH /api/tests/question-types/:key - обновить тип вопроса
router.patch('/question-types/:key', sessionRequired(), requirePerm('tests', 'write'), async (req, res, next) => {
	try {
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
		const nextScoringRuleRaw = parsed.data.scoringRule ?? existing.scoringRule
		const parsedNextRule = QuestionTypeScoringRuleSchema.safeParse(nextScoringRuleRaw)
		if (!parsedNextRule.success) {
			return res.status(400).json({ error: ERROR_MESSAGES.BAD_REQUEST, details: parsedNextRule.error.flatten() })
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

		const allTests = await db.select({ id: tests.id }).from(tests)
		for (const test of allTests) {
			await syncQuestionPointsForTestByTypeConfig(test.id)
		}

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

// DELETE /api/tests/question-types/:key - мягко отключить тип вопроса
router.delete('/question-types/:key', sessionRequired(), requirePerm('tests', 'write'), async (req, res, next) => {
	try {
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

		const allTests = await db.select({ id: tests.id }).from(tests)
		for (const test of allTests) {
			await syncQuestionPointsForTestByTypeConfig(test.id)
		}

		res.json({ ok: true })
	} catch (e) {
		next(e)
	}
})

// GET /api/tests/question-types/tests/:id/overrides - override баллов по типам для теста
router.get(
	'/question-types/tests/:id/overrides',
	validateUUID('id'),
	sessionRequired(),
	requirePerm('tests', 'read'),
	async (req, res, next) => {
		try {
			const testId = req.params.id as string
			const test = await db.query.tests.findFirst({ where: eq(tests.id, testId) })
			if (!test) return res.status(404).json({ error: ERROR_MESSAGES.TEST_NOT_FOUND })

			const overrides = await db.query.testQuestionTypeOverrides.findMany({
				where: eq(testQuestionTypeOverrides.testId, testId),
			})
			res.json({ overrides })
		} catch (e) {
			next(e)
		}
	}
)

// PUT /api/tests/question-types/tests/:id/overrides/:key - upsert override типа для теста
router.put(
	'/question-types/tests/:id/overrides/:key',
	validateUUID('id'),
	sessionRequired(),
	requirePerm('tests', 'write'),
	async (req, res, next) => {
		try {
			const testId = req.params.id as string
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

// DELETE /api/tests/question-types/tests/:id/overrides/:key - удалить override типа для теста
router.delete(
	'/question-types/tests/:id/overrides/:key',
	validateUUID('id'),
	sessionRequired(),
	requirePerm('tests', 'write'),
	async (req, res, next) => {
		try {
			const testId = req.params.id as string
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

// GET /api/tests/scoring-rules/global - получить глобальные правила начисления баллов
router.get('/scoring-rules/global', sessionRequired(), requirePerm('tests', 'read'), async (req, res, next) => {
	try {
		const rules = await ensureGlobalScoringRules(req.authUser?.id)
		res.json({ rules })
	} catch (e) {
		next(e)
	}
})

// PUT /api/tests/scoring-rules/global - обновить глобальные правила начисления баллов
router.put('/scoring-rules/global', sessionRequired(), requirePerm('tests', 'write'), async (req, res, next) => {
	try {
		const parsed = GlobalScoringRulesPayloadSchema.safeParse(req.body)
		if (!parsed.success) {
			return res.status(400).json({ error: ERROR_MESSAGES.BAD_REQUEST, details: parsed.error.flatten() })
		}

		const userId = req.authUser?.id ?? null
		const now = new Date()

		await db
			.insert(testScoringSettings)
			.values({
				id: 'global',
				rules: parsed.data.rules,
				updatedBy: userId,
				updatedAt: now,
			})
			.onConflictDoUpdate({
				target: testScoringSettings.id,
				set: {
					rules: parsed.data.rules,
					updatedAt: now,
					updatedBy: userId,
				},
			})

		const testsUsingGlobal = await db.select({ id: tests.id }).from(tests).where(isNull(tests.scoringRules))
		for (const testRow of testsUsingGlobal) {
			await syncQuestionPointsForTestByTypeConfig(testRow.id)
		}

		res.json({ ok: true })
	} catch (e) {
		next(e)
	}
})

// GET /api/tests/scoring-rules/tests/:id - правила начисления баллов конкретного теста
router.get(
	'/scoring-rules/tests/:id',
	validateUUID('id'),
	sessionRequired(),
	requirePerm('tests', 'read'),
	async (req, res, next) => {
		try {
			const testId = req.params.id as string
			const test = await db.query.tests.findFirst({ where: eq(tests.id, testId) })
			if (!test) return res.status(404).json({ error: ERROR_MESSAGES.TEST_NOT_FOUND })

			const globalRules = await ensureGlobalScoringRules(req.authUser?.id)
			const effectiveRules = resolveEffectiveScoringRules({
				globalRules,
				testOverrideRules: test.scoringRules,
			})

			res.json({
				testId,
				hasOverride: test.scoringRules != null,
				overrideRules: test.scoringRules,
				globalRules,
				effectiveRules,
			})
		} catch (e) {
			next(e)
		}
	}
)

// PUT /api/tests/scoring-rules/tests/:id - обновить/сбросить override правил для теста
router.put(
	'/scoring-rules/tests/:id',
	validateUUID('id'),
	sessionRequired(),
	requirePerm('tests', 'write'),
	async (req, res, next) => {
		try {
			const testId = req.params.id as string
			const parsed = TestScoringRulesPayloadSchema.safeParse(req.body)
			if (!parsed.success) {
				return res.status(400).json({ error: ERROR_MESSAGES.BAD_REQUEST, details: parsed.error.flatten() })
			}

			const test = await db.query.tests.findFirst({ where: eq(tests.id, testId) })
			if (!test) return res.status(404).json({ error: ERROR_MESSAGES.TEST_NOT_FOUND })

			const globalRules = await ensureGlobalScoringRules(req.authUser?.id)
			const useGlobal = parsed.data.useGlobal === true
			let overrideRules: z.infer<typeof TestScoringRulesSchema> | null = null
			let effectiveRules = globalRules
			if (!useGlobal) {
				overrideRules = TestScoringRulesSchema.parse(parsed.data.rules)
				effectiveRules = overrideRules
			}

			await db
				.update(tests)
				.set({
					scoringRules: overrideRules,
					updatedAt: new Date(),
					updatedBy: req.authUser?.id ?? null,
				})
				.where(eq(tests.id, testId))

			await syncQuestionPointsForTestByTypeConfig(testId)

			res.json({
				ok: true,
				hasOverride: !useGlobal,
				overrideRules,
				effectiveRules,
			})
		} catch (e) {
			next(e)
		}
	}
)

// GET /api/tests/by-slug/:topicSlug/:testSlug - загрузить тест по slug
router.get('/by-slug/:topicSlug/:testSlug', sessionRequired(), requirePerm('tests', 'read'), async (req, res, next) => {
	try {
		const { topicSlug, testSlug } = req.params as { topicSlug: string; testSlug: string }

		// Находим тему по slug
		const topic = await db.query.topics.findFirst({
			where: eq(topics.slug, topicSlug),
		})
		if (!topic) {
			return res.status(404).json({ error: ERROR_MESSAGES.TOPIC_NOT_FOUND })
		}

		// Находим тест по (topicId, slug)
		const test = await db.query.tests.findFirst({
			where: and(eq(tests.topicId, topic.id), eq(tests.slug, testSlug)),
		})
		if (!test) {
			return res.status(404).json({ error: ERROR_MESSAGES.TEST_NOT_FOUND })
		}

		// Загружаем вопросы
		const questionRows = await db
			.select()
			.from(questions)
			.where(eq(questions.testId, test.id))
			.orderBy(asc(questions.order))
		const questionTypesMap = await getQuestionTypeMapForTest({ testId: test.id, includeInactive: true })

		// Загружаем активные ключи ответов
		const questionIds = questionRows.map((q) => q.id)
		const answerKeyRows =
			questionIds.length > 0
				? await db
						.select()
						.from(answerKeys)
						.where(and(inArray(answerKeys.questionId, questionIds), eq(answerKeys.isActive, true)))
				: []

		const answerKeyMap = new Map(answerKeyRows.map((ak) => [ak.questionId, ak.correctAnswer]))

		// Собираем все пути к файлам для чтения
		const filePaths: string[] = []
		const pathToQuestion = new Map<string, { questionId: string; type: 'prompt' | 'explanation' }>()

		for (const q of questionRows) {
			if (q.promptPath) {
				filePaths.push(q.promptPath)
				pathToQuestion.set(q.promptPath, { questionId: q.id, type: 'prompt' })
			}
			if (q.explanationPath) {
				filePaths.push(q.explanationPath)
				pathToQuestion.set(q.explanationPath, { questionId: q.id, type: 'explanation' })
			}
		}

		// Пакетная загрузка файлов из Storage
		const fileContents = await storageService.readFilesParallel(filePaths)

		// Формируем объекты вопросов с текстами
		const questionsWithTexts = questionRows.map((q) => {
			const promptText = q.promptPath ? fileContents.get(q.promptPath) || '' : ''
			const explanationText = q.explanationPath ? fileContents.get(q.explanationPath) || '' : ''
			const correct = answerKeyMap.get(q.id) ?? null
			const typeConfig = questionTypesMap[q.type]
			if (!typeConfig) {
				throw new Error(`Question type is not configured: ${q.type}`)
			}

			return {
				id: q.id,
				type: q.type,
				questionUiTemplate: typeConfig.uiTemplate,
				questionTypeTitle: typeConfig.title,
				order: q.order,
				points: q.points,
				options: q.options,
				matchingPairs: q.matchingPairs,
				promptText,
				explanationText,
				correct,
			}
		})

		res.json({
			test: {
				...test,
				topicSlug: topic.slug,
				topicTitle: topic.title,
			},
			questions: questionsWithTexts,
		})
	} catch (e) {
		next(e)
	}
})

// POST /api/tests/:testId/question-drafts - создать черновик вопроса внутри теста
router.post(
	'/:testId/question-drafts',
	validateUUID('testId'),
	sessionRequired(),
	requirePerm('tests', 'write'),
	async (req, res, next) => {
		try {
			const ownerId = req.authUser?.id
			if (!ownerId) {
				return res.status(401).json({ error: ERROR_MESSAGES.UNAUTHORIZED })
			}

			const testId = req.params.testId as string
			const [existingTest] = await db.select({ id: tests.id }).from(tests).where(eq(tests.id, testId)).limit(1)
			if (!existingTest) {
				return res.status(404).json({ error: ERROR_MESSAGES.TEST_NOT_FOUND })
			}

			const [created] = await db
				.insert(questionDrafts)
				.values({
					testId,
					ownerId,
					payload: { ...DEFAULT_QUESTION_DRAFT_PAYLOAD },
				})
				.returning(questionDraftSelect)

			res.status(201).json({ draft: toQuestionDraftResponse(created) })
		} catch (e) {
			next(e)
		}
	}
)

// GET /api/tests/:testId/question-drafts - список черновиков вопросов текущего теста
router.get(
	'/:testId/question-drafts',
	validateUUID('testId'),
	sessionRequired(),
	requirePerm('tests', 'write'),
	async (req, res, next) => {
		try {
			const ownerId = req.authUser?.id
			if (!ownerId) {
				return res.status(401).json({ error: ERROR_MESSAGES.UNAUTHORIZED })
			}

			const testId = req.params.testId as string
			const rows = await db
				.select(questionDraftSelect)
				.from(questionDrafts)
				.where(and(eq(questionDrafts.ownerId, ownerId), eq(questionDrafts.testId, testId)))
				.orderBy(desc(questionDrafts.updatedAt))

			res.json({
				drafts: rows.map((draft) => toQuestionDraftListItem(draft)),
			})
		} catch (e) {
			next(e)
		}
	}
)

// GET /api/tests/:testId/question-drafts/:draftId - получить черновик вопроса
router.get(
	'/:testId/question-drafts/:draftId',
	validateUUID('testId'),
	validateUUID('draftId'),
	sessionRequired(),
	requirePerm('tests', 'write'),
	async (req, res, next) => {
		try {
			const ownerId = req.authUser?.id
			if (!ownerId) {
				return res.status(401).json({ error: ERROR_MESSAGES.UNAUTHORIZED })
			}

			const testId = req.params.testId as string
			const draftId = req.params.draftId as string
			const [draft] = await db
				.select(questionDraftSelect)
				.from(questionDrafts)
				.where(
					and(eq(questionDrafts.id, draftId), eq(questionDrafts.testId, testId), eq(questionDrafts.ownerId, ownerId))
				)
				.limit(1)

			if (!draft) {
				return res.status(404).json({ error: QUESTION_DRAFT_NOT_FOUND_ERROR })
			}

			res.json({ draft: toQuestionDraftResponse(draft) })
		} catch (e) {
			next(e)
		}
	}
)

// PATCH /api/tests/:testId/question-drafts/:draftId - обновить payload черновика вопроса
router.patch(
	'/:testId/question-drafts/:draftId',
	validateUUID('testId'),
	validateUUID('draftId'),
	sessionRequired(),
	requirePerm('tests', 'write'),
	async (req, res, next) => {
		try {
			const ownerId = req.authUser?.id
			if (!ownerId) {
				return res.status(401).json({ error: ERROR_MESSAGES.UNAUTHORIZED })
			}

			const testId = req.params.testId as string
			const draftId = req.params.draftId as string
			const parsed = UpdateQuestionDraftSchema.safeParse(req.body)
			if (!parsed.success) {
				return res.status(400).json({ error: ERROR_MESSAGES.BAD_REQUEST, details: parsed.error.flatten() })
			}

			const updateSet = {
				payload: parsed.data.payload,
				lockVersion: sql`${questionDrafts.lockVersion} + 1`,
				updatedAt: new Date(),
			}

			let updated:
				| Pick<QuestionDraftRow, 'id' | 'testId' | 'payload' | 'lockVersion' | 'createdAt' | 'updatedAt'>
				| undefined
			if (typeof parsed.data.lockVersion === 'number') {
				;[updated] = await db
					.update(questionDrafts)
					.set(updateSet)
					.where(
						and(
							eq(questionDrafts.id, draftId),
							eq(questionDrafts.testId, testId),
							eq(questionDrafts.ownerId, ownerId),
							eq(questionDrafts.lockVersion, parsed.data.lockVersion)
						)
					)
					.returning(questionDraftSelect)

				if (!updated) {
					const [existing] = await db
						.select({ id: questionDrafts.id })
						.from(questionDrafts)
						.where(
							and(
								eq(questionDrafts.id, draftId),
								eq(questionDrafts.testId, testId),
								eq(questionDrafts.ownerId, ownerId)
							)
						)
						.limit(1)
					if (!existing) {
						return res.status(404).json({ error: QUESTION_DRAFT_NOT_FOUND_ERROR })
					}
					return res.status(409).json({ error: QUESTION_DRAFT_LOCK_CONFLICT_ERROR })
				}
			} else {
				;[updated] = await db
					.update(questionDrafts)
					.set(updateSet)
					.where(
						and(eq(questionDrafts.id, draftId), eq(questionDrafts.testId, testId), eq(questionDrafts.ownerId, ownerId))
					)
					.returning(questionDraftSelect)

				if (!updated) {
					return res.status(404).json({ error: QUESTION_DRAFT_NOT_FOUND_ERROR })
				}
			}

			res.json({ draft: toQuestionDraftResponse(updated) })
		} catch (e) {
			next(e)
		}
	}
)

// DELETE /api/tests/:testId/question-drafts/:draftId - удалить черновик вопроса
router.delete(
	'/:testId/question-drafts/:draftId',
	validateUUID('testId'),
	validateUUID('draftId'),
	sessionRequired(),
	requirePerm('tests', 'write'),
	async (req, res, next) => {
		try {
			const ownerId = req.authUser?.id
			if (!ownerId) {
				return res.status(401).json({ error: ERROR_MESSAGES.UNAUTHORIZED })
			}

			const testId = req.params.testId as string
			const draftId = req.params.draftId as string
			const [removed] = await db
				.delete(questionDrafts)
				.where(
					and(eq(questionDrafts.id, draftId), eq(questionDrafts.testId, testId), eq(questionDrafts.ownerId, ownerId))
				)
				.returning({ id: questionDrafts.id })

			if (!removed) {
				return res.status(404).json({ error: QUESTION_DRAFT_NOT_FOUND_ERROR })
			}

			res.json({ ok: true })
		} catch (e) {
			next(e)
		}
	}
)

// GET /api/tests/:id - загрузить тест для редактирования
router.get('/:id', validateUUID('id'), sessionRequired(), requirePerm('tests', 'read'), async (req, res, next) => {
	try {
		const id = req.params.id as string

		// Загружаем тест с темой
		const test = await db.query.tests.findFirst({
			where: eq(tests.id, id),
		})

		if (!test) {
			return res.status(404).json({ error: ERROR_MESSAGES.TEST_NOT_FOUND })
		}

		const topic = await db.query.topics.findFirst({
			where: eq(topics.id, test.topicId),
		})

		// Загружаем вопросы
		const questionRows = await db.select().from(questions).where(eq(questions.testId, id)).orderBy(asc(questions.order))
		const questionTypesMap = await getQuestionTypeMapForTest({ testId: id, includeInactive: true })

		// Загружаем активные ключи ответов
		const questionIds = questionRows.map((q) => q.id)
		const answerKeyRows =
			questionIds.length > 0
				? await db
						.select()
						.from(answerKeys)
						.where(and(inArray(answerKeys.questionId, questionIds), eq(answerKeys.isActive, true)))
				: []

		const answerKeyMap = new Map(answerKeyRows.map((ak) => [ak.questionId, ak.correctAnswer]))

		// Собираем все пути к файлам для чтения
		const filePaths: string[] = []
		const pathToQuestion = new Map<string, { questionId: string; type: 'prompt' | 'explanation' }>()

		for (const q of questionRows) {
			if (q.promptPath) {
				filePaths.push(q.promptPath)
				pathToQuestion.set(q.promptPath, { questionId: q.id, type: 'prompt' })
			}
			if (q.explanationPath) {
				filePaths.push(q.explanationPath)
				pathToQuestion.set(q.explanationPath, { questionId: q.id, type: 'explanation' })
			}
		}

		// Пакетная загрузка файлов из Storage с лимитом параллелизма
		const fileContents = await storageService.readFilesParallel(filePaths)

		// Формируем объекты вопросов с текстами
		const questionsWithTexts = questionRows.map((q) => {
			const promptText = q.promptPath ? fileContents.get(q.promptPath) || '' : ''
			const explanationText = q.explanationPath ? fileContents.get(q.explanationPath) || '' : ''
			const correct = answerKeyMap.get(q.id) ?? null
			const typeConfig = questionTypesMap[q.type]
			if (!typeConfig) {
				throw new Error(`Question type is not configured: ${q.type}`)
			}

			return {
				id: q.id,
				type: q.type,
				questionUiTemplate: typeConfig.uiTemplate,
				questionTypeTitle: typeConfig.title,
				order: q.order,
				points: q.points,
				options: q.options,
				matchingPairs: q.matchingPairs,
				promptText,
				explanationText,
				correct,
			}
		})

		res.json({
			test: {
				...test,
				topicSlug: topic?.slug,
				topicTitle: topic?.title,
			},
			questions: questionsWithTexts,
		})
	} catch (e) {
		next(e)
	}
})

// POST /api/tests/save - создать новый тест
router.post('/save', sessionRequired(), requirePerm('tests', 'write'), async (req, res, next) => {
	try {
		const parsed = SaveTestSchema.safeParse(req.body)
		if (!parsed.success) {
			return res.status(400).json({ error: ERROR_MESSAGES.BAD_REQUEST, details: parsed.error.flatten() })
		}

		const userId = req.authUser?.id
		const data = parsed.data
		const globalScoringRules = await ensureGlobalScoringRules(userId)
		const effectiveScoringRules = resolveEffectiveScoringRules({
			globalRules: globalScoringRules,
			testOverrideRules: data.scoringRules,
		})
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

		// Получаем тему для slug
		const topic = await db.query.topics.findFirst({ where: eq(topics.id, data.topicId) })
		if (!topic) {
			return res.status(404).json({ error: ERROR_MESSAGES.TOPIC_NOT_FOUND })
		}

		// Проверяем уникальность slug в рамках темы
		const existingTest = await db.query.tests.findFirst({
			where: and(eq(tests.topicId, data.topicId), eq(tests.slug, data.slug)),
		})
		if (existingTest) {
			return res.status(409).json({ error: ERROR_MESSAGES.TEST_SLUG_EXISTS })
		}

		// Начинаем транзакцию
		const result = await db.transaction(async (tx) => {
			// Создаём тест
			const [newTest] = await tx
				.insert(tests)
				.values({
					topicId: data.topicId,
					slug: data.slug,
					title: data.title,
					description: data.description,
					isPublished: data.isPublished,
					showCorrectAnswer: data.showCorrectAnswer,
					scoringRules: data.scoringRules ?? null,
					timeLimitMinutes: data.timeLimitMinutes,
					redThresholdMinutes: data.redThresholdMinutes ?? null,
					warningThresholdMinutes: data.warningThresholdMinutes ?? null,
					passingScore: data.passingScore,
					order: data.order,
					version: data.isPublished ? 1 : 0,
					createdBy: userId,
					updatedBy: userId,
				})
				.returning()

			// Создаём вопросы
			const createdQuestions = []
			for (const q of data.questions) {
				const [newQuestion] = await tx
					.insert(questions)
					.values({
						testId: newTest.id,
						type: q.type,
						order: q.order,
						points: resolveQuestionPoints({
							type: q.type,
							fallbackPoints: Number(q.points ?? 0),
							typeMap: globalQuestionTypesMap,
						}),
						options: q.options ?? null,
						matchingPairs: q.matchingPairs ?? null,
						promptPath: `topics/${topic.slug}/${data.slug}/questions/${crypto.randomUUID()}/prompt.md`,
						explanationPath: q.explanationText
							? `topics/${topic.slug}/${data.slug}/questions/${crypto.randomUUID()}/explanation.md`
							: null,
					})
					.returning()

				// Обновляем пути с реальным ID
				const promptPath = storageService.getQuestionPath(topic.slug, data.slug, newQuestion.id) + '/prompt.md'
				const explanationPath = q.explanationText
					? storageService.getQuestionPath(topic.slug, data.slug, newQuestion.id) + '/explanation.md'
					: null

				await tx.update(questions).set({ promptPath, explanationPath }).where(eq(questions.id, newQuestion.id))

				// Создаём ключ ответа
				await tx.insert(answerKeys).values({
					questionId: newQuestion.id,
					version: 1,
					correctAnswer: q.correct,
					isActive: true,
					createdBy: userId,
				})

				createdQuestions.push({
					...newQuestion,
					promptPath,
					explanationPath,
					promptText: q.promptText,
					explanationText: q.explanationText,
				})
			}

			return { test: newTest, questions: createdQuestions }
		})

		// Записываем файлы в Storage (после успешной транзакции)
		for (const q of result.questions) {
			if (q.promptPath && q.promptText) {
				await storageService.writeFile(q.promptPath, q.promptText)
			}
			if (q.explanationPath && q.explanationText) {
				await storageService.writeFile(q.explanationPath, q.explanationText)
			}
		}

		await writeTestSettingsFile({
			topicSlug: topic.slug,
			testSlug: data.slug,
			testId: result.test.id,
			title: data.title,
			description: data.description,
			isPublished: data.isPublished,
			showCorrectAnswer: data.showCorrectAnswer,
			timeLimitMinutes: data.timeLimitMinutes,
			redThresholdMinutes: data.redThresholdMinutes,
			warningThresholdMinutes: data.warningThresholdMinutes,
			passingScore: data.passingScore,
			version: result.test.version,
			effectiveScoringRules,
			testOverrideRules: data.scoringRules ?? null,
		})

		res.status(201).json({ test: { ...result.test, topicSlug: topic.slug } })
	} catch (e) {
		next(e)
	}
})

// PATCH /api/tests/:id/settings - обновить настройки теста без изменения вопросов
router.patch(
	'/:id/settings',
	validateUUID('id'),
	sessionRequired(),
	requirePerm('tests', 'write'),
	async (req, res, next) => {
		try {
			const testId = req.params.id as string
			const parsed = UpdateTestSettingsSchema.safeParse(req.body)
			if (!parsed.success) {
				return res.status(400).json({ error: ERROR_MESSAGES.BAD_REQUEST, details: parsed.error.flatten() })
			}

			const userId = req.authUser?.id ?? null
			const data = parsed.data

			const existingTest = await db.query.tests.findFirst({ where: eq(tests.id, testId) })
			if (!existingTest) {
				return res.status(404).json({ error: ERROR_MESSAGES.TEST_NOT_FOUND })
			}

			const topic = await db.query.topics.findFirst({ where: eq(topics.id, data.topicId) })
			if (!topic) {
				return res.status(404).json({ error: ERROR_MESSAGES.TOPIC_NOT_FOUND })
			}

			if (data.slug !== existingTest.slug || data.topicId !== existingTest.topicId) {
				const slugExists = await db.query.tests.findFirst({
					where: and(eq(tests.topicId, data.topicId), eq(tests.slug, data.slug)),
				})
				if (slugExists && slugExists.id !== testId) {
					return res.status(409).json({ error: ERROR_MESSAGES.TEST_SLUG_EXISTS })
				}
			}

			const [{ count: questionsCountRaw }] = await db
				.select({ count: sql<number>`count(*)::int` })
				.from(questions)
				.where(eq(questions.testId, testId))
			const questionsCount = Number(questionsCountRaw ?? 0)
			if (data.isPublished && questionsCount === 0) {
				return res.status(400).json({ error: 'Для публикации добавьте хотя бы один вопрос' })
			}

			const globalScoringRules = await ensureGlobalScoringRules(userId)
			const nextScoringOverride = data.scoringRules === undefined ? existingTest.scoringRules : data.scoringRules
			const effectiveScoringRules = resolveEffectiveScoringRules({
				globalRules: globalScoringRules,
				testOverrideRules: nextScoringOverride,
			})

			const oldTopic = await db.query.topics.findFirst({ where: eq(topics.id, existingTest.topicId) })
			const oldPrefix = oldTopic ? storageService.getTestPath(oldTopic.slug, existingTest.slug) : null
			const newPrefix = storageService.getTestPath(topic.slug, data.slug)
			const shouldRebaseQuestionPaths = Boolean(oldPrefix && oldPrefix !== newPrefix)
			const shouldIncrementVersion = data.isPublished && !existingTest.isPublished

			const result = await db.transaction(async (tx) => {
				const [updatedTest] = await tx
					.update(tests)
					.set({
						topicId: data.topicId,
						slug: data.slug,
						title: data.title,
						description: data.description,
						isPublished: data.isPublished,
						showCorrectAnswer: data.showCorrectAnswer,
						scoringRules: nextScoringOverride ?? null,
						timeLimitMinutes: data.timeLimitMinutes,
						redThresholdMinutes: data.redThresholdMinutes ?? null,
						warningThresholdMinutes: data.warningThresholdMinutes ?? null,
						passingScore: data.passingScore,
						order: data.order,
						version: shouldIncrementVersion ? existingTest.version + 1 : existingTest.version,
						updatedAt: new Date(),
						updatedBy: userId,
					})
					.where(eq(tests.id, testId))
					.returning()

				if (shouldRebaseQuestionPaths && oldPrefix) {
					const questionRows = await tx
						.select({
							id: questions.id,
							promptPath: questions.promptPath,
							explanationPath: questions.explanationPath,
						})
						.from(questions)
						.where(eq(questions.testId, testId))

					for (const row of questionRows) {
						const promptPath = row.promptPath?.startsWith(oldPrefix)
							? `${newPrefix}${row.promptPath.slice(oldPrefix.length)}`
							: row.promptPath
						const explanationPath = row.explanationPath?.startsWith(oldPrefix)
							? `${newPrefix}${row.explanationPath.slice(oldPrefix.length)}`
							: row.explanationPath

						if (promptPath === row.promptPath && explanationPath === row.explanationPath) continue

						await tx
							.update(questions)
							.set({
								promptPath,
								explanationPath,
								updatedAt: new Date(),
							})
							.where(eq(questions.id, row.id))
					}
				}

				return { test: updatedTest }
			})

			let assetsMoved: boolean | undefined = undefined
			if (shouldRebaseQuestionPaths && oldPrefix) {
				try {
					await storageService.moveDirectory(oldPrefix, newPrefix)
					assetsMoved = true
				} catch (err) {
					console.error('[tests] Failed to move assets directory:', err)
					assetsMoved = false
				}
			}

			await writeTestSettingsFile({
				topicSlug: topic.slug,
				testSlug: data.slug,
				testId: result.test.id,
				title: data.title,
				description: data.description,
				isPublished: data.isPublished,
				showCorrectAnswer: data.showCorrectAnswer,
				timeLimitMinutes: data.timeLimitMinutes,
				redThresholdMinutes: data.redThresholdMinutes,
				warningThresholdMinutes: data.warningThresholdMinutes,
				passingScore: data.passingScore,
				version: result.test.version,
				effectiveScoringRules,
				testOverrideRules: nextScoringOverride ?? null,
			})

			const response: { test: typeof result.test & { topicSlug: string }; assetsMoved?: boolean } = {
				test: { ...result.test, topicSlug: topic.slug },
			}
			if (typeof assetsMoved !== 'undefined') {
				response.assetsMoved = assetsMoved
			}
			return res.json(response)
		} catch (e) {
			return next(e)
		}
	}
)

// POST /api/tests/:id/questions - создать вопрос в тесте
router.post(
	'/:id/questions',
	validateUUID('id'),
	sessionRequired(),
	requirePerm('tests', 'write'),
	async (req, res, next) => {
		try {
			const testId = req.params.id as string
			const parsed = SaveQuestionSchema.safeParse(req.body)
			if (!parsed.success) {
				return res.status(400).json({ error: ERROR_MESSAGES.BAD_REQUEST, details: parsed.error.flatten() })
			}
			const data = parsed.data
			const userId = req.authUser?.id ?? null

			const test = await db.query.tests.findFirst({ where: eq(tests.id, testId) })
			if (!test) {
				return res.status(404).json({ error: ERROR_MESSAGES.TEST_NOT_FOUND })
			}
			const topic = await db.query.topics.findFirst({ where: eq(topics.id, test.topicId) })
			if (!topic) {
				return res.status(404).json({ error: ERROR_MESSAGES.TOPIC_NOT_FOUND })
			}

			const typeMap = await getQuestionTypeMapForTest({ testId, includeInactive: true })
			const questionValidationError = validateQuestionWithType(data, typeMap)
			if (questionValidationError) {
				return res.status(400).json({ error: questionValidationError })
			}

			const [orderRow] = await db
				.select({ count: sql<number>`count(*)::int` })
				.from(questions)
				.where(eq(questions.testId, testId))
			const questionsCount = Number(orderRow?.count ?? 0)
			const targetOrderRaw = typeof data.order === 'number' ? data.order : questionsCount
			const targetOrder = Math.max(0, Math.min(targetOrderRaw, questionsCount))

			const result = await db.transaction(async (tx) => {
				const now = new Date()
				if (targetOrder < questionsCount) {
					await tx
						.update(questions)
						.set({
							order: sql`${questions.order} + 1`,
							updatedAt: now,
						})
						.where(and(eq(questions.testId, testId), sql`${questions.order} >= ${targetOrder}`))
				}

				const [createdQuestion] = await tx
					.insert(questions)
					.values({
						testId,
						type: data.type,
						order: targetOrder,
						points: resolveQuestionPoints({
							type: data.type,
							fallbackPoints: Number(data.points ?? 0),
							typeMap,
						}),
						options: data.options ?? null,
						matchingPairs: data.matchingPairs ?? null,
					})
					.returning()

				const promptPath = storageService.getQuestionPath(topic.slug, test.slug, createdQuestion.id) + '/prompt.md'
				const explanationPath = data.explanationText
					? storageService.getQuestionPath(topic.slug, test.slug, createdQuestion.id) + '/explanation.md'
					: null

				await tx
					.update(questions)
					.set({
						promptPath,
						explanationPath,
						updatedAt: now,
					})
					.where(eq(questions.id, createdQuestion.id))

				await tx.insert(answerKeys).values({
					questionId: createdQuestion.id,
					version: 1,
					correctAnswer: data.correct,
					isActive: true,
					createdBy: userId,
				})

				await tx
					.update(tests)
					.set({
						updatedAt: now,
						updatedBy: userId,
					})
					.where(eq(tests.id, testId))

				return {
					id: createdQuestion.id,
					order: targetOrder,
					promptPath,
					explanationPath,
				}
			})

			if (result.promptPath && data.promptText) {
				await storageService.writeFile(result.promptPath, data.promptText)
			}
			if (result.explanationPath && data.explanationText) {
				await storageService.writeFile(result.explanationPath, data.explanationText)
			}

			return res.status(201).json({
				ok: true,
				questionId: result.id,
				order: result.order,
			})
		} catch (e) {
			return next(e)
		}
	}
)

// PATCH /api/tests/:id/questions/:questionId - обновить вопрос
router.patch(
	'/:id/questions/:questionId',
	validateUUID('id'),
	validateUUID('questionId'),
	sessionRequired(),
	requirePerm('tests', 'write'),
	async (req, res, next) => {
		try {
			const testId = req.params.id as string
			const questionId = req.params.questionId as string
			const parsed = SaveQuestionSchema.safeParse(req.body)
			if (!parsed.success) {
				return res.status(400).json({ error: ERROR_MESSAGES.BAD_REQUEST, details: parsed.error.flatten() })
			}
			const data = parsed.data
			const userId = req.authUser?.id ?? null

			const test = await db.query.tests.findFirst({ where: eq(tests.id, testId) })
			if (!test) {
				return res.status(404).json({ error: ERROR_MESSAGES.TEST_NOT_FOUND })
			}
			const topic = await db.query.topics.findFirst({ where: eq(topics.id, test.topicId) })
			if (!topic) {
				return res.status(404).json({ error: ERROR_MESSAGES.TOPIC_NOT_FOUND })
			}
			const existingQuestion = await db.query.questions.findFirst({
				where: and(eq(questions.id, questionId), eq(questions.testId, testId)),
			})
			if (!existingQuestion) {
				return res.status(404).json({ error: 'Вопрос не найден в текущем тесте' })
			}

			const typeMap = await getQuestionTypeMapForTest({ testId, includeInactive: true })
			const questionValidationError = validateQuestionWithType(data, typeMap)
			if (questionValidationError) {
				return res.status(400).json({ error: questionValidationError })
			}

			const result = await db.transaction(async (tx) => {
				const now = new Date()
				const promptPath = storageService.getQuestionPath(topic.slug, test.slug, questionId) + '/prompt.md'
				const explanationPath = data.explanationText
					? storageService.getQuestionPath(topic.slug, test.slug, questionId) + '/explanation.md'
					: null

				await tx
					.update(questions)
					.set({
						type: data.type,
						points: resolveQuestionPoints({
							type: data.type,
							fallbackPoints: Number(data.points ?? 0),
							typeMap,
						}),
						options: data.options ?? null,
						matchingPairs: data.matchingPairs ?? null,
						promptPath,
						explanationPath,
						updatedAt: now,
					})
					.where(eq(questions.id, questionId))

				await tx.update(answerKeys).set({ isActive: false }).where(eq(answerKeys.questionId, questionId))

				const [maxVersion] = await tx
					.select({ maxV: sql<number>`COALESCE(MAX(version), 0)` })
					.from(answerKeys)
					.where(eq(answerKeys.questionId, questionId))

				await tx.insert(answerKeys).values({
					questionId,
					version: (maxVersion?.maxV ?? 0) + 1,
					correctAnswer: data.correct,
					isActive: true,
					createdBy: userId,
				})

				await tx
					.update(tests)
					.set({
						updatedAt: now,
						updatedBy: userId,
					})
					.where(eq(tests.id, testId))

				return {
					oldPromptPath: existingQuestion.promptPath,
					oldExplanationPath: existingQuestion.explanationPath,
					promptPath,
					explanationPath,
				}
			})

			if (result.oldPromptPath && result.oldPromptPath !== result.promptPath) {
				await storageService.deleteFiles([result.oldPromptPath])
			}
			if (result.oldExplanationPath && result.oldExplanationPath !== result.explanationPath) {
				await storageService.deleteFiles([result.oldExplanationPath])
			}
			if (result.promptPath && data.promptText) {
				await storageService.writeFile(result.promptPath, data.promptText)
			}
			if (result.explanationPath && data.explanationText) {
				await storageService.writeFile(result.explanationPath, data.explanationText)
			}

			return res.json({ ok: true, questionId })
		} catch (e) {
			return next(e)
		}
	}
)

// PUT /api/tests/:id/questions/reorder - изменить порядок вопросов
router.put(
	'/:id/questions/reorder',
	validateUUID('id'),
	sessionRequired(),
	requirePerm('tests', 'write'),
	async (req, res, next) => {
		try {
			const testId = req.params.id as string
			const parsed = ReorderQuestionsSchema.safeParse(req.body)
			if (!parsed.success) {
				return res.status(400).json({ error: ERROR_MESSAGES.BAD_REQUEST, details: parsed.error.flatten() })
			}
			const userId = req.authUser?.id ?? null
			const { questionIds } = parsed.data

			const test = await db.query.tests.findFirst({ where: eq(tests.id, testId) })
			if (!test) {
				return res.status(404).json({ error: ERROR_MESSAGES.TEST_NOT_FOUND })
			}

			const existingQuestions = await db
				.select({ id: questions.id, order: questions.order })
				.from(questions)
				.where(eq(questions.testId, testId))
				.orderBy(asc(questions.order))

			if (existingQuestions.length !== questionIds.length) {
				return res.status(400).json({ error: 'Неверный набор вопросов для сортировки' })
			}
			const existingIdsSet = new Set(existingQuestions.map((question) => question.id))
			if (!questionIds.every((id) => existingIdsSet.has(id))) {
				return res.status(400).json({ error: 'Неверный набор вопросов для сортировки' })
			}

			await db.transaction(async (tx) => {
				const now = new Date()
				for (let order = 0; order < questionIds.length; order += 1) {
					await tx
						.update(questions)
						.set({ order, updatedAt: now })
						.where(and(eq(questions.id, questionIds[order]), eq(questions.testId, testId)))
				}
				await tx
					.update(tests)
					.set({
						updatedAt: now,
						updatedBy: userId,
					})
					.where(eq(tests.id, testId))
			})

			return res.json({ ok: true })
		} catch (e) {
			return next(e)
		}
	}
)

// POST /api/tests/:id/questions/:questionId/move - перенести вопрос в другой тест/тему
router.post(
	'/:id/questions/:questionId/move',
	validateUUID('id'),
	validateUUID('questionId'),
	sessionRequired(),
	requirePerm('tests', 'write'),
	async (req, res, next) => {
		try {
			const sourceTestId = req.params.id as string
			const questionId = req.params.questionId as string

			const parsed = MoveQuestionSchema.safeParse(req.body)
			if (!parsed.success) {
				return res.status(400).json({ error: ERROR_MESSAGES.BAD_REQUEST, details: parsed.error.flatten() })
			}

			const { targetTestId, targetTopicId } = parsed.data
			const userId = req.authUser?.id

			const sourceTest = await db.query.tests.findFirst({ where: eq(tests.id, sourceTestId) })
			if (!sourceTest) {
				return res.status(404).json({ error: ERROR_MESSAGES.TEST_NOT_FOUND })
			}

			const question = await db.query.questions.findFirst({
				where: and(eq(questions.id, questionId), eq(questions.testId, sourceTestId)),
			})
			if (!question) {
				return res.status(404).json({ error: 'Вопрос не найден в текущем тесте' })
			}

			const sourceTopic = await db.query.topics.findFirst({ where: eq(topics.id, sourceTest.topicId) })
			if (!sourceTopic) {
				return res.status(404).json({ error: ERROR_MESSAGES.TOPIC_NOT_FOUND })
			}

			let resolvedTargetTest = targetTestId
				? await db.query.tests.findFirst({ where: eq(tests.id, targetTestId) })
				: null
			let targetTopic =
				resolvedTargetTest && resolvedTargetTest.topicId
					? await db.query.topics.findFirst({ where: eq(topics.id, resolvedTargetTest.topicId) })
					: null

			if (!resolvedTargetTest && targetTopicId) {
				targetTopic = await db.query.topics.findFirst({ where: eq(topics.id, targetTopicId) })
				if (!targetTopic) {
					return res.status(404).json({ error: ERROR_MESSAGES.TOPIC_NOT_FOUND })
				}

				resolvedTargetTest = await db.query.tests.findFirst({
					where: and(eq(tests.topicId, targetTopic.id), eq(tests.slug, sourceTest.slug)),
				})

				if (!resolvedTargetTest) {
					let nextSlug = sourceTest.slug
					let suffix = 2
					while (
						await db.query.tests.findFirst({
							where: and(eq(tests.topicId, targetTopic.id), eq(tests.slug, nextSlug)),
						})
					) {
						nextSlug = `${sourceTest.slug}-${suffix}`
						suffix += 1
					}

					const [orderRow] = await db
						.select({ maxOrder: sql<number>`COALESCE(MAX(${tests.order}), -1)` })
						.from(tests)
						.where(eq(tests.topicId, targetTopic.id))

					const [createdTest] = await db
						.insert(tests)
						.values({
							topicId: targetTopic.id,
							slug: nextSlug,
							title: sourceTest.title,
							description: sourceTest.description,
							version: 1,
							isPublished: false,
							showCorrectAnswer: sourceTest.showCorrectAnswer,
							scoringRules: sourceTest.scoringRules,
							timeLimitMinutes: sourceTest.timeLimitMinutes,
							redThresholdMinutes: sourceTest.redThresholdMinutes,
							warningThresholdMinutes: sourceTest.warningThresholdMinutes,
							passingScore: sourceTest.passingScore,
							order: (orderRow?.maxOrder ?? -1) + 1,
							createdBy: userId,
							updatedBy: userId,
						})
						.returning()

					resolvedTargetTest = createdTest
				}
			}

			if (!resolvedTargetTest) {
				return res.status(404).json({ error: ERROR_MESSAGES.TEST_NOT_FOUND })
			}
			if (!targetTopic) {
				targetTopic = await db.query.topics.findFirst({ where: eq(topics.id, resolvedTargetTest.topicId) })
			}
			if (!targetTopic) {
				return res.status(404).json({ error: ERROR_MESSAGES.TOPIC_NOT_FOUND })
			}
			if (resolvedTargetTest.id === sourceTestId) {
				return res.status(400).json({ error: 'Выберите другую тему или тест для переноса вопроса' })
			}

			const oldQuestionPath = storageService.getQuestionPath(sourceTopic.slug, sourceTest.slug, questionId)
			const newQuestionPath = storageService.getQuestionPath(targetTopic.slug, resolvedTargetTest.slug, questionId)
			const newPromptPath = question.promptPath ? `${newQuestionPath}/prompt.md` : null
			const newExplanationPath = question.explanationPath ? `${newQuestionPath}/explanation.md` : null

			await storageService.moveDirectory(oldQuestionPath, newQuestionPath)

			try {
				await db.transaction(async (tx) => {
					const [targetOrderRow] = await tx
						.select({ maxOrder: sql<number>`COALESCE(MAX(${questions.order}), -1)` })
						.from(questions)
						.where(eq(questions.testId, resolvedTargetTest.id))
					const nextOrder = (targetOrderRow?.maxOrder ?? -1) + 1

					await tx
						.update(questions)
						.set({
							order: sql`${questions.order} - 1`,
							updatedAt: new Date(),
						})
						.where(and(eq(questions.testId, sourceTestId), gt(questions.order, question.order)))

					await tx
						.update(questions)
						.set({
							testId: resolvedTargetTest.id,
							order: nextOrder,
							promptPath: newPromptPath,
							explanationPath: newExplanationPath,
							updatedAt: new Date(),
						})
						.where(eq(questions.id, questionId))
				})
			} catch (txError) {
				try {
					await storageService.moveDirectory(newQuestionPath, oldQuestionPath)
				} catch (rollbackError) {
					console.error('[tests] Failed to rollback moved question files:', rollbackError)
				}
				throw txError
			}

			res.json({
				ok: true,
				questionId,
				target: {
					topicId: targetTopic.id,
					topicSlug: targetTopic.slug,
					testId: resolvedTargetTest.id,
					testSlug: resolvedTargetTest.slug,
				},
			})
		} catch (e) {
			next(e)
		}
	}
)

// DELETE /api/tests/:id/questions/:questionId - удалить вопрос из теста
router.delete(
	'/:id/questions/:questionId',
	validateUUID('id'),
	validateUUID('questionId'),
	sessionRequired(),
	requirePerm('tests', 'write'),
	async (req, res, next) => {
		try {
			const testId = req.params.id as string
			const questionId = req.params.questionId as string
			const userId = req.authUser?.id ?? null

			const test = await db.query.tests.findFirst({ where: eq(tests.id, testId) })
			if (!test) {
				return res.status(404).json({ error: ERROR_MESSAGES.TEST_NOT_FOUND })
			}

			const question = await db.query.questions.findFirst({
				where: and(eq(questions.id, questionId), eq(questions.testId, testId)),
			})
			if (!question) {
				return res.status(404).json({ error: 'Вопрос не найден в текущем тесте' })
			}

			const topic = await db.query.topics.findFirst({ where: eq(topics.id, test.topicId) })

			await db.transaction(async (tx) => {
				const now = new Date()

				await tx
					.update(questions)
					.set({
						order: sql`${questions.order} - 1`,
						updatedAt: now,
					})
					.where(and(eq(questions.testId, testId), gt(questions.order, question.order)))

				const [removedQuestion] = await tx
					.delete(questions)
					.where(and(eq(questions.id, questionId), eq(questions.testId, testId)))
					.returning({ id: questions.id })

				if (!removedQuestion) {
					throw new Error('Не удалось удалить вопрос')
				}

				await tx
					.update(tests)
					.set({
						updatedAt: now,
						updatedBy: userId,
					})
					.where(eq(tests.id, testId))
			})

			let assetsDeleted = true
			if (topic?.slug && test.slug) {
				const questionPath = storageService.getQuestionPath(topic.slug, test.slug, questionId)
				try {
					await storageService.deleteDirectory(questionPath)
				} catch (error) {
					assetsDeleted = false
					console.error('[tests] Failed to delete question assets directory:', error)
				}
			}

			return res.json({ ok: true, questionId, assetsDeleted })
		} catch (e) {
			return next(e)
		}
	}
)

// DELETE /api/tests/:id - удалить тест
router.delete('/:id', validateUUID('id'), sessionRequired(), requirePerm('tests', 'write'), async (req, res, next) => {
	try {
		const id = req.params.id as string

		const test = await db.query.tests.findFirst({ where: eq(tests.id, id) })
		if (!test) {
			return res.status(404).json({ error: ERROR_MESSAGES.TEST_NOT_FOUND })
		}

		const topic = await db.query.topics.findFirst({ where: eq(topics.id, test.topicId) })

		// Удаляем файлы из Storage
		if (topic) {
			const testPath = storageService.getTestPath(topic.slug, test.slug)
			await storageService.deleteDirectory(testPath)
		}

		// Удаляем из БД
		await db.delete(tests).where(eq(tests.id, id))

		res.json({ ok: true })
	} catch (e) {
		next(e)
	}
})

// POST /api/tests/:id/assets - загрузка изображений, сохраняем в папку assets рядом с тестом
const upload = multer({
	storage: multer.memoryStorage(),
	limits: {
		fileSize: 5 * 1024 * 1024, // 5MB
	},
	fileFilter: (_req, file, cb) => {
		const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
		if (allowedMimes.includes(file.mimetype)) {
			cb(null, true)
		} else {
			cb(new Error('Недопустимый тип файла. Разрешены только изображения (JPEG, PNG, GIF, WebP)'))
		}
	},
})

router.post(
	'/:id/assets',
	validateUUID('id'),
	sessionRequired(),
	requirePerm('tests', 'write'),
	upload.single('file') as any,
	async (req, res, next) => {
		try {
			const file = req.file as Express.Multer.File | undefined
			if (!file || !file.buffer) return res.status(400).json({ error: 'No file uploaded' })

			const testId = req.params.id as string
			const test = await db.query.tests.findFirst({ where: eq(tests.id, testId) })
			if (!test) return res.status(404).json({ error: ERROR_MESSAGES.TEST_NOT_FOUND })

			const topic = await db.query.topics.findFirst({ where: eq(topics.id, test.topicId) })
			if (!topic) return res.status(404).json({ error: ERROR_MESSAGES.TOPIC_NOT_FOUND })

			const testPath = storageService.getTestPath(topic.slug, test.slug) // topics/{topic}/{test}
			const ext = path.extname((file.originalname || '').toLowerCase()) || '.png'
			const filename = `${crypto.randomBytes(12).toString('hex')}${ext}`
			const storagePath = `${testPath}/assets/${filename}`

			if (storageService.isConfigured()) {
				// Upload to Supabase (or configured storage)
				await storageService.uploadBuffer(storagePath, file.buffer, file.mimetype, {
					cacheControl: '3600',
					upsert: false,
				})
				return res.status(201).json({ url: storagePath })
			} else {
				// Local disk fallback: save under web/public/uploads/tests/{topicSlug}/{testSlug}/assets
				const UPLOAD_DIR = path.join(process.cwd(), `../web/public/uploads/tests/${topic.slug}/${test.slug}/assets`)
				fs.mkdirSync(UPLOAD_DIR, { recursive: true })
				const filePath = path.join(UPLOAD_DIR, filename)
				fs.writeFileSync(filePath, file.buffer)
				const publicUrl = `/uploads/tests/${topic.slug}/${test.slug}/assets/${filename}`
				return res.status(201).json({ url: publicUrl })
			}
		} catch (e) {
			next(e)
		}
	}
)

// =============================================================================
// Export
// =============================================================================

// GET /api/tests/:id/export - экспорт теста в ZIP
router.get(
	'/:id/export',
	validateUUID('id'),
	sessionRequired(),
	requirePerm('tests', 'read'),
	async (req, res, next) => {
		try {
			const id = req.params.id as string
			const withAnswers = req.query.withAnswers === 'true'

			const test = await db.query.tests.findFirst({ where: eq(tests.id, id) })
			if (!test) {
				return res.status(404).json({ error: ERROR_MESSAGES.TEST_NOT_FOUND })
			}

			const topic = await db.query.topics.findFirst({ where: eq(topics.id, test.topicId) })
			if (!topic) {
				return res.status(404).json({ error: ERROR_MESSAGES.TOPIC_NOT_FOUND })
			}

			// Если нужны ответы, сначала записываем их в Storage
			if (withAnswers) {
				const questionRows = await db.select().from(questions).where(eq(questions.testId, id))
				const questionIds = questionRows.map((q) => q.id)

				if (questionIds.length > 0) {
					const answerKeyRows = await db
						.select()
						.from(answerKeys)
						.where(and(inArray(answerKeys.questionId, questionIds), eq(answerKeys.isActive, true)))

					const answersData = answerKeyRows.map((ak) => ({
						questionId: ak.questionId,
						correct: ak.correctAnswer,
					}))

					const testPath = storageService.getTestPath(topic.slug, test.slug)
					await storageService.writeJson(`${testPath}/answer_keys.json`, answersData)
				}
			}

			const testPath = storageService.getTestPath(topic.slug, test.slug)
			const zipBuffer = await storageService.createZip(testPath, withAnswers)

			res.setHeader('Content-Type', 'application/zip')
			res.setHeader('Content-Disposition', `attachment; filename="${topic.slug}-${test.slug}.zip"`)
			res.send(zipBuffer)
		} catch (e) {
			next(e)
		}
	}
)

// GET /api/tests/topics/:slug/export - экспорт темы в ZIP
router.get('/topics/:slug/export', sessionRequired(), requirePerm('tests', 'read'), async (req, res, next) => {
	try {
		const slug = req.params.slug as string
		const withAnswers = req.query.withAnswers === 'true'

		const topic = await db.query.topics.findFirst({ where: eq(topics.slug, slug) })
		if (!topic) {
			return res.status(404).json({ error: ERROR_MESSAGES.TOPIC_NOT_FOUND })
		}

		// Если нужны ответы, записываем их для каждого теста
		if (withAnswers) {
			const topicTests = await db.select().from(tests).where(eq(tests.topicId, topic.id))

			for (const test of topicTests) {
				const questionRows = await db.select().from(questions).where(eq(questions.testId, test.id))
				const questionIds = questionRows.map((q) => q.id)

				if (questionIds.length > 0) {
					const answerKeyRows = await db
						.select()
						.from(answerKeys)
						.where(and(inArray(answerKeys.questionId, questionIds), eq(answerKeys.isActive, true)))

					const answersData = answerKeyRows.map((ak) => ({
						questionId: ak.questionId,
						correct: ak.correctAnswer,
					}))

					const testPath = storageService.getTestPath(topic.slug, test.slug)
					await storageService.writeJson(`${testPath}/answer_keys.json`, answersData)
				}
			}
		}

		const topicPath = `topics/${topic.slug}`
		const zipBuffer = await storageService.createZip(topicPath, withAnswers)

		res.setHeader('Content-Type', 'application/zip')
		res.setHeader('Content-Disposition', `attachment; filename="${topic.slug}.zip"`)
		res.send(zipBuffer)
	} catch (e) {
		next(e)
	}
})

// Admin: test-side assignment endpoints
router.use('/:testId/assignments', assignmentsRouter)

// =============================================================================
// Admin: Dashboard
// =============================================================================

// GET /api/tests/admin/dashboard — aggregate student activity for teacher/admin dashboard
router.get('/admin/dashboard', sessionRequired(), requirePerm('tests', 'read'), async (_req, res, next) => {
	try {
		const studentOnly = sql`not exists (
			select 1 from ${userRoles}
			where ${userRoles.userId} = ${testAttempts.userId}
				and ${userRoles.roleKey} = 'admin'
		)`

		const [summary] = await db
			.select({
				totalAttempts: sql<number>`count(*)::int`,
				activeStudents: sql<number>`count(distinct ${testAttempts.userId})::int`,
				averageScore: sql<number>`coalesce(round(avg(${testAttempts.scorePercentage})::numeric, 1), 0)::float`,
				passedAttempts: sql<number>`count(*) filter (where ${testAttempts.passed})::int`,
			})
			.from(testAttempts)
			.where(studentOnly)

		const latestAttempts = await db
			.select({
				attemptId: testAttempts.id,
				testId: testAttempts.testId,
				testTitle: tests.title,
				testSlug: tests.slug,
				topicSlug: topics.slug,
				topicTitle: topics.title,
				studentId: users.id,
				studentName: sql<string>`coalesce(${users.name}, ${users.firstName}, ${users.login}, 'Пользователь')`,
				submittedAt: testAttempts.submittedAt,
				earnedPoints: testAttempts.earnedPoints,
				totalPoints: testAttempts.totalPoints,
				scorePercentage: testAttempts.scorePercentage,
				passed: testAttempts.passed,
			})
			.from(testAttempts)
			.innerJoin(users, eq(users.id, testAttempts.userId))
			.innerJoin(tests, eq(tests.id, testAttempts.testId))
			.innerJoin(topics, eq(topics.id, tests.topicId))
			.where(studentOnly)
			.orderBy(desc(testAttempts.submittedAt))
			.limit(8)

		const dailyActivity = await db
			.select({
				date: sql<string>`to_char(date_trunc('day', ${testAttempts.submittedAt}), 'YYYY-MM-DD')`,
				attempts: sql<number>`count(*)::int`,
				averageScore: sql<number>`coalesce(round(avg(${testAttempts.scorePercentage})::numeric, 1), 0)::float`,
			})
			.from(testAttempts)
			.where(sql`${studentOnly} and ${testAttempts.submittedAt} >= now() - interval '30 days'`)
			.groupBy(sql`date_trunc('day', ${testAttempts.submittedAt})`)
			.orderBy(sql`date_trunc('day', ${testAttempts.submittedAt})`)

		res.json({
			summary: {
				totalAttempts: Number(summary?.totalAttempts ?? 0),
				activeStudents: Number(summary?.activeStudents ?? 0),
				averageScore: Number(summary?.averageScore ?? 0),
				passedAttempts: Number(summary?.passedAttempts ?? 0),
			},
			latestAttempts: latestAttempts.map((attempt) => ({
				...attempt,
				submittedAt: attempt.submittedAt instanceof Date ? attempt.submittedAt.toISOString() : attempt.submittedAt,
			})),
			dailyActivity: dailyActivity.map((item) => ({
				date: item.date,
				attempts: Number(item.attempts ?? 0),
				averageScore: Number(item.averageScore ?? 0),
			})),
		})
	} catch (e) {
		next(e)
	}
})

// GET /api/tests/admin/attempts — latest student attempts for admin list view
router.get('/admin/attempts', sessionRequired(), requirePerm('tests', 'read'), async (req, res, next) => {
	try {
		const limitRaw = Number(req.query.limit ?? 50)
		const offsetRaw = Number(req.query.offset ?? 0)
		const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 50, 1), 100)
		const offset = Math.max(Number.isFinite(offsetRaw) ? offsetRaw : 0, 0)
		const studentOnly = sql`not exists (
			select 1 from ${userRoles}
			where ${userRoles.userId} = ${testAttempts.userId}
				and ${userRoles.roleKey} = 'admin'
		)`

		const [{ total: totalRaw }] = await db
			.select({
				total: sql<number>`count(*)::int`,
			})
			.from(testAttempts)
			.where(studentOnly)

		const rows = await db
			.select({
				attemptId: testAttempts.id,
				testId: testAttempts.testId,
				testTitle: tests.title,
				testSlug: tests.slug,
				topicSlug: topics.slug,
				topicTitle: topics.title,
				studentId: users.id,
				studentName: sql<string>`coalesce(${users.name}, ${users.firstName}, ${users.login}, 'Пользователь')`,
				submittedAt: testAttempts.submittedAt,
				earnedPoints: testAttempts.earnedPoints,
				totalPoints: testAttempts.totalPoints,
				scorePercentage: testAttempts.scorePercentage,
				passed: testAttempts.passed,
			})
			.from(testAttempts)
			.innerJoin(users, eq(users.id, testAttempts.userId))
			.innerJoin(tests, eq(tests.id, testAttempts.testId))
			.innerJoin(topics, eq(topics.id, tests.topicId))
			.where(studentOnly)
			.orderBy(desc(testAttempts.submittedAt))
			.limit(limit)
			.offset(offset)

		res.json({
			rows: rows.map((attempt) => ({
				...attempt,
				submittedAt: attempt.submittedAt instanceof Date ? attempt.submittedAt.toISOString() : attempt.submittedAt,
			})),
			total: Number(totalRaw ?? 0),
			limit,
			offset,
		})
	} catch (e) {
		next(e)
	}
})

// =============================================================================
// Admin: Attempt Review
// =============================================================================

// GET /api/tests/admin/attempts/:attemptId — fetch full attempt + questions for admin review
router.get(
	'/admin/attempts/:attemptId',
	validateUUID('attemptId'),
	sessionRequired(),
	requirePerm('tests', 'read'),
	async (req, res, next) => {
		try {
			const attemptId = req.params.attemptId as string

			const [attempt] = await db
				.select({
					id: testAttempts.id,
					testId: testAttempts.testId,
					userId: testAttempts.userId,
					answers: testAttempts.answers,
					results: testAttempts.results,
					earnedPoints: testAttempts.earnedPoints,
					totalPoints: testAttempts.totalPoints,
					scorePercentage: testAttempts.scorePercentage,
					passed: testAttempts.passed,
					submittedAt: testAttempts.submittedAt,
					telemetry: testAttempts.telemetry,
				})
				.from(testAttempts)
				.where(eq(testAttempts.id, attemptId))
				.limit(1)

			if (!attempt) {
				return res.status(404).json({ error: 'Attempt not found' })
			}

			// Load questions for this attempt's test (same pattern as public test detail endpoint)
			const questionRows = await db
				.select({
					id: questions.id,
					type: questions.type,
					order: questions.order,
					points: questions.points,
					options: questions.options,
					matchingPairs: questions.matchingPairs,
					promptPath: questions.promptPath,
				})
				.from(questions)
				.where(eq(questions.testId, attempt.testId))
				.orderBy(asc(questions.order))

			const questionTypesMap = await getQuestionTypeMapForTest({ testId: attempt.testId, includeInactive: true })

			// Load prompt text for each question
			const testRow = await db.query.tests.findFirst({
				where: eq(tests.id, attempt.testId),
				columns: { id: true, slug: true },
				with: {
					topic: { columns: { slug: true } },
				},
			})

			const questionsWithTexts = await Promise.all(
				questionRows.map(async (q) => {
					let promptText = ''
					if (testRow) {
						const candidates = [
							q.promptPath,
							`topics/${testRow.topic.slug}/${testRow.slug}/questions/${q.id}/prompt.md`,
							`topics/${testRow.topic.slug}/${testRow.id}/questions/${q.id}/prompt.md`,
						].filter((v): v is string => typeof v === 'string' && v.length > 0)

						for (const candidate of candidates) {
							const content = await storageService.readFile(candidate)
							if (content.trim().length > 0) {
								promptText = content
								break
							}
						}
					}

					const typeConfig = questionTypesMap[q.type]
					return {
						id: q.id,
						type: q.type,
						questionUiTemplate: typeConfig?.uiTemplate ?? null,
						questionTypeTitle: typeConfig?.title ?? q.type,
						order: q.order,
						points: q.points,
						options: q.options,
						matchingPairs: q.matchingPairs,
						promptText,
					}
				})
			)

			// For admin review always include correct answers regardless of showCorrectAnswer setting
			const questionIds = questionRows.map((q) => q.id)
			const answerKeyRows =
				questionIds.length > 0
					? await db
							.select({ questionId: answerKeys.questionId, correctAnswer: answerKeys.correctAnswer })
							.from(answerKeys)
							.where(and(inArray(answerKeys.questionId, questionIds), eq(answerKeys.isActive, true)))
					: []
			const answerKeysMap = new Map(answerKeyRows.map((ak) => [ak.questionId, ak.correctAnswer]))

			const resultsWithCorrectAnswers = Array.isArray(attempt.results)
				? (attempt.results as Array<Record<string, unknown>>).map((r) => ({
						...r,
						correctAnswer: r.correctAnswer ?? answerKeysMap.get(r.questionId as string) ?? null,
					}))
				: attempt.results

			res.json({
				attempt: {
					id: attempt.id,
					testId: attempt.testId,
					userId: attempt.userId,
					answers: attempt.answers,
					results: resultsWithCorrectAnswers,
					earnedPoints: attempt.earnedPoints,
					totalPoints: attempt.totalPoints,
					scorePercentage: attempt.scorePercentage,
					passed: attempt.passed,
					submittedAt: attempt.submittedAt instanceof Date ? attempt.submittedAt.toISOString() : attempt.submittedAt,
					telemetry: attempt.telemetry ?? null,
				},
				questions: questionsWithTexts,
			})
		} catch (e) {
			next(e)
		}
	}
)

export default router

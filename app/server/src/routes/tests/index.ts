/**
 * API роуты для управления тестами
 */
import {
	QUESTION_UI_TEMPLATES,
	QuestionTypeDefinitionSchema,
	QuestionTypeScoringRuleSchema,
	QuestionTypeValidationSchema,
	isMistakeMetricAllowedForTemplate,
	type QuestionUiTemplate,
} from '@bio-exam/exam-core'

import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { Router, type NextFunction, type Request, type Response } from 'express'
import multer from 'multer'
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
import { isApiError } from '../../lib/errors.js'
import {
	getEffectiveQuestionTypesForTest,
	getGlobalQuestionTypes,
	getQuestionTypeMapForTest,
	questionTypeToDefinition,
	validateQuestionWithType,
} from '../../lib/tests/question-type-resolver.js'
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
import {
	canManageCatalog,
	canReadTest,
	canReviewAttempt,
	canWriteTest,
	canWriteTopic,
	hasGlobalZone,
	isZoneOwnerCandidate,
	setTopicTeachers,
	testScope,
	topicTeachers,
	zoneOwnerCandidates,
} from '../../services/access-policy/index.js'
import { uploadImage } from '../../services/assets/index.js'
import {
	buildTestArchive,
	buildTopicArchive,
	createQuestion,
	createTestWithQuestions,
	deleteQuestion,
	deleteTest,
	deleteTopic,
	moveQuestion,
	readAdminTest,
	readQuestionMarkdown,
	reorderQuestions,
	resolveQuestionPoints,
	updateQuestion,
	updateTestSettings,
	updateTopic,
} from '../../services/question-content/index.js'
import { readAdminAttemptView } from '../../services/scored-attempt/index.js'
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

const TOPIC_TEACHER_INVALID_ERROR = 'Учитель не найден или не активен'

const TopicTeachersSchema = z.object({
	teacherIds: z
		.array(z.string().uuid())
		.max(50)
		.refine((ids) => new Set(ids).size === ids.length),
})

const PutTestQuestionTypeOverrideSchema = z.object({
	titleOverride: z.string().max(120).optional().nullable(),
	scoringRuleOverride: QuestionTypeScoringRuleSchema.optional().nullable(),
	isDisabled: z.boolean().optional(),
})

function validateScoringRuleTemplateCompatibility(params: {
	uiTemplate: QuestionUiTemplate
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
router.get('/topics', sessionRequired(), requirePerm('tests', 'read'), async (req, res, next) => {
	try {
		const scope = await testScope(req)
		if (!scope.all && scope.topicIds.length === 0) return res.json({ topics: [] })

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
			.where(scope.all ? undefined : inArray(topics.id, scope.topicIds))
			.groupBy(topics.id)
			.orderBy(asc(topics.order), asc(topics.title))

		if (!(await canManageCatalog(req))) return res.json({ topics: rows })

		const teachersByTopic = await topicTeachers(rows.map((row) => row.id))
		return res.json({ topics: rows.map((row) => ({ ...row, teachers: teachersByTopic.get(row.id) ?? [] })) })
	} catch (e) {
		return next(e)
	}
})

router.get('/topics/teacher-options', sessionRequired(), async (req, res, next) => {
	try {
		if (!(await canManageCatalog(req))) return res.status(403).json({ error: 'Forbidden' })
		return res.json({ teachers: await zoneOwnerCandidates() })
	} catch (e) {
		return next(e)
	}
})

router.put('/topics/:id/teachers', validateUUID('id'), sessionRequired(), async (req, res, next) => {
	try {
		if (!(await canManageCatalog(req))) return res.status(403).json({ error: 'Forbidden' })
		const parsed = TopicTeachersSchema.safeParse(req.body)
		if (!parsed.success) {
			return res.status(400).json({ error: ERROR_MESSAGES.BAD_REQUEST, details: parsed.error.flatten() })
		}

		const id = req.params.id as string
		const topic = await db.query.topics.findFirst({ where: eq(topics.id, id), columns: { id: true } })
		if (!topic) return res.status(404).json({ error: ERROR_MESSAGES.TOPIC_NOT_FOUND })

		const { teacherIds } = parsed.data
		const assignedBy = req.authUser?.id ?? null
		const result = await db.transaction(async (tx) => {
			const current = new Set(((await topicTeachers([id], tx)).get(id) ?? []).map((person) => person.id))
			for (const teacherId of teacherIds) {
				if (current.has(teacherId)) continue
				if (!(await isZoneOwnerCandidate(teacherId, tx))) return null
			}
			await setTopicTeachers(tx, { topicId: id, teacherIds, assignedBy })
			return (await topicTeachers([id], tx)).get(id) ?? []
		})
		if (result === null) return res.status(400).json({ error: TOPIC_TEACHER_INVALID_ERROR })

		return res.json({ teachers: result })
	} catch (e) {
		return next(e)
	}
})

// POST /api/tests/topics - создать тему
router.post('/topics', sessionRequired(), async (req, res, next) => {
	try {
		if (!(await canManageCatalog(req))) return res.status(403).json({ error: 'Forbidden' })
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
router.patch('/topics/:id', validateUUID('id'), sessionRequired(), async (req, res, next) => {
	try {
		if (!(await canManageCatalog(req))) {
			return res.status(403).json({ error: 'Forbidden' })
		}
		const id = req.params.id as string
		const parsed = TopicSchema.partial().safeParse(req.body)
		if (!parsed.success) {
			return res.status(400).json({ error: ERROR_MESSAGES.BAD_REQUEST, details: parsed.error.flatten() })
		}

		const topic = await updateTopic({ topicId: id, data: parsed.data })

		return res.json({ topic })
	} catch (e) {
		return next(e)
	}
})

// DELETE /api/tests/topics/:id - удалить тему
router.delete('/topics/:id', validateUUID('id'), sessionRequired(), async (req, res, next) => {
	try {
		if (!(await canManageCatalog(req))) {
			return res.status(403).json({ error: 'Forbidden' })
		}
		const id = req.params.id as string

		await deleteTopic({ topicId: id })

		return res.json({ ok: true })
	} catch (e) {
		return next(e)
	}
})

// =============================================================================
// Tests
// =============================================================================

// GET /api/tests - список тестов (с опциональным фильтром по topicId)
router.get('/', sessionRequired(), requirePerm('tests', 'read'), async (req, res, next) => {
	try {
		const topicId = req.query.topicId as string | undefined
		const scope = await testScope(req)
		if (!scope.all && scope.topicIds.length === 0) return res.json({ tests: [] })
		const conditions = [
			...(topicId ? [eq(tests.topicId, topicId)] : []),
			...(scope.all ? [] : [inArray(tests.topicId, scope.topicIds)]),
		]

		// Используем LEFT JOIN с GROUP BY вместо коррелированного подзапроса
		const rows = await db
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
			.where(conditions.length > 0 ? and(...conditions) : undefined)
			.groupBy(tests.id, topics.title, topics.slug)
			.orderBy(asc(tests.order), asc(tests.title))

		return res.json({ tests: rows })
	} catch (e) {
		return next(e)
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

// POST /api/tests/save - создать новый тест
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

// PATCH /api/tests/:id/settings - обновить настройки теста без изменения вопросов
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

// POST /api/tests/:id/questions - создать вопрос в тесте
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

// PATCH /api/tests/:id/questions/:questionId - обновить вопрос
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

// PUT /api/tests/:id/questions/reorder - изменить порядок вопросов
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

// POST /api/tests/:id/questions/:questionId/move - перенести вопрос в другой тест/тему
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

// DELETE /api/tests/:id/questions/:questionId - удалить вопрос из теста
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

// DELETE /api/tests/:id - удалить тест
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

async function requireTestWrite(req: Request, res: Response, next: NextFunction) {
	try {
		if (!(await canWriteTest(req, req.params.id as string))) return res.status(403).json({ error: 'Forbidden' })
		return next()
	} catch (e) {
		return next(e)
	}
}

router.post(
	'/:id/assets',
	validateUUID('id'),
	sessionRequired(),
	requireTestWrite,
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

			const { path: key } = await uploadImage(file.buffer)
			return res.status(201).json({ url: key })
		} catch (e) {
			return next(e)
		}
	}
)

// =============================================================================
// Export
// =============================================================================

// GET /api/tests/:id/export - экспорт теста в ZIP
router.get('/:id/export', validateUUID('id'), sessionRequired(), async (req, res, next) => {
	try {
		const id = req.params.id as string
		if (!(await canReadTest(req, id))) return res.status(403).json({ error: 'Forbidden' })

		const withAnswers = req.query.withAnswers === 'true' && (await canWriteTest(req, id))
		const archive = await buildTestArchive({ testId: id, withAnswers })

		res.setHeader('Content-Type', 'application/zip')
		res.setHeader('Content-Disposition', `attachment; filename="${archive.filename}"`)
		return res.send(archive.buffer)
	} catch (e) {
		return next(e)
	}
})

// GET /api/tests/topics/:slug/export - экспорт темы в ZIP
router.get('/topics/:slug/export', sessionRequired(), async (req, res, next) => {
	try {
		const scope = await testScope(req)
		if (!scope.all && scope.topicIds.length === 0) return res.status(403).json({ error: 'Forbidden' })

		const withAnswers = req.query.withAnswers === 'true'
		const archive = await buildTopicArchive({
			topicSlug: req.params.slug as string,
			withAnswers,
			scope,
			answersAllowed: (topicId) => canWriteTopic(req, topicId),
		})

		res.setHeader('Content-Type', 'application/zip')
		res.setHeader('Content-Disposition', `attachment; filename="${archive.filename}"`)
		return res.send(archive.buffer)
	} catch (e) {
		return next(e)
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
				studentIsActive: users.isActive,
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

			if (!(await canReviewAttempt(req, attemptId))) {
				return res.status(403).json({ error: 'Forbidden' })
			}

			const review = await readAdminAttemptView(attemptId)

			if (!review) {
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
				.where(eq(questions.testId, review.testId))
				.orderBy(asc(questions.order))

			const questionTypesMap = await getQuestionTypeMapForTest({ testId: review.testId, includeInactive: true })

			// Load prompt text for each question
			const testRow = await db.query.tests.findFirst({
				where: eq(tests.id, review.testId),
				columns: { id: true, slug: true },
				with: {
					topic: { columns: { slug: true } },
				},
			})

			const questionsWithTexts = await Promise.all(
				questionRows.map(async (q) => {
					const promptText = testRow
						? await readQuestionMarkdown({
								storedPath: q.promptPath,
								topicSlug: testRow.topic.slug,
								testSlug: testRow.slug,
								testId: testRow.id,
								questionId: q.id,
								kind: 'prompt',
							})
						: ''

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

			res.json({ attempt: review, questions: questionsWithTexts })
		} catch (e) {
			next(e)
		}
	}
)

export default router

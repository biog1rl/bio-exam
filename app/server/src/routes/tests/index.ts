/**
 * API роуты для управления тестами
 */
import { STAFF_ROLE_KEYS } from '@bio-exam/rbac'

import { and, asc, desc, eq, inArray, sql, type SQL } from 'drizzle-orm'
import { Router, type NextFunction, type Request, type Response } from 'express'
import multer from 'multer'

import { db } from '../../db/index.js'
import { answerKeys, questions, testAttempts, tests, topics, userRoles, users } from '../../db/schema.js'
import { ERROR_MESSAGES } from '../../lib/constants.js'
import { isApiError } from '../../lib/errors.js'
import { getQuestionTypeMapForTest, validateQuestionWithType } from '../../lib/tests/question-type-resolver.js'
import { requirePerm } from '../../middleware/auth/requirePerm.js'
import { sessionRequired } from '../../middleware/auth/session.js'
import { validateUUID } from '../../middleware/validateParams.js'
import {
	MoveQuestionSchema,
	ReorderQuestionsSchema,
	SaveQuestionSchema,
	SaveTestSchema,
	UpdateTestSettingsSchema,
} from '../../schemas/tests.js'
import {
	canReadTest,
	canReviewAttempt,
	canWriteTest,
	canWriteTopic,
	hasGlobalZone,
	testScope,
	type TestScope,
} from '../../services/access-policy/index.js'
import { uploadImage } from '../../services/assets/index.js'
import {
	createQuestion,
	createTestWithQuestions,
	deleteQuestion,
	deleteTest,
	moveQuestion,
	prepareTestArchive,
	prepareTopicArchive,
	questionMarkdownCandidates,
	readAdminTest,
	readQuestionTexts,
	reorderQuestions,
	updateQuestion,
	updateTestSettings,
} from '../../services/question-content/index.js'
import { readAdminAttemptView } from '../../services/scored-attempt/index.js'
import { questionDraftsRouter } from './admin/question-drafts.js'
import { questionTypesRouter } from './admin/question-types.js'
import { scoringRulesRouter } from './admin/scoring-rules.js'
import { ensureGlobalScoringRules } from './admin/shared.js'
import { testsBySlugRouter } from './admin/tests-by-slug.js'
import { testsListRouter } from './admin/tests-list.js'
import { topicsRouter } from './admin/topics.js'
import { assignmentsRouter } from './assignments.js'
import { sendArchive } from './export-response.js'

const router = Router()

router.use(topicsRouter)
router.use(testsListRouter)
router.use(questionTypesRouter)
router.use(scoringRulesRouter)
router.use(testsBySlugRouter)
router.use(questionDraftsRouter)

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
		const prepared = await prepareTestArchive({ testId: id, withAnswers })
		return await sendArchive(req, res, prepared)
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

// Admin: test-side assignment endpoints
router.use('/:testId/assignments', assignmentsRouter)

function studentAttemptsInScope(scope: TestScope): SQL | undefined {
	const notStaff = sql`not exists (select 1 from ${userRoles} where ${userRoles.userId} = ${testAttempts.userId} and ${inArray(userRoles.roleKey, [...STAFF_ROLE_KEYS])})`
	return scope.all ? notStaff : and(notStaff, inArray(tests.topicId, scope.topicIds))
}

function studentNameIn(scope: TestScope): SQL<string> {
	return scope.all
		? sql<string>`coalesce(${users.name}, ${users.firstName}, ${users.login}, 'Пользователь')`
		: sql<string>`coalesce(${users.name}, ${users.firstName}, 'Пользователь')`
}

function isEmptyScope(scope: TestScope): boolean {
	return !scope.all && scope.topicIds.length === 0
}

// =============================================================================
// Admin: Dashboard
// =============================================================================

// GET /api/tests/admin/dashboard — aggregate student activity for teacher/admin dashboard
router.get('/admin/dashboard', sessionRequired(), requirePerm('tests', 'read'), async (req, res, next) => {
	try {
		const scope = await testScope(req)
		if (isEmptyScope(scope)) {
			return res.json({
				summary: { totalAttempts: 0, activeStudents: 0, averageScore: 0, passedAttempts: 0 },
				latestAttempts: [],
				dailyActivity: [],
			})
		}
		const visible = studentAttemptsInScope(scope)

		const [summary] = await db
			.select({
				totalAttempts: sql<number>`count(*)::int`,
				activeStudents: sql<number>`count(distinct ${testAttempts.userId})::int`,
				averageScore: sql<number>`coalesce(round(avg(${testAttempts.scorePercentage})::numeric, 1), 0)::float`,
				passedAttempts: sql<number>`count(*) filter (where ${testAttempts.passed})::int`,
			})
			.from(testAttempts)
			.innerJoin(tests, eq(tests.id, testAttempts.testId))
			.where(visible)

		const latestAttempts = await db
			.select({
				attemptId: testAttempts.id,
				testId: testAttempts.testId,
				testTitle: tests.title,
				testSlug: tests.slug,
				topicSlug: topics.slug,
				topicTitle: topics.title,
				studentId: users.id,
				studentName: studentNameIn(scope),
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
			.where(visible)
			.orderBy(desc(testAttempts.submittedAt))
			.limit(8)

		const dailyActivity = await db
			.select({
				date: sql<string>`to_char(date_trunc('day', ${testAttempts.submittedAt}), 'YYYY-MM-DD')`,
				attempts: sql<number>`count(*)::int`,
				averageScore: sql<number>`coalesce(round(avg(${testAttempts.scorePercentage})::numeric, 1), 0)::float`,
			})
			.from(testAttempts)
			.innerJoin(tests, eq(tests.id, testAttempts.testId))
			.where(and(visible, sql`${testAttempts.submittedAt} >= now() - interval '30 days'`))
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
		const scope = await testScope(req)
		if (isEmptyScope(scope)) {
			return res.json({ rows: [], total: 0, limit, offset })
		}
		const visible = studentAttemptsInScope(scope)

		const [{ total: totalRaw }] = await db
			.select({
				total: sql<number>`count(*)::int`,
			})
			.from(testAttempts)
			.innerJoin(tests, eq(tests.id, testAttempts.testId))
			.where(visible)

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
				studentName: studentNameIn(scope),
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
			.where(visible)
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
router.get('/admin/attempts/:attemptId', validateUUID('attemptId'), sessionRequired(), async (req, res, next) => {
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

		const promptTexts = testRow
			? await readQuestionTexts(
					questionRows.map((q) => ({
						candidates: questionMarkdownCandidates({
							storedPath: q.promptPath,
							topicSlug: testRow.topic.slug,
							testSlug: testRow.slug,
							testId: testRow.id,
							questionId: q.id,
							fileName: 'prompt.md',
						}),
					}))
				)
			: []

		const questionsWithTexts = questionRows.map((q, index) => {
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
				promptText: promptTexts[index] ?? '',
			}
		})

		res.json({ attempt: review, questions: questionsWithTexts })
	} catch (e) {
		next(e)
	}
})

export default router

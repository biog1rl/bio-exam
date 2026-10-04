/**
 * Публичные API роуты для прохождения тестов (для студентов)
 */
import {
	AnswerValueSchema,
	SUBMIT_ERROR_CODES,
	SubmitAttemptRequestSchema,
	TelemetryMapSchema,
} from '@bio-exam/exam-core'

import { and, asc, count, desc, eq, gte, lte, sql } from 'drizzle-orm'
import { Router, type Response } from 'express'
import { z } from 'zod'

import { db } from '../../db/index.js'
import { appSettings, questions, testAttempts, tests, topics } from '../../db/schema.js'
import { getQuestionTypeMapForTest } from '../../lib/tests/question-type-resolver.js'
import { sessionRequired } from '../../middleware/auth/session.js'
import { validateUUID } from '../../middleware/validateParams.js'
import { canReadTest, testScope } from '../../services/access-policy/index.js'
import {
	checkAttemptAccess,
	closeExpiredSession,
	isAssignedOrPrivileged,
	precheckSubmit,
	saveSessionDraft,
	startAttemptSession,
	submitAttempt,
	visibleTestsFilter,
	type SessionCloseReason,
} from '../../services/attempt-sessions/index.js'
import {
	questionMarkdownCandidates,
	readFirstMarkdown as readFirstQuestionMarkdown,
} from '../../services/question-content/index.js'
import { readAttemptView, scoreSubmission } from '../../services/scored-attempt/index.js'

const router = Router()

// =============================================================================
// Zod Schemas
// =============================================================================

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const DB_RETRY_ENABLED = process.env.DB_QUERY_RETRY !== '0'

// =============================================================================
// Helpers
// =============================================================================

function buildQuestionMarkdownCandidates(params: {
	storedPath: string | null
	topicSlug: string
	testSlug: string
	testId: string
	questionId: string
	fileName: 'prompt.md' | 'explanation.md'
}): string[] {
	return questionMarkdownCandidates(params)
}

async function readFirstMarkdown(candidates: string[]): Promise<string> {
	return readFirstQuestionMarkdown(candidates)
}

function errorText(err: unknown): string {
	if (err instanceof Error) {
		const parts = [err.message]
		const cause = (err as Error & { cause?: unknown }).cause
		if (cause instanceof Error) parts.push(cause.message)
		return parts.join(' | ')
	}
	return String(err)
}

function isTransientDbError(err: unknown): boolean {
	const message = errorText(err).toLowerCase()
	return (
		message.includes('connection terminated unexpectedly') ||
		message.includes('query read timeout') ||
		message.includes('econnreset') ||
		message.includes('etimedout') ||
		message.includes('eai_again')
	)
}

function denyAttemptAccess(res: Response, status: 403 | 404) {
	if (status === 404) return res.status(404).json({ error: 'Test not found' })
	return res.status(403).json({ error: 'Тест не назначен' })
}

function sessionNotFound(res: Response) {
	return res.status(404).json({ error: 'Session not found' })
}

function attemptAlreadySubmitted(res: Response, attemptId: string | null) {
	return res.status(409).json({ error: SUBMIT_ERROR_CODES.alreadySubmitted, attemptId })
}

function timeExpired(res: Response) {
	return res.status(422).json({ error: SUBMIT_ERROR_CODES.timeExpired })
}

function rejectClosedSession(res: Response, reason: SessionCloseReason) {
	if (reason === 'superseded') return sessionNotFound(res)
	return timeExpired(res)
}

async function withTransientDbRetry<T>(label: string, task: () => Promise<T>): Promise<T> {
	try {
		return await task()
	} catch (err) {
		if (!DB_RETRY_ENABLED || !isTransientDbError(err)) throw err
		// eslint-disable-next-line no-console
		console.warn(`[db-retry] ${label}: retry once after transient DB error`)
		await new Promise((resolve) => setTimeout(resolve, 120))
		return task()
	}
}

// =============================================================================
// Endpoints
// =============================================================================

// GET /api/tests/public/topics - список активных тем
router.get('/topics', async (_req, res, next) => {
	try {
		const rows = await db
			.select({
				id: topics.id,
				slug: topics.slug,
				title: topics.title,
				description: topics.description,
			})
			.from(topics)
			.where(eq(topics.isActive, true))
			.orderBy(asc(topics.order), asc(topics.title))

		res.json({ topics: rows })
	} catch (e) {
		next(e)
	}
})

// GET /api/tests/public/tests - список всех опубликованных тестов в активных темах
router.get('/tests', sessionRequired(), async (req, res, next) => {
	try {
		const userId = req.authUser!.id
		const scope = await testScope(req)

		const rows = await db
			.select({
				id: tests.id,
				slug: tests.slug,
				title: tests.title,
				description: tests.description,
				showCorrectAnswer: tests.showCorrectAnswer,
				timeLimitMinutes: tests.timeLimitMinutes,
				passingScore: tests.passingScore,
				topicId: topics.id,
				topicSlug: topics.slug,
				topicTitle: topics.title,
				questionsCount: sql<number>`count(${questions.id})::int`.as('questionsCount'),
			})
			.from(tests)
			.innerJoin(topics, and(eq(tests.topicId, topics.id), eq(topics.isActive, true)))
			.leftJoin(questions, eq(questions.testId, tests.id))
			.where(and(eq(tests.isPublished, true), visibleTestsFilter({ userId, scope })))
			.groupBy(tests.id, topics.id, topics.slug, topics.title)
			.orderBy(asc(topics.order), asc(topics.title), asc(tests.order), asc(tests.title))

		res.json({ tests: rows })
	} catch (e) {
		next(e)
	}
})

// GET /api/tests/public/topics/:slug/tests - список опубликованных тестов в теме
router.get('/topics/:slug/tests', sessionRequired(), async (req, res, next) => {
	try {
		const { slug } = req.params as { slug: string }
		const userId = req.authUser!.id
		const scope = await testScope(req)

		const topic = await db.query.topics.findFirst({
			where: and(eq(topics.slug, slug), eq(topics.isActive, true)),
		})

		if (!topic) {
			return res.status(404).json({ error: 'Topic not found' })
		}

		const rows = await db
			.select({
				id: tests.id,
				slug: tests.slug,
				title: tests.title,
				description: tests.description,
				timeLimitMinutes: tests.timeLimitMinutes,
				passingScore: tests.passingScore,
				questionsCount: sql<number>`count(${questions.id})::int`.as('questionsCount'),
			})
			.from(tests)
			.leftJoin(questions, eq(questions.testId, tests.id))
			.where(and(eq(tests.topicId, topic.id), eq(tests.isPublished, true), visibleTestsFilter({ userId, scope })))
			.groupBy(tests.id)
			.orderBy(asc(tests.order), asc(tests.title))

		res.json({ tests: rows, topicTitle: topic.title })
	} catch (e) {
		next(e)
	}
})

// GET /api/tests/public/topics/:topicSlug/tests/:testSlug - получить тест по slug темы и slug теста
router.get('/topics/:topicSlug/tests/:testSlug', sessionRequired(), async (req, res, next) => {
	try {
		const { topicSlug, testSlug } = req.params as { topicSlug: string; testSlug: string }

		const testRows = await withTransientDbRetry('public test by slug', () =>
			db
				.select({
					id: tests.id,
					slug: tests.slug,
					title: tests.title,
					description: tests.description,
					showCorrectAnswer: tests.showCorrectAnswer,
					timeLimitMinutes: tests.timeLimitMinutes,
					passingScore: tests.passingScore,
					topicId: topics.id,
					topicSlug: topics.slug,
					topicTitle: topics.title,
				})
				.from(tests)
				.innerJoin(topics, eq(tests.topicId, topics.id))
				.where(
					and(
						eq(topics.slug, topicSlug),
						eq(topics.isActive, true),
						eq(tests.slug, testSlug),
						eq(tests.isPublished, true)
					)
				)
				.limit(1)
		)
		let test = testRows[0]
		if (!test && UUID_RE.test(testSlug)) {
			const fallbackRows = await withTransientDbRetry('public test by id fallback', () =>
				db
					.select({
						id: tests.id,
						slug: tests.slug,
						title: tests.title,
						description: tests.description,
						showCorrectAnswer: tests.showCorrectAnswer,
						timeLimitMinutes: tests.timeLimitMinutes,
						passingScore: tests.passingScore,
						topicId: topics.id,
						topicSlug: topics.slug,
						topicTitle: topics.title,
					})
					.from(tests)
					.innerJoin(topics, eq(tests.topicId, topics.id))
					.where(
						and(
							eq(topics.slug, topicSlug),
							eq(topics.isActive, true),
							eq(tests.id, testSlug),
							eq(tests.isPublished, true)
						)
					)
					.limit(1)
			)
			test = fallbackRows[0]
		}
		if (!test) {
			return res.status(404).json({ error: 'Test not found' })
		}

		const userId = req.authUser!.id
		const allowed = await withTransientDbRetry('public test assignment check', () =>
			isAssignedOrPrivileged({ testId: test.id, userId, canReadTest: () => canReadTest(req, test.id) })
		)
		if (!allowed) return denyAttemptAccess(res, 403)

		if (req.query.view === 'summary') {
			return res.json({ test })
		}

		const questionRows = await withTransientDbRetry('public test questions list', () =>
			db
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
				.where(eq(questions.testId, test.id))
				.orderBy(asc(questions.order))
		)
		const questionTypesMap = await withTransientDbRetry('public test question types', () =>
			getQuestionTypeMapForTest({ testId: test.id, includeInactive: true })
		)

		const questionsWithTexts = await Promise.all(
			questionRows.map(async (q) => {
				const promptCandidates = buildQuestionMarkdownCandidates({
					storedPath: q.promptPath,
					topicSlug: test.topicSlug,
					testSlug: test.slug,
					testId: test.id,
					questionId: q.id,
					fileName: 'prompt.md',
				})

				const promptText = await readFirstMarkdown(promptCandidates)
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
				}
			})
		)

		res.json({
			test,
			questions: questionsWithTexts,
		})
	} catch (e) {
		next(e)
	}
})

// GET /api/tests/public/tests/:id - получить тест и вопросы (БЕЗ ОТВЕТОВ)
router.get('/tests/:id', validateUUID('id'), sessionRequired(), async (req, res, next) => {
	try {
		const testId = req.params.id as string
		const userId = req.authUser!.id

		const access = await checkAttemptAccess({ testId, userId, canReadTest: () => canReadTest(req, testId) })
		if (!access.ok) return denyAttemptAccess(res, access.status)
		const test = access.test

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
			.where(eq(questions.testId, test.id))
			.orderBy(asc(questions.order))
		const questionTypesMap = await getQuestionTypeMapForTest({ testId: test.id, includeInactive: true })

		const questionsWithTexts = await Promise.all(
			questionRows.map(async (q) => {
				const promptCandidates = buildQuestionMarkdownCandidates({
					storedPath: q.promptPath,
					topicSlug: test.topicSlug,
					testSlug: test.slug,
					testId: test.id,
					questionId: q.id,
					fileName: 'prompt.md',
				})

				const promptText = await readFirstMarkdown(promptCandidates)
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
				}
			})
		)

		res.json({
			test,
			questions: questionsWithTexts,
		})
	} catch (e) {
		next(e)
	}
})

// GET /api/tests/public/tests/:id/attempts/me - история попыток текущего пользователя (с пагинацией)
router.get('/tests/:id/attempts/me', validateUUID('id'), sessionRequired(), async (req, res, next) => {
	try {
		const testId = req.params.id as string
		const userId = req.authUser?.id
		if (!userId) return res.status(401).json({ error: 'Unauthorized' })

		const access = await checkAttemptAccess({ testId, userId, canReadTest: () => canReadTest(req, testId) })
		if (!access.ok) return denyAttemptAccess(res, access.status)

		const offsetRaw = parseInt((req.query.offset as string) ?? '0', 10)
		const limitRaw = parseInt((req.query.limit as string) ?? '5', 10)
		const offset = isNaN(offsetRaw) || offsetRaw < 0 ? 0 : offsetRaw
		const limit = isNaN(limitRaw) || limitRaw < 1 ? 5 : Math.min(limitRaw, 100)

		const whereClause = and(eq(testAttempts.testId, testId), eq(testAttempts.userId, userId))

		const [totalResult, rows] = await Promise.all([
			db.select({ total: count() }).from(testAttempts).where(whereClause),
			db
				.select({
					id: testAttempts.id,
					earnedPoints: testAttempts.earnedPoints,
					totalPoints: testAttempts.totalPoints,
					scorePercentage: testAttempts.scorePercentage,
					passed: testAttempts.passed,
					submittedAt: testAttempts.submittedAt,
				})
				.from(testAttempts)
				.where(whereClause)
				.orderBy(desc(testAttempts.submittedAt))
				.limit(limit)
				.offset(offset),
		])

		const total = totalResult[0]?.total ?? 0
		res.json({ rows, total })
	} catch (e) {
		next(e)
	}
})

// GET /api/tests/public/tests/:id/chart-data - данные для графика (все попытки в диапазоне дат)
router.get('/tests/:id/chart-data', validateUUID('id'), sessionRequired(), async (req, res, next) => {
	try {
		const testId = req.params.id as string
		const userId = req.authUser?.id
		if (!userId) return res.status(401).json({ error: 'Unauthorized' })

		const access = await checkAttemptAccess({ testId, userId, canReadTest: () => canReadTest(req, testId) })
		if (!access.ok) return denyAttemptAccess(res, access.status)

		const fromParam = req.query.from as string | undefined
		const toParam = req.query.to as string | undefined

		const conditions = [eq(testAttempts.testId, testId), eq(testAttempts.userId, userId)]
		if (fromParam) {
			const fromDate = new Date(fromParam)
			if (!isNaN(fromDate.getTime())) {
				conditions.push(gte(testAttempts.submittedAt, fromDate))
			}
		}
		if (toParam) {
			const toDate = new Date(toParam)
			if (!isNaN(toDate.getTime())) {
				conditions.push(lte(testAttempts.submittedAt, toDate))
			}
		}

		// Fetch all attempts in range ordered ASC
		const allAttempts = await db
			.select({
				scorePercentage: testAttempts.scorePercentage,
				submittedAt: testAttempts.submittedAt,
			})
			.from(testAttempts)
			.where(and(...conditions))
			.orderBy(asc(testAttempts.submittedAt))

		// Group by date (YYYY-MM-DD), keep max/min/count per day
		const byDate = new Map<string, { scores: number[] }>()
		for (const a of allAttempts) {
			const dateKey = a.submittedAt.toISOString().slice(0, 10)
			if (!byDate.has(dateKey)) byDate.set(dateKey, { scores: [] })
			byDate.get(dateKey)!.scores.push(Math.round(a.scorePercentage ?? 0))
		}

		const data = [...byDate.entries()].map(([date, { scores }]) => ({
			date,
			maxScore: Math.max(...scores),
			minScore: Math.min(...scores),
			count: scores.length,
		}))

		res.json({ data })
	} catch (e) {
		next(e)
	}
})

// POST /api/tests/public/tests/:id/start - начать тестовую сессию (записать startedAt)
router.post('/tests/:id/start', validateUUID('id'), sessionRequired(), async (req, res, next) => {
	try {
		const testId = req.params.id as string
		const userId = req.authUser!.id

		const access = await checkAttemptAccess({ testId, userId, canReadTest: () => canReadTest(req, testId) })
		if (!access.ok) return denyAttemptAccess(res, access.status)

		res.json(await startAttemptSession({ testId, userId, timeLimitMinutes: access.test.timeLimitMinutes }))
	} catch (e) {
		next(e)
	}
})

// PATCH /api/tests/public/tests/:id/sessions/:sessionId/answers - промежуточное сохранение черновика ответов в БД
const SaveDraftAnswerSchema = z
	.object({
		questionId: z.string().uuid().optional(),
		value: AnswerValueSchema.optional(),
		telemetry: TelemetryMapSchema.optional(),
	})
	.superRefine((data, ctx) => {
		const hasQuestion = data.questionId !== undefined
		const hasValue = data.value !== undefined
		if (hasQuestion !== hasValue || (!hasQuestion && data.telemetry === undefined)) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'Provide questionId with value, telemetry, or both',
			})
		}
	})

router.patch(
	'/tests/:id/sessions/:sessionId/answers',
	validateUUID('id'),
	validateUUID('sessionId'),
	sessionRequired(),
	async (req, res, next) => {
		try {
			const testId = req.params.id as string
			const sessionId = req.params.sessionId as string
			const userId = req.authUser!.id

			const parsed = SaveDraftAnswerSchema.safeParse(req.body)
			if (!parsed.success) {
				return res.status(400).json({ error: 'Bad request', details: parsed.error.flatten() })
			}
			const { questionId, value, telemetry } = parsed.data

			const access = await checkAttemptAccess({ testId, userId, canReadTest: () => canReadTest(req, testId) })
			if (!access.ok) return denyAttemptAccess(res, access.status)

			const saved = await saveSessionDraft({
				testId,
				userId,
				testSessionId: sessionId,
				questionId,
				value,
				telemetry,
			})
			if (saved === 'not_found') {
				return res.status(404).json({ error: 'Session not found or already submitted' })
			}

			res.json({ ok: true })
		} catch (e) {
			next(e)
		}
	}
)

// POST /api/tests/public/tests/:id/submit - проверить ответы, сохранить попытку, вернуть результат
router.post('/tests/:id/submit', validateUUID('id'), sessionRequired(), async (req, res, next) => {
	try {
		const testId = req.params.id as string
		const userId = req.authUser?.id
		if (!userId) return res.status(401).json({ error: 'Unauthorized' })

		const parsed = SubmitAttemptRequestSchema.safeParse(req.body)
		if (!parsed.success) {
			return res.status(400).json({ error: 'Bad request', details: parsed.error.flatten() })
		}

		const { sessionId, clientAttemptId, answers: userAnswers, telemetry } = parsed.data

		const access = await checkAttemptAccess({ testId, userId, canReadTest: () => canReadTest(req, testId) })
		if (!access.ok) return denyAttemptAccess(res, access.status)
		const test = access.test
		const viewer = { kind: 'student' as const, showCorrectAnswer: test.showCorrectAnswer }

		const precheck = await precheckSubmit({
			testId,
			userId,
			testSessionId: sessionId,
			clientAttemptId,
			timeLimitMinutes: test.timeLimitMinutes,
		})
		if (precheck.kind === 'not_found') return sessionNotFound(res)
		if (precheck.kind === 'submitted') {
			if (precheck.sameClient && precheck.attemptId) return res.json(await readAttemptView(precheck.attemptId, viewer))
			return attemptAlreadySubmitted(res, precheck.attemptId)
		}
		if (precheck.kind === 'closed') return rejectClosedSession(res, precheck.reason)
		if (precheck.kind === 'expired') {
			await closeExpiredSession(sessionId)
			return timeExpired(res)
		}

		const scored = await scoreSubmission({
			testId,
			answers: userAnswers,
			passingScore: test.passingScore,
			readExplanation: (q) =>
				q.explanationPath
					? readFirstMarkdown(
							buildQuestionMarkdownCandidates({
								storedPath: q.explanationPath,
								topicSlug: test.topicSlug,
								testSlug: test.slug,
								testId,
								questionId: q.id,
								fileName: 'explanation.md',
							})
						).then((text) => text || null)
					: Promise.resolve(null),
		})
		if (!scored.ok) {
			if (scored.reason === 'no_questions') return res.status(404).json({ error: 'Questions not found' })
			return res.status(500).json({ error: `Question type is not configured: ${scored.type}` })
		}
		const { facts, earnedPoints, totalPoints, scorePercentage, passed } = scored

		const outcome = await submitAttempt({
			testId,
			userId,
			testSessionId: sessionId,
			clientAttemptId,
			answers: userAnswers,
			telemetry,
			scored: { results: facts, resultsVersion: 2, earnedPoints, totalPoints, scorePercentage, passed },
		})
		if (outcome.kind === 'not_found') return sessionNotFound(res)
		if (outcome.kind === 'conflict') return attemptAlreadySubmitted(res, outcome.attemptId)
		if (outcome.kind === 'closed') return rejectClosedSession(res, outcome.reason)
		res.json(await readAttemptView(outcome.attemptId, viewer))
	} catch (e) {
		next(e)
	}
})

export default router

/**
 * Публичные API роуты для прохождения тестов (для студентов)
 */
import {
	SaveAttemptDraftRequestSchema,
	SUBMIT_ERROR_CODES,
	SubmitAttemptRequestSchema,
	type AnswerViolation,
} from '@bio-exam/exam-core'

import { and, asc, count, desc, eq, gte, lte, ne, sql } from 'drizzle-orm'
import { Router, type Response } from 'express'

import { db } from '../../db/index.js'
import { questions, testAttempts, tests, topics } from '../../db/schema.js'
import { isTransientDbError } from '../../lib/db-errors.js'
import { sessionRequired } from '../../middleware/auth/session.js'
import { validateUUID } from '../../middleware/validateParams.js'
import { canReadTest, testScope } from '../../services/access-policy/index.js'
import {
	checkAttemptAccess,
	databaseNow,
	findVisibleTestBySlug,
	explanationReaderFor,
	finalizeExpiredOpenSession,
	finalizeSessionByDeadline,
	isAssignedOrPrivileged,
	precheckSubmit,
	saveSessionDraft,
	SessionNeedsFinalizationError,
	startAttemptSession,
	submitAttempt,
	visibleTestsFilter,
	type SessionCloseReason,
} from '../../services/attempt-sessions/index.js'
import {
	attemptResultColumns,
	readAttemptView,
	scoreSubmission,
	type AttemptViewer,
} from '../../services/scored-attempt/index.js'
import { readStudentQuestions } from './student-question-view.js'

const router = Router()

// =============================================================================
// Zod Schemas
// =============================================================================

const DB_RETRY_ENABLED = process.env.DB_QUERY_RETRY !== '0'

// =============================================================================
// Helpers
// =============================================================================

function answersInvalidBody(violation: AnswerViolation) {
	return {
		error: SUBMIT_ERROR_CODES.answersInvalid,
		reason: violation.reason,
		...(violation.limit ? { limit: violation.limit } : {}),
	}
}

function denyAttemptAccess(res: Response, status: 403 | 404) {
	if (status === 404) return res.status(404).json({ error: 'Test not found' })
	return res.status(403).json({ error: 'Тест не назначен' })
}

function sessionNotFound(res: Response) {
	return res.status(404).json({ error: 'Session not found' })
}

async function sendAlreadySubmitted(res: Response, attemptId: string | null, viewer: AttemptViewer) {
	if (attemptId === null) return res.status(409).json({ error: SUBMIT_ERROR_CODES.alreadySubmitted, attemptId })
	const view = await readAttemptView(attemptId, viewer)
	if (view.submitSource !== 'deadline') {
		return res.status(409).json({ error: SUBMIT_ERROR_CODES.alreadySubmitted, attemptId })
	}
	return res.status(409).json({
		error: SUBMIT_ERROR_CODES.alreadySubmitted,
		attemptId,
		submitSource: 'deadline',
		uploadClosesAt: view.uploadClosesAt ?? null,
		serverNow: await databaseNow(),
		attempt: view,
	})
}

function timeExpired(res: Response) {
	return res.status(422).json({ error: SUBMIT_ERROR_CODES.timeExpired })
}

function rejectClosedSession(res: Response, reason: SessionCloseReason) {
	if (reason === 'superseded') return sessionNotFound(res)
	return timeExpired(res)
}

async function startAfterFinalization(params: { testId: string; userId: string; timeLimitMinutes: number | null }) {
	try {
		return await startAttemptSession(params)
	} catch (error) {
		if (!(error instanceof SessionNeedsFinalizationError)) throw error
		await finalizeSessionByDeadline(error.sessionId, { testId: params.testId, userId: params.userId })
		return startAttemptSession(params)
	}
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

		const test = await withTransientDbRetry('public test by slug', () => findVisibleTestBySlug(topicSlug, testSlug))
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

		const questionsWithTexts = await withTransientDbRetry('public test questions', () => readStudentQuestions(test))

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

		const questionsWithTexts = await readStudentQuestions(test)

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
					...attemptResultColumns,
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

router.get('/tests/:id/chart-data', validateUUID('id'), sessionRequired(), async (req, res, next) => {
	try {
		const testId = req.params.id as string
		const userId = req.authUser?.id
		if (!userId) return res.status(401).json({ error: 'Unauthorized' })

		const access = await checkAttemptAccess({ testId, userId, canReadTest: () => canReadTest(req, testId) })
		if (!access.ok) return denyAttemptAccess(res, access.status)

		const fromParam = req.query.from as string | undefined
		const toParam = req.query.to as string | undefined

		const conditions = [
			eq(testAttempts.testId, testId),
			eq(testAttempts.userId, userId),
			ne(testAttempts.reviewStatus, 'pending'),
		]
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

		const attempts = await db
			.select({
				id: testAttempts.id,
				earnedPoints: testAttempts.finalEarnedPoints,
				totalPoints: testAttempts.totalPoints,
				scorePercentage: testAttempts.finalScorePercentage,
				passed: testAttempts.finalPassed,
				submittedAt: testAttempts.submittedAt,
			})
			.from(testAttempts)
			.where(and(...conditions))
			.orderBy(asc(testAttempts.submittedAt), asc(testAttempts.id))

		res.json({ attempts })
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

		const params = { testId, userId, timeLimitMinutes: access.test.timeLimitMinutes }
		await finalizeExpiredOpenSession(params)
		res.json(await startAfterFinalization(params))
	} catch (e) {
		next(e)
	}
})

// PATCH /api/tests/public/tests/:id/sessions/:sessionId/answers - промежуточное сохранение черновика ответов в БД
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

			const parsed = SaveAttemptDraftRequestSchema.safeParse(req.body)
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
				timeLimitMinutes: access.test.timeLimitMinutes,
				questionId,
				value,
				telemetry,
			})
			if (saved.kind === 'not_found') {
				if (access.test.timeLimitMinutes != null) {
					await finalizeSessionByDeadline(sessionId, { testId, userId })
				}
				return res.status(404).json({ error: 'Session not found or already submitted' })
			}
			if (saved.kind === 'invalid') return res.status(400).json(answersInvalidBody(saved.violation))

			res.json({ ok: true, serverNow: saved.serverNow })
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
			return sendAlreadySubmitted(res, precheck.attemptId, viewer)
		}
		if (precheck.kind === 'closed') return rejectClosedSession(res, precheck.reason)
		if (precheck.kind === 'expired') {
			const finalized = await finalizeSessionByDeadline(sessionId, { testId, userId })
			if (finalized.kind === 'finalized' || finalized.kind === 'submitted') {
				return sendAlreadySubmitted(res, finalized.attemptId, viewer)
			}
			if (finalized.kind === 'expired') return timeExpired(res)
			if (finalized.kind === 'superseded' || finalized.kind === 'not_found') return sessionNotFound(res)
		}

		const scored = await scoreSubmission({
			testId,
			answers: userAnswers,
			passingScore: test.passingScore,
			readExplanation: explanationReaderFor({ id: testId, slug: test.slug, topicSlug: test.topicSlug }),
		})
		if (!scored.ok) {
			if (scored.reason === 'no_questions') return res.status(404).json({ error: 'Questions not found' })
			return res.status(422).json(answersInvalidBody(scored.violation))
		}
		const { facts, outcome: scoredOutcome, passingScore, earnedPoints, totalPoints, scorePercentage, passed } = scored

		const outcome = await submitAttempt({
			testId,
			userId,
			testSessionId: sessionId,
			clientAttemptId,
			answers: userAnswers,
			telemetry,
			scored: {
				results: facts,
				resultsVersion: 2,
				earnedPoints,
				totalPoints,
				scorePercentage,
				passed,
				outcome: scoredOutcome,
				passingScore,
			},
			timeLimitMinutes: test.timeLimitMinutes,
			uploadWindowMinutes: test.photoUploadWindowMinutes,
			hasOpenQuestion: facts.some((fact) => fact.template === 'open'),
		})
		if (outcome.kind === 'not_found') return sessionNotFound(res)
		if (outcome.kind === 'conflict') return sendAlreadySubmitted(res, outcome.attemptId, viewer)
		if (outcome.kind === 'closed') return rejectClosedSession(res, outcome.reason)
		if (outcome.kind === 'draft_changed') throw new Error('submitAttempt: draft_changed without expectedDraft')
		res.json(await readAttemptView(outcome.attemptId, viewer))
	} catch (e) {
		next(e)
	}
})

export default router

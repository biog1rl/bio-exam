import { STAFF_ROLE_KEYS } from '@bio-exam/rbac'

import { and, asc, desc, eq, inArray, sql, type SQL } from 'drizzle-orm'
import { Router } from 'express'

import { db } from '../../../db/index.js'
import { questions, testAttempts, tests, topics, userRoles, users } from '../../../db/schema.js'
import { getQuestionTypeMapForTest } from '../../../lib/tests/question-type-resolver.js'
import { requirePerm } from '../../../middleware/auth/requirePerm.js'
import { sessionRequired } from '../../../middleware/auth/session.js'
import { validateUUID } from '../../../middleware/validateParams.js'
import { canReviewAttempt, testScope, type TestScope } from '../../../services/access-policy/index.js'
import { questionMarkdownCandidates, readQuestionTexts } from '../../../services/question-content/index.js'
import { readAdminAttemptView } from '../../../services/scored-attempt/index.js'

const router = Router()

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

export { router as attemptsRouter }

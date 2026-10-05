import { STAFF_ROLE_KEYS } from '@bio-exam/rbac'

import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from 'drizzle-orm'
import { Router } from 'express'
import { z } from 'zod'

import { db } from '../../../db/index.js'
import { questions, testAttempts, tests, topics, userRoles, users } from '../../../db/schema.js'
import { getQuestionTypeMapForTest } from '../../../lib/tests/question-type-resolver.js'
import { requirePerm } from '../../../middleware/auth/requirePerm.js'
import { sessionRequired } from '../../../middleware/auth/session.js'
import { validateUUID } from '../../../middleware/validateParams.js'
import { canReviewAttempt, testScope, type TestScope } from '../../../services/access-policy/index.js'
import { questionMarkdownCandidates, readQuestionTexts } from '../../../services/question-content/index.js'
import { attemptResultColumns, readAdminAttemptView } from '../../../services/scored-attempt/index.js'
import { escapeLike } from '../../../services/search/index.js'

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

function nullableNumber(value: number | string | null | undefined): number | null {
	return value == null ? null : Number(value)
}

function isEmptyScope(scope: TestScope): boolean {
	return !scope.all && scope.topicIds.length === 0
}

const AttemptsQuerySchema = z.object({
	limit: z.coerce.number().int().min(1).max(100).default(50),
	offset: z.coerce.number().int().min(0).default(0),
	q: z.string().trim().max(200).default(''),
	topic: z.string().trim().min(1).max(200).optional(),
	student: z.string().uuid().optional(),
	from: z.string().datetime({ offset: true }).optional(),
	to: z.string().datetime({ offset: true }).optional(),
	status: z.enum(['active', 'inactive', 'all']).default('all'),
	review: z.enum(['all', 'pending', 'graded']).default('all'),
})

type AttemptsQuery = z.infer<typeof AttemptsQuerySchema>

function attemptFilters(scope: TestScope, query: AttemptsQuery): Array<SQL | undefined> {
	const filters: Array<SQL | undefined> = []
	if (query.topic) filters.push(eq(topics.slug, query.topic))
	if (query.student) filters.push(eq(users.id, query.student))
	if (query.from) filters.push(gte(testAttempts.submittedAt, new Date(query.from)))
	if (query.to) filters.push(lte(testAttempts.submittedAt, new Date(query.to)))
	if (query.status !== 'all') filters.push(eq(users.isActive, query.status === 'active'))
	if (query.review !== 'all') filters.push(eq(testAttempts.reviewStatus, query.review))
	if (query.q) {
		const pattern = `%${escapeLike(query.q)}%`
		filters.push(
			or(
				ilike(studentNameIn(scope), pattern),
				ilike(tests.title, pattern),
				ilike(topics.title, pattern),
				scope.all ? ilike(users.login, pattern) : undefined
			)
		)
	}
	return filters
}

router.get('/admin/dashboard', sessionRequired(), requirePerm('tests', 'read'), async (req, res, next) => {
	try {
		const scope = await testScope(req)
		if (isEmptyScope(scope)) {
			return res.json({
				summary: { totalAttempts: 0, activeStudents: 0, averageScore: null, passedAttempts: 0 },
				latestAttempts: [],
				dailyActivity: [],
			})
		}
		const visible = studentAttemptsInScope(scope)

		const [summary] = await db
			.select({
				totalAttempts: sql<number>`count(*)::int`,
				activeStudents: sql<number>`count(distinct ${testAttempts.userId})::int`,
				averageScore: sql<
					number | null
				>`round(avg(${testAttempts.finalScorePercentage}) filter (where ${testAttempts.reviewStatus} <> 'pending')::numeric, 1)::float`,
				passedAttempts: sql<number>`count(*) filter (where ${testAttempts.finalPassed} and ${testAttempts.reviewStatus} <> 'pending')::int`,
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
				...attemptResultColumns,
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
				averageScore: sql<
					number | null
				>`round(avg(${testAttempts.finalScorePercentage}) filter (where ${testAttempts.reviewStatus} <> 'pending')::numeric, 1)::float`,
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
				averageScore: nullableNumber(summary?.averageScore),
				passedAttempts: Number(summary?.passedAttempts ?? 0),
			},
			latestAttempts: latestAttempts.map((attempt) => ({
				...attempt,
				submittedAt: attempt.submittedAt instanceof Date ? attempt.submittedAt.toISOString() : attempt.submittedAt,
			})),
			dailyActivity: dailyActivity.map((item) => ({
				date: item.date,
				attempts: Number(item.attempts ?? 0),
				averageScore: nullableNumber(item.averageScore),
			})),
		})
	} catch (e) {
		next(e)
	}
})

router.get('/admin/attempts', sessionRequired(), requirePerm('tests', 'read'), async (req, res, next) => {
	try {
		const parsed = AttemptsQuerySchema.safeParse(req.query)
		if (!parsed.success) {
			return res.status(400).json({ error: 'Invalid attempts query', details: parsed.error.flatten() })
		}
		const query = parsed.data
		const { limit, offset } = query
		const scope = await testScope(req)
		if (isEmptyScope(scope)) {
			return res.json({
				rows: [],
				total: 0,
				limit,
				offset,
				summary: { passed: 0, averageScore: null, pendingTotal: 0 },
				scopeTotal: 0,
				facets: { topics: [], students: [] },
			})
		}
		const visible = studentAttemptsInScope(scope)
		const filtered = and(visible, ...attemptFilters(scope, query))

		const [counts] = await db
			.select({
				total: sql<number>`count(*)::int`,
				passed: sql<number>`count(*) filter (where ${testAttempts.finalPassed} and ${testAttempts.reviewStatus} <> 'pending')::int`,
				averageScore: sql<
					number | null
				>`round(avg(${testAttempts.finalScorePercentage}) filter (where ${testAttempts.reviewStatus} <> 'pending')::numeric, 1)::float`,
			})
			.from(testAttempts)
			.innerJoin(users, eq(users.id, testAttempts.userId))
			.innerJoin(tests, eq(tests.id, testAttempts.testId))
			.innerJoin(topics, eq(topics.id, tests.topicId))
			.where(filtered)

		const [scopeCounts] = await db
			.select({
				total: sql<number>`count(*)::int`,
				pendingTotal: sql<number>`count(*) filter (where ${testAttempts.reviewStatus} = 'pending')::int`,
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
				...attemptResultColumns,
			})
			.from(testAttempts)
			.innerJoin(users, eq(users.id, testAttempts.userId))
			.innerJoin(tests, eq(tests.id, testAttempts.testId))
			.innerJoin(topics, eq(topics.id, tests.topicId))
			.where(filtered)
			.orderBy(desc(testAttempts.submittedAt), desc(testAttempts.id))
			.limit(limit)
			.offset(offset)

		const topicFacets = await db
			.selectDistinct({ slug: topics.slug, title: topics.title })
			.from(testAttempts)
			.innerJoin(tests, eq(tests.id, testAttempts.testId))
			.innerJoin(topics, eq(topics.id, tests.topicId))
			.where(visible)
			.orderBy(asc(topics.title), asc(topics.slug))

		const studentName = studentNameIn(scope)
		const studentFacets = await db
			.selectDistinct({ id: users.id, name: studentName, isActive: users.isActive })
			.from(testAttempts)
			.innerJoin(users, eq(users.id, testAttempts.userId))
			.innerJoin(tests, eq(tests.id, testAttempts.testId))
			.where(visible)
			.orderBy(asc(studentName), asc(users.id))

		res.json({
			rows: rows.map((attempt) => ({
				...attempt,
				submittedAt: attempt.submittedAt instanceof Date ? attempt.submittedAt.toISOString() : attempt.submittedAt,
			})),
			total: Number(counts?.total ?? 0),
			limit,
			offset,
			summary: {
				passed: Number(counts?.passed ?? 0),
				averageScore: nullableNumber(counts?.averageScore),
				pendingTotal: Number(scopeCounts?.pendingTotal ?? 0),
			},
			scopeTotal: Number(scopeCounts?.total ?? 0),
			facets: { topics: topicFacets, students: studentFacets },
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

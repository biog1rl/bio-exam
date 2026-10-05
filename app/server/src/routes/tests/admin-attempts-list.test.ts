import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { afterAll, beforeAll, describe, test } from 'vitest'

import { insertAttemptFixture, type AttemptFixtureFact } from '../../test-support/attempt-fixture.js'
import { call, startAuthApp, type AuthApp, type Reply } from '../../test-support/auth-app.js'
import {
	seedTeacherZoneWorld,
	type TeacherZoneWorld,
	type ZoneProfile,
	type ZoneUser,
} from '../../test-support/teacher-zone-world.js'

const BULK = 105
const OLD_AT = '2020-01-15T10:00:00.000Z'
const SEEDED_ALL = BULK + 6
const SEEDED_X = BULK + 4
const REVIEW_ADDED_ALL = 4
const REVIEW_ADDED_X = 3
const REVIEW_PASSING_SCORE = 50

type AttemptRow = {
	attemptId: string
	studentId: string
	studentName: string
	studentIsActive: boolean
	topicSlug: string
	testTitle: string
	submittedAt: string
	passed: boolean | null
	earnedPoints: number | null
	totalPoints: number
	scorePercentage: number | null
	reviewStatus: 'none' | 'pending' | 'graded'
	autoEarnedPoints: number
	autoTotalPoints: number
}

type Json = Record<string, unknown>

type Facets = {
	topics: Array<{ slug: string; title: string }>
	students: Array<{ id: string; name: string; isActive: boolean }>
}

let ctx: AuthApp
let w: TeacherZoneWorld
let oldStudent: ZoneUser
let inactiveStudent: ZoneUser
let oldAttemptId = ''
let inactiveAttemptId = ''
let reviewStudent: ZoneUser
let pendingAttemptId = ''
let gradedAttemptId = ''
let pendingForeignAttemptId = ''
let pendingInactiveAttemptId = ''

function list(profile: ZoneProfile, params: Record<string, string> = {}): Promise<Reply> {
	const search = new URLSearchParams(params).toString()
	return call(ctx, 'GET', `/api/tests/admin/attempts${search ? `?${search}` : ''}`, {
		cookies: w.users[profile].cookie,
	})
}

function ok(reply: Reply): Reply {
	assert.equal(reply.status, 200, `ожидался 200, пришёл ${reply.status}: ${JSON.stringify(reply.body)}`)
	return reply
}

function rowsOf(reply: Reply): AttemptRow[] {
	assert.ok(Array.isArray(reply.body.rows), 'нет rows')
	return reply.body.rows as AttemptRow[]
}

function facetsOf(reply: Reply): Facets {
	const facets = reply.body.facets as Facets | undefined
	assert.ok(facets && Array.isArray(facets.topics) && Array.isArray(facets.students), 'нет facets')
	return facets
}

async function insertAttempt(input: {
	testId: string
	userId: string
	submittedAt: string
	score: number
	passed: boolean
}): Promise<string> {
	return insertAttemptFixture(ctx.pgPool, {
		testId: input.testId,
		userId: input.userId,
		submittedAt: input.submittedAt,
		results: {},
		earnedPoints: input.score,
		totalPoints: 100,
		scorePercentage: input.score,
		passed: input.passed,
	})
}

async function expectedSummary(
	where: string,
	params: unknown[]
): Promise<{ passed: number; averageScore: number | null }> {
	const result = await ctx.pgPool.query<{ passed: number; average: number | null }>(
		`SELECT count(*) FILTER (WHERE ta.final_passed AND ta.review_status <> 'pending')::int AS passed,
			round(avg(ta.final_score_percentage) FILTER (WHERE ta.review_status <> 'pending')::numeric, 1)::float AS average
		FROM test_attempts ta
		INNER JOIN tests t ON t.id = ta.test_id
		WHERE ${where}
		AND NOT EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = ta.user_id AND r.role_key IN ('admin', 'teacher'))`,
		params
	)
	const row = result.rows[0]
	return { passed: Number(row?.passed ?? 0), averageScore: row?.average == null ? null : Number(row.average) }
}

function reviewFacts(): AttemptFixtureFact[] {
	return [
		{ questionId: w.tests.tX.questionId, template: 'single_choice', points: 1, earnedPoints: 1 },
		{ questionId: crypto.randomUUID(), template: 'open', points: 3, earnedPoints: 0 },
	]
}

async function insertReviewAttempt(input: { testId: string; userId: string; graded?: boolean }): Promise<string> {
	const facts = reviewFacts()
	const open = facts[1]
	assert.ok(open)
	return insertAttemptFixture(ctx.pgPool, {
		testId: input.testId,
		userId: input.userId,
		outcomeFacts: facts,
		finalScores: input.graded ? new Map([[open.questionId, 2]]) : new Map(),
		passingScore: REVIEW_PASSING_SCORE,
	})
}

function idsOf(reply: Reply): string[] {
	return rowsOf(reply)
		.map((row) => row.attemptId)
		.sort()
}

function rowOf(reply: Reply, attemptId: string): AttemptRow {
	const row = rowsOf(reply).find((item) => item.attemptId === attemptId)
	assert.ok(row, `нет строки ${attemptId}`)
	return row
}

beforeAll(async () => {
	ctx = await startAuthApp('test_attempts_list')
	w = await seedTeacherZoneWorld(ctx, 'atl')
	oldStudent = await w.freshUser()
	inactiveStudent = await w.freshUser({ isActive: false })
	for (let index = 0; index < BULK; index += 1) {
		const submittedAt = new Date(Date.now() - 60 * 60 * 1000 - index * 60 * 1000).toISOString()
		await insertAttempt({
			testId: w.tests.tX.id,
			userId: w.users.s1.id,
			submittedAt,
			score: index % 100,
			passed: index % 3 === 0,
		})
	}
	oldAttemptId = await insertAttempt({
		testId: w.tests.tX2.id,
		userId: oldStudent.id,
		submittedAt: OLD_AT,
		score: 40,
		passed: false,
	})
	inactiveAttemptId = await insertAttempt({
		testId: w.tests.tX.id,
		userId: inactiveStudent.id,
		submittedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
		score: 90,
		passed: true,
	})
	reviewStudent = await w.freshUser()
	pendingAttemptId = await insertReviewAttempt({ testId: w.tests.tX.id, userId: reviewStudent.id })
	gradedAttemptId = await insertReviewAttempt({ testId: w.tests.tX.id, userId: reviewStudent.id, graded: true })
	pendingForeignAttemptId = await insertReviewAttempt({ testId: w.tests.tY.id, userId: reviewStudent.id })
	pendingInactiveAttemptId = await insertReviewAttempt({ testId: w.tests.tX.id, userId: inactiveStudent.id })
}, 240_000)

afterAll(async () => {
	await ctx?.stop()
})

describe('GET /api/tests/admin/attempts: фильтры на сервере и догрузка', () => {
	test('старая попытка за пределами первых 100 видна фильтром student и в facets.students', async () => {
		const first = ok(await list('admin', { limit: '100' }))
		assert.equal(rowsOf(first).length, 100)
		assert.ok(!rowsOf(first).some((row) => row.attemptId === oldAttemptId), 'старая попытка в первых 100')
		assert.equal(first.body.total, SEEDED_ALL + REVIEW_ADDED_ALL)
		assert.ok(
			facetsOf(first).students.some((student) => student.id === oldStudent.id),
			'нет ученика в facets'
		)

		const byStudent = ok(await list('admin', { student: oldStudent.id }))
		assert.deepEqual(
			rowsOf(byStudent).map((row) => row.attemptId),
			[oldAttemptId]
		)
		assert.equal(byStudent.body.total, 1)
		assert.equal(byStudent.body.scopeTotal, SEEDED_ALL + REVIEW_ADDED_ALL)
	})

	test('offset догружает следующую страницу без повторов, limit по умолчанию 50', async () => {
		const seen = new Set<string>()
		let offset = 0
		let total = 0
		for (;;) {
			const page = ok(await list('admin', { offset: String(offset) }))
			assert.equal(page.body.limit, 50)
			assert.equal(page.body.offset, offset)
			total = Number(page.body.total)
			const rows = rowsOf(page)
			for (const row of rows) seen.add(row.attemptId)
			offset += rows.length
			if (rows.length === 0 || offset >= total) break
		}
		assert.equal(total, SEEDED_ALL + REVIEW_ADDED_ALL)
		assert.equal(seen.size, total)
		assert.ok(seen.has(oldAttemptId))
	})

	test('summary и scopeTotal считаются по отфильтрованному набору и по зоне', async () => {
		const all = ok(await list('admin', { limit: '1' }))
		assert.deepEqual(all.body.summary, { ...(await expectedSummary('true', [])), pendingTotal: 3 })
		assert.equal(all.body.scopeTotal, all.body.total)

		const byTopic = ok(await list('admin', { topic: w.topics.X.slug, limit: '1' }))
		assert.deepEqual(byTopic.body.summary, {
			...(await expectedSummary('t.topic_id = $1', [w.topics.X.id])),
			pendingTotal: 3,
		})
		assert.equal(byTopic.body.total, SEEDED_X + REVIEW_ADDED_X)
		assert.equal(byTopic.body.scopeTotal, SEEDED_ALL + REVIEW_ADDED_ALL)
	})

	test('facets по всей зоне: темы и ученики с признаком активности', async () => {
		const reply = ok(await list('admin', { limit: '1' }))
		const facets = facetsOf(reply)
		assert.deepEqual(facets.topics.map((topic) => topic.slug).sort(), [w.topics.X.slug, w.topics.Y.slug].sort())
		const students = new Map(facets.students.map((student) => [student.id, student]))
		for (const profile of ['s1', 's2', 's3'] as const) assert.ok(students.has(w.users[profile].id), profile)
		assert.equal(students.get(inactiveStudent.id)?.isActive, false)
		assert.equal(students.get(oldStudent.id)?.isActive, true)
		assert.ok(!students.has(w.users.teacherA.id), 'персонал в facets')
	})

	test('topic фильтрует по slug темы', async () => {
		const reply = ok(await list('admin', { topic: w.topics.Y.slug }))
		assert.ok(rowsOf(reply).length > 0)
		assert.ok(rowsOf(reply).every((row) => row.topicSlug === w.topics.Y.slug))
		assert.equal(reply.body.total, 3)
	})

	test('q ищет без учёта регистра по тесту, теме и имени и экранирует % _ \\', async () => {
		const byTest = ok(await list('admin', { q: `${w.prefix.toUpperCase()}-TX2` }))
		assert.deepEqual(
			rowsOf(byTest).map((row) => row.attemptId),
			[oldAttemptId]
		)
		const byTopic = ok(await list('admin', { q: `Раздел Y ${w.prefix}` }))
		assert.equal(byTopic.body.total, 3)
		const byName = ok(await list('admin', { q: `Имя ${w.prefix} s3` }))
		assert.deepEqual(
			rowsOf(byName).map((row) => row.studentId),
			[w.users.s3.id]
		)
		for (const q of ['%', '\\', `${w.prefix}%s1`]) {
			const escaped = ok(await list('admin', { q }))
			assert.equal(escaped.body.total, 0, `q=${q}`)
		}
		const underscore = ok(await list('teacherA', { q: `${w.prefix}_s` }))
		assert.equal(underscore.body.total, 0)
	})

	test('логин ученика: администратор находит, учитель без zone.all — нет', async () => {
		const login = w.users.s2.login
		const admin = ok(await list('admin', { q: login }))
		assert.ok(admin.body.total === 2, `админ по логину: ${JSON.stringify(admin.body.total)}`)
		assert.ok(rowsOf(admin).every((row) => row.studentId === w.users.s2.id))
		const teacher = ok(await list('teacherA', { q: login }))
		assert.equal(teacher.body.total, 0)
		assert.deepEqual(rowsOf(teacher), [])
	})

	test('from и to включительно', async () => {
		const exact = ok(await list('admin', { from: OLD_AT, to: OLD_AT }))
		assert.deepEqual(
			rowsOf(exact).map((row) => row.attemptId),
			[oldAttemptId]
		)
		const day = ok(await list('admin', { from: '2020-01-15T00:00:00.000Z', to: '2020-01-15T23:59:59.999Z' }))
		assert.equal(day.body.total, 1)
		const before = ok(await list('admin', { to: '2020-01-15T09:59:59.999Z' }))
		assert.equal(before.body.total, 0)
		const after = ok(await list('admin', { from: '2020-01-15T10:00:00.001Z' }))
		assert.equal(after.body.total, SEEDED_ALL + REVIEW_ADDED_ALL - 1)
	})

	test('status: active, inactive и all по активности ученика, по умолчанию all', async () => {
		const inactive = ok(await list('admin', { status: 'inactive' }))
		assert.deepEqual(
			rowsOf(inactive)
				.map((row) => row.attemptId)
				.sort(),
			[inactiveAttemptId, pendingInactiveAttemptId].sort()
		)
		const active = ok(await list('admin', { status: 'active', limit: '1' }))
		assert.equal(active.body.total, SEEDED_ALL + REVIEW_ADDED_ALL - 2)
		const all = ok(await list('admin', { status: 'all', limit: '1' }))
		const fallback = ok(await list('admin', { limit: '1' }))
		assert.equal(all.body.total, SEEDED_ALL + REVIEW_ADDED_ALL)
		assert.equal(fallback.body.total, SEEDED_ALL + REVIEW_ADDED_ALL)
	})

	test('учитель не видит чужих тем ни в строках, ни в facets', async () => {
		const reply = ok(await list('teacherA', { limit: '100' }))
		assert.ok(rowsOf(reply).every((row) => row.topicSlug === w.topics.X.slug))
		assert.equal(reply.body.scopeTotal, SEEDED_X + REVIEW_ADDED_X)
		const facets = facetsOf(reply)
		assert.deepEqual(
			facets.topics.map((topic) => topic.slug),
			[w.topics.X.slug]
		)
		assert.ok(!facets.students.some((student) => student.id === w.users.s3.id), 's3 только в чужой теме')
		for (const student of facets.students) assert.ok(!student.name.includes(w.users.s1.login))

		const foreign = ok(await list('teacherA', { topic: w.topics.Y.slug }))
		assert.deepEqual(rowsOf(foreign), [])
		assert.equal(foreign.body.total, 0)
		const foreignStudent = ok(await list('teacherA', { student: w.users.s3.id }))
		assert.equal(foreignStudent.body.total, 0)
	})

	test('пустая зона отдаёт полные нули', async () => {
		const reply = ok(await list('adminNoZone'))
		assert.deepEqual(reply.body, {
			rows: [],
			total: 0,
			limit: 50,
			offset: 0,
			summary: { passed: 0, averageScore: null, pendingTotal: 0 },
			scopeTotal: 0,
			facets: { topics: [], students: [] },
		})
	})

	test('неверные параметры → 400', async () => {
		const invalid: Array<Record<string, string>> = [
			{ limit: '0' },
			{ limit: '101' },
			{ limit: 'abc' },
			{ offset: '-1' },
			{ offset: '1.5' },
			{ student: 'not-a-uuid' },
			{ status: 'deleted' },
			{ review: 'none' },
			{ review: 'PENDING' },
			{ from: 'вчера' },
			{ to: '2020-13-45' },
		]
		for (const params of invalid) {
			const reply = await list('admin', params)
			assert.equal(reply.status, 400, JSON.stringify(params))
		}
	})
})

describe('GET /api/tests/admin/attempts: проверка попыток', () => {
	test('review=pending: только попытки на проверке в зоне, без процента и вердикта, с автобаллами', async () => {
		const admin = ok(await list('admin', { review: 'pending' }))
		assert.deepEqual(idsOf(admin), [pendingAttemptId, pendingForeignAttemptId, pendingInactiveAttemptId].sort())
		const row = rowOf(admin, pendingAttemptId)
		assert.equal(row.reviewStatus, 'pending')
		assert.equal(row.scorePercentage, null)
		assert.equal(row.passed, null)
		assert.equal(row.earnedPoints, null)
		assert.equal(row.totalPoints, 4)
		assert.equal(row.autoEarnedPoints, 1)
		assert.equal(row.autoTotalPoints, 1)

		const teacher = ok(await list('teacherA', { review: 'pending' }))
		assert.deepEqual(idsOf(teacher), [pendingAttemptId, pendingInactiveAttemptId].sort())
	})

	test('review=graded: только проверенные с итоговым процентом и вердиктом', async () => {
		const admin = ok(await list('admin', { review: 'graded' }))
		assert.deepEqual(idsOf(admin), [gradedAttemptId])
		const row = rowOf(admin, gradedAttemptId)
		assert.equal(row.reviewStatus, 'graded')
		assert.equal(row.scorePercentage, 75)
		assert.equal(row.passed, true)
		assert.equal(row.earnedPoints, 3)
		assert.equal(row.totalPoints, 4)
		assert.equal(row.autoEarnedPoints, 1)
		assert.equal(row.autoTotalPoints, 1)
	})

	test('без review порядок по дате прежний, обычные попытки reviewStatus none', async () => {
		const reply = ok(await list('admin', { limit: '100' }))
		const rows = rowsOf(reply)
		for (let index = 1; index < rows.length; index += 1) {
			const previous = rows[index - 1]
			const current = rows[index]
			assert.ok(previous && current)
			assert.ok(previous.submittedAt >= current.submittedAt, 'порядок по submittedAt убывающий')
		}
		const explicit = ok(await list('admin', { limit: '100', review: 'all' }))
		assert.deepEqual(
			rowsOf(explicit).map((row) => row.attemptId),
			rows.map((row) => row.attemptId)
		)
		const old = rowOf(ok(await list('admin', { student: oldStudent.id })), oldAttemptId)
		assert.equal(old.reviewStatus, 'none')
		assert.equal(old.scorePercentage, 40)
		assert.equal(old.passed, false)
	})

	test('review комбинируется со status по «И»', async () => {
		const inactive = ok(await list('admin', { review: 'pending', status: 'inactive' }))
		assert.deepEqual(idsOf(inactive), [pendingInactiveAttemptId])
		const active = ok(await list('admin', { review: 'pending', status: 'active' }))
		assert.deepEqual(idsOf(active), [pendingAttemptId, pendingForeignAttemptId].sort())
		const gradedInactive = ok(await list('admin', { review: 'graded', status: 'inactive' }))
		assert.deepEqual(rowsOf(gradedInactive), [])
	})

	test('pendingTotal считает всю зону и не зависит от фильтров, средние без pending', async () => {
		const admin = ok(await list('admin', { review: 'graded', limit: '1' }))
		assert.deepEqual(admin.body.summary, { passed: 1, averageScore: 75, pendingTotal: 3 })
		assert.equal(admin.body.total, 1)

		const byStudent = ok(await list('admin', { student: reviewStudent.id }))
		assert.deepEqual(byStudent.body.summary, { passed: 1, averageScore: 75, pendingTotal: 3 })

		const onlyPending = ok(await list('admin', { review: 'pending' }))
		assert.deepEqual(onlyPending.body.summary, { passed: 0, averageScore: null, pendingTotal: 3 })

		const teacher = ok(await list('teacherA', { limit: '1' }))
		assert.deepEqual(teacher.body.summary, {
			...(await expectedSummary('t.topic_id = $1', [w.topics.X.id])),
			pendingTotal: 2,
		})
		const teacherByTest = ok(await list('teacherA', { q: w.tests.tX2.slug }))
		assert.equal((teacherByTest.body.summary as Json).pendingTotal, 2)
	})
})

describe('GET /api/tests/admin/dashboard: попытки на проверке', () => {
	test('totalAttempts считает pending, средние и «пройдено» без них, latestAttempts отдаёт pending без процента', async () => {
		const reply = ok(await call(ctx, 'GET', '/api/tests/admin/dashboard', { cookies: w.users.admin.cookie }))
		const expected = await expectedSummary('true', [])
		const summary = reply.body.summary as Json
		assert.equal(summary.totalAttempts, SEEDED_ALL + REVIEW_ADDED_ALL)
		assert.equal(summary.passedAttempts, expected.passed)
		assert.equal(summary.averageScore, expected.averageScore)

		const latest = reply.body.latestAttempts as AttemptRow[]
		assert.equal(latest.length, 8)
		const pending = latest.find((row) => row.attemptId === pendingAttemptId)
		assert.ok(pending, 'pending нет среди последних попыток')
		assert.equal(pending.reviewStatus, 'pending')
		assert.equal(pending.scorePercentage, null)
		assert.equal(pending.passed, null)
		assert.equal(pending.earnedPoints, null)
		assert.equal(pending.autoEarnedPoints, 1)
		assert.equal(pending.autoTotalPoints, 1)
		const graded = latest.find((row) => row.attemptId === gradedAttemptId)
		assert.ok(graded, 'graded нет среди последних попыток')
		assert.equal(graded.scorePercentage, 75)
		assert.equal(graded.passed, true)

		const daily = await ctx.pgPool.query<{ date: string; attempts: number; average: number | null }>(
			`SELECT to_char(date_trunc('day', ta.submitted_at), 'YYYY-MM-DD') AS date,
				count(*)::int AS attempts,
				round(avg(ta.final_score_percentage) FILTER (WHERE ta.review_status <> 'pending')::numeric, 1)::float AS average
			FROM test_attempts ta
			WHERE NOT EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = ta.user_id AND r.role_key IN ('admin', 'teacher'))
			AND ta.submitted_at >= now() - interval '30 days'
			GROUP BY date_trunc('day', ta.submitted_at)
			ORDER BY date_trunc('day', ta.submitted_at)`
		)
		assert.deepEqual(
			reply.body.dailyActivity,
			daily.rows.map((row) => ({ date: row.date, attempts: row.attempts, averageScore: row.average }))
		)
	})
})

describe('зона только из попыток на проверке', () => {
	test('зона, где есть только попытка на проверке: средний балл null, а не 0', async () => {
		const teacher = await w.freshUser({ role: 'teacher' })
		const topic = await w.freshTopic()
		await ctx.pgPool.query('INSERT INTO teacher_topics (teacher_id, topic_id) VALUES ($1, $2)', [teacher.id, topic.id])
		const test = await w.freshTest(topic)
		const student = await w.freshUser()
		const attemptId = await insertReviewAttempt({ testId: test.id, userId: student.id })

		const reply = await call(ctx, 'GET', '/api/tests/admin/attempts', { cookies: teacher.cookie })
		ok(reply)
		assert.deepEqual(reply.body.summary, { passed: 0, averageScore: null, pendingTotal: 1 })
		assert.equal(reply.body.total, 1)
		assert.equal(reply.body.scopeTotal, 1)
		assert.equal(rowOf(reply, attemptId).scorePercentage, null)

		const dashboard = ok(await call(ctx, 'GET', '/api/tests/admin/dashboard', { cookies: teacher.cookie }))
		assert.deepEqual(dashboard.body.summary, {
			totalAttempts: 1,
			activeStudents: 1,
			averageScore: null,
			passedAttempts: 0,
		})
		const daily = dashboard.body.dailyActivity as Json[]
		assert.equal(daily.length, 1)
		assert.equal(daily[0]?.attempts, 1)
		assert.equal(daily[0]?.averageScore, null)
	})
})

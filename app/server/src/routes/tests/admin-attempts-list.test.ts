import assert from 'node:assert/strict'
import { afterAll, beforeAll, describe, test } from 'vitest'

import { call, startAuthApp, type AuthApp, type Reply } from '../../test-support/auth-app.js'
import {
	seedTeacherZoneWorld,
	type TeacherZoneWorld,
	type ZoneProfile,
	type ZoneUser,
} from '../../test-support/teacher-zone-world.js'

const BULK = 105
const OLD_AT = '2020-01-15T10:00:00.000Z'

type AttemptRow = {
	attemptId: string
	studentId: string
	studentName: string
	studentIsActive: boolean
	topicSlug: string
	testTitle: string
	submittedAt: string
	passed: boolean
}

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
	const result = await ctx.pgPool.query<{ id: string }>(
		`INSERT INTO test_attempts (test_id, user_id, answers, results, earned_points, total_points, score_percentage, passed, submitted_at)
		VALUES ($1, $2, '{}', '{}', $3, 100, $3, $4, $5) RETURNING id`,
		[input.testId, input.userId, input.score, input.passed, input.submittedAt]
	)
	const id = result.rows[0]?.id
	assert.ok(id, 'попытка не вставлена')
	return id
}

async function expectedSummary(where: string, params: unknown[]): Promise<{ passed: number; averageScore: number }> {
	const result = await ctx.pgPool.query<{ passed: number; average: number }>(
		`SELECT count(*) FILTER (WHERE ta.passed)::int AS passed,
			coalesce(round(avg(ta.score_percentage)::numeric, 1), 0)::float AS average
		FROM test_attempts ta
		INNER JOIN tests t ON t.id = ta.test_id
		WHERE ${where}
		AND NOT EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = ta.user_id AND r.role_key IN ('admin', 'teacher'))`,
		params
	)
	const row = result.rows[0]
	return { passed: Number(row?.passed ?? 0), averageScore: Number(row?.average ?? 0) }
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
}, 240_000)

afterAll(async () => {
	await ctx?.stop()
})

describe('GET /api/tests/admin/attempts: фильтры на сервере и догрузка', () => {
	test('старая попытка за пределами первых 100 видна фильтром student и в facets.students', async () => {
		const first = ok(await list('admin', { limit: '100' }))
		assert.equal(rowsOf(first).length, 100)
		assert.ok(!rowsOf(first).some((row) => row.attemptId === oldAttemptId), 'старая попытка в первых 100')
		assert.equal(first.body.total, BULK + 6)
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
		assert.equal(byStudent.body.scopeTotal, BULK + 6)
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
		assert.equal(total, BULK + 6)
		assert.equal(seen.size, total)
		assert.ok(seen.has(oldAttemptId))
	})

	test('summary и scopeTotal считаются по отфильтрованному набору и по зоне', async () => {
		const all = ok(await list('admin', { limit: '1' }))
		assert.deepEqual(all.body.summary, await expectedSummary('true', []))
		assert.equal(all.body.scopeTotal, all.body.total)

		const byTopic = ok(await list('admin', { topic: w.topics.X.slug, limit: '1' }))
		assert.deepEqual(byTopic.body.summary, await expectedSummary('t.topic_id = $1', [w.topics.X.id]))
		assert.equal(byTopic.body.total, BULK + 4)
		assert.equal(byTopic.body.scopeTotal, BULK + 6)
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
		assert.equal(reply.body.total, 2)
	})

	test('q ищет без учёта регистра по тесту, теме и имени и экранирует % _ \\', async () => {
		const byTest = ok(await list('admin', { q: `${w.prefix.toUpperCase()}-TX2` }))
		assert.deepEqual(
			rowsOf(byTest).map((row) => row.attemptId),
			[oldAttemptId]
		)
		const byTopic = ok(await list('admin', { q: `Раздел Y ${w.prefix}` }))
		assert.equal(byTopic.body.total, 2)
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
		assert.equal(after.body.total, BULK + 5)
	})

	test('status: active, inactive и all по активности ученика, по умолчанию all', async () => {
		const inactive = ok(await list('admin', { status: 'inactive' }))
		assert.deepEqual(
			rowsOf(inactive).map((row) => row.attemptId),
			[inactiveAttemptId]
		)
		const active = ok(await list('admin', { status: 'active', limit: '1' }))
		assert.equal(active.body.total, BULK + 5)
		const all = ok(await list('admin', { status: 'all', limit: '1' }))
		const fallback = ok(await list('admin', { limit: '1' }))
		assert.equal(all.body.total, BULK + 6)
		assert.equal(fallback.body.total, BULK + 6)
	})

	test('учитель не видит чужих тем ни в строках, ни в facets', async () => {
		const reply = ok(await list('teacherA', { limit: '100' }))
		assert.ok(rowsOf(reply).every((row) => row.topicSlug === w.topics.X.slug))
		assert.equal(reply.body.scopeTotal, BULK + 4)
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
			summary: { passed: 0, averageScore: 0 },
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
			{ from: 'вчера' },
			{ to: '2020-13-45' },
		]
		for (const params of invalid) {
			const reply = await list('admin', params)
			assert.equal(reply.status, 400, JSON.stringify(params))
		}
	})
})

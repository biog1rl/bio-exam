import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { afterAll, beforeAll, describe, test } from 'vitest'

import { insertAttemptFixture } from '../../test-support/attempt-fixture.js'
import {
	addQuestion,
	assignTest,
	createAttemptTest,
	seedAttemptWorld,
	seedStudent,
	startSession,
	submitAttempt,
	type AttemptWorld,
} from '../../test-support/attempt-world.js'
import { call, startAuthApp, type AuthApp, type Reply } from '../../test-support/auth-app.js'

type Json = Record<string, unknown>

const PENDING_AT = '2020-01-15T10:00:00.000Z'
const PASSING_SCORE = 50

let ctx: AuthApp
let world: AttemptWorld
let student: { id: string; cookie: string }
let testOne = ''
let testTwo = ''
let titleTwo = ''
let none = ''
let pending = ''
let graded = ''

function ok(reply: Reply): Reply {
	assert.equal(reply.status, 200, `ожидался 200, пришёл ${reply.status}: ${JSON.stringify(reply.body)}`)
	return reply
}

function byKey(items: unknown, key: string, value: string, label: string): Json {
	assert.ok(Array.isArray(items), `${label}: не массив`)
	const found = (items as Json[]).find((item) => item[key] === value)
	assert.ok(found, `${label}: нет записи ${key}=${value}`)
	return found
}

function hasKey(items: unknown, key: string, value: string): boolean {
	return Array.isArray(items) && (items as Json[]).some((item) => item[key] === value)
}

function expectPending(row: Json, label: string): void {
	assert.equal(row.reviewStatus, 'pending', `${label}: reviewStatus`)
	assert.equal(row.scorePercentage, null, `${label}: scorePercentage`)
	assert.equal(row.passed, null, `${label}: passed`)
	assert.equal(row.earnedPoints, null, `${label}: earnedPoints`)
	assert.equal(row.totalPoints, 4, `${label}: totalPoints`)
	assert.equal(row.autoEarnedPoints, 1, `${label}: autoEarnedPoints`)
	assert.equal(row.autoTotalPoints, 1, `${label}: autoTotalPoints`)
}

function expectGraded(row: Json, label: string): void {
	assert.equal(row.reviewStatus, 'graded', `${label}: reviewStatus`)
	assert.equal(row.scorePercentage, 75, `${label}: scorePercentage`)
	assert.equal(row.passed, true, `${label}: passed`)
	assert.equal(row.earnedPoints, 3, `${label}: earnedPoints`)
	assert.equal(row.totalPoints, 4, `${label}: totalPoints`)
}

function expectNone(row: Json, label: string): void {
	assert.equal(row.reviewStatus, 'none', `${label}: reviewStatus`)
	assert.equal(row.scorePercentage, 100, `${label}: scorePercentage`)
	assert.equal(row.passed, true, `${label}: passed`)
}

function attemptItems(reply: Reply): Json[] {
	const categories = reply.body.categories as Array<{ scope: string; items: Json[] }>
	const items = categories.find((category) => category.scope === 'attempts')?.items
	assert.ok(items, 'нет категории attempts')
	return items
}

function searchAttempts(query: string): Promise<Reply> {
	return call(ctx, 'GET', `/api/search?q=${encodeURIComponent(query)}&scope=attempts&limit=25`, {
		cookies: world.adminCookie,
	})
}

beforeAll(async () => {
	ctx = await startAuthApp('test_readers_pending')
	world = await seedAttemptWorld(ctx, 'rdp')
	student = await seedStudent(world, 'rdp_student')

	testOne = await createAttemptTest(world, { slug: 'rdp-t1' })
	const radioOne = await addQuestion(world, testOne, 'radio', { order: 0 })
	await ctx.pgPool.query('UPDATE tests SET passing_score = NULL WHERE id = $1', [testOne])
	await assignTest(world, testOne, student.id)

	testTwo = await createAttemptTest(world, { slug: 'rdp-t2' })
	titleTwo = 'Тест rdp-t2'
	const radioTwo = await addQuestion(world, testTwo, 'radio', { order: 0 })
	await ctx.pgPool.query('UPDATE tests SET passing_score = $2 WHERE id = $1', [testTwo, PASSING_SCORE])
	await assignTest(world, testTwo, student.id)

	const started = ok(await startSession(world, student.cookie, testOne))
	const submitted = ok(
		await submitAttempt(world, student.cookie, testOne, {
			sessionId: started.body.sessionId as string,
			clientAttemptId: crypto.randomUUID(),
			answers: { [radioOne]: 'b' },
		})
	)
	none = submitted.body.attemptId as string

	const openQuestionId = crypto.randomUUID()
	const facts = [
		{ questionId: radioTwo, template: 'single_choice' as const, points: 1, earnedPoints: 1 },
		{ questionId: openQuestionId, template: 'open' as const, points: 3, earnedPoints: 0 },
	]
	pending = await insertAttemptFixture(ctx.pgPool, {
		testId: testTwo,
		userId: student.id,
		submittedAt: PENDING_AT,
		outcomeFacts: facts,
		passingScore: PASSING_SCORE,
	})
	graded = await insertAttemptFixture(ctx.pgPool, {
		testId: testTwo,
		userId: student.id,
		submittedAt: new Date(),
		outcomeFacts: facts,
		finalScores: new Map([[openQuestionId, 2]]),
		passingScore: PASSING_SCORE,
	})
}, 120_000)

afterAll(async () => {
	await ctx?.stop()
})

describe('читатели результата: none, pending и graded', () => {
	test('«Мои попытки»: pending без процента и вердикта, с автобаллами', async () => {
		const reply = ok(
			await call(ctx, 'GET', `/api/tests/public/tests/${testTwo}/attempts/me`, { cookies: student.cookie })
		)
		assert.equal(reply.body.total, 2)
		expectPending(byKey(reply.body.rows, 'id', pending, 'мои попытки P'), 'мои попытки P')
		expectGraded(byKey(reply.body.rows, 'id', graded, 'мои попытки G'), 'мои попытки G')

		const one = ok(
			await call(ctx, 'GET', `/api/tests/public/tests/${testOne}/attempts/me`, { cookies: student.cookie })
		)
		expectNone(byKey(one.body.rows, 'id', none, 'мои попытки N'), 'мои попытки N')
	})

	test('chart-data: pending не попадает на график, graded встаёт на дату сдачи', async () => {
		const from = new Date('2020-01-01T00:00:00.000Z').toISOString()
		const to = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
		const reply = ok(
			await call(
				ctx,
				'GET',
				`/api/tests/public/tests/${testTwo}/chart-data?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
				{ cookies: student.cookie }
			)
		)
		const data = reply.body.data as Json[]
		assert.equal(data.length, 1)
		assert.equal(data[0]?.date, new Date().toISOString().slice(0, 10))
		assert.equal(data[0]?.maxScore, 75)
		assert.equal(data[0]?.minScore, 75)
		assert.equal(data[0]?.count, 1)
		assert.ok(!data.some((entry) => entry.date === PENDING_AT.slice(0, 10)))
	})

	test('профиль ученика: none, pending и graded', async () => {
		const reply = ok(await call(ctx, 'GET', `/api/users/${student.id}/test-attempts`, { cookies: world.adminCookie }))
		const attempts = reply.body.attempts
		assert.ok(Array.isArray(attempts))
		assert.equal(attempts.length, 3)
		expectNone(byKey(attempts, 'attemptId', none, 'профиль N'), 'профиль N')
		expectPending(byKey(attempts, 'attemptId', pending, 'профиль P'), 'профиль P')
		expectGraded(byKey(attempts, 'attemptId', graded, 'профиль G'), 'профиль G')
	})

	test('глобальный поиск: pending без процента в заголовке и с подписью «На проверке»', async () => {
		const items = attemptItems(ok(await searchAttempts(titleTwo)))
		const foundPending = byKey(items, 'id', pending, 'поиск P')
		const foundGraded = byKey(items, 'id', graded, 'поиск G')
		assert.equal(foundPending.title, titleTwo)
		assert.ok(String(foundPending.subtitle).includes('На проверке'))
		assert.equal(foundGraded.title, `${titleTwo} · 75%`)
		assert.ok(String(foundGraded.subtitle).includes('Сдано'))
		assert.ok(!String(foundGraded.subtitle).includes('Не сдано'))

		const foundNone = byKey(attemptItems(ok(await searchAttempts('Тест rdp-t1'))), 'id', none, 'поиск N')
		assert.equal(foundNone.title, 'Тест rdp-t1 · 100%')
		assert.ok(String(foundNone.subtitle).includes('Сдано'))
	})

	test('глобальный поиск: фактовый процент pending не находит, слово «проверке» находит', async () => {
		assert.ok(!hasKey(attemptItems(ok(await searchAttempts('25'))), 'id', pending), 'pending найдена по проценту')
		assert.ok(hasKey(attemptItems(ok(await searchAttempts('75'))), 'id', graded), 'graded не найдена по проценту')
		const byStatus = attemptItems(ok(await searchAttempts('проверке')))
		assert.ok(hasKey(byStatus, 'id', pending), 'pending не найдена по слову «проверке»')
		assert.ok(!hasKey(byStatus, 'id', graded), 'graded найдена по слову «проверке»')
	})

	test('список попыток админа: pending без процента, сводка без неё, фильтр review', async () => {
		const reply = ok(await call(ctx, 'GET', '/api/tests/admin/attempts', { cookies: world.adminCookie }))
		const rows = reply.body.rows
		expectNone(byKey(rows, 'attemptId', none, 'список N'), 'список N')
		expectPending(byKey(rows, 'attemptId', pending, 'список P'), 'список P')
		expectGraded(byKey(rows, 'attemptId', graded, 'список G'), 'список G')
		const summary = reply.body.summary as Json
		assert.equal(summary.pendingTotal, 1)
		assert.equal(summary.averageScore, 87.5)
		assert.equal(summary.passed, 2)

		const onlyPending = ok(
			await call(ctx, 'GET', '/api/tests/admin/attempts?review=pending', { cookies: world.adminCookie })
		)
		assert.deepEqual(
			(onlyPending.body.rows as Json[]).map((row) => row.attemptId),
			[pending]
		)
	})

	test('дашборд админа: pending считается в попытках, но не в среднем и «пройдено»', async () => {
		const reply = ok(await call(ctx, 'GET', '/api/tests/admin/dashboard', { cookies: world.adminCookie }))
		const summary = reply.body.summary as Json
		assert.equal(summary.totalAttempts, 3)
		assert.equal(summary.passedAttempts, 2)
		assert.equal(summary.averageScore, 87.5)
		const latest = reply.body.latestAttempts
		assert.ok(Array.isArray(latest))
		assert.equal(latest.length, 3)
		const row = byKey(latest, 'attemptId', pending, 'дашборд P')
		assert.equal(row.scorePercentage, null)
		assert.equal(row.reviewStatus, 'pending')
	})
})

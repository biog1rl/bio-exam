import { computeAttemptOutcome, projectionOf } from '@bio-exam/exam-core'

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
let secondStudent: { id: string; cookie: string }
let submittedNone: Reply
let submittedReal: Reply
let realAttemptId = ''
let realClientAttemptId = ''
let realSessionId = ''
let realAnswers: Json = {}

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

async function reviewOf(attemptId: string): Promise<Json> {
	const reply = ok(await call(ctx, 'GET', `/api/tests/admin/attempts/${attemptId}`, { cookies: world.adminCookie }))
	return reply.body.attempt as Json
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
	submittedNone = ok(
		await submitAttempt(world, student.cookie, testOne, {
			sessionId: started.body.sessionId as string,
			clientAttemptId: crypto.randomUUID(),
			answers: { [radioOne]: 'b' },
		})
	)
	none = submittedNone.body.attemptId as string

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

	const openTwo = await ctx.pgPool.query<{ id: string }>(
		`INSERT INTO questions (test_id, type, "order", points) VALUES ($1, 'open', 1, 3) RETURNING id`,
		[testTwo]
	)
	const openTwoId = openTwo.rows[0]?.id
	assert.ok(openTwoId, 'открытый вопрос не засеян')
	secondStudent = await seedStudent(world, 'rdp_student_two')
	await assignTest(world, testTwo, secondStudent.id)
	const startedReal = ok(await startSession(world, secondStudent.cookie, testTwo))
	realSessionId = startedReal.body.sessionId as string
	realClientAttemptId = crypto.randomUUID()
	realAnswers = { [radioTwo]: 'b', [openTwoId]: 'ответ' }
	submittedReal = ok(
		await submitAttempt(world, secondStudent.cookie, testTwo, {
			sessionId: realSessionId,
			clientAttemptId: realClientAttemptId,
			answers: realAnswers,
		})
	)
	realAttemptId = submittedReal.body.attemptId as string
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
		expectPending(byKey(rows, 'attemptId', realAttemptId, 'список R'), 'список R')
		const summary = reply.body.summary as Json
		assert.equal(summary.pendingTotal, 2)
		assert.equal(summary.averageScore, 87.5)
		assert.equal(summary.passed, 2)

		const onlyPending = ok(
			await call(ctx, 'GET', '/api/tests/admin/attempts?review=pending', { cookies: world.adminCookie })
		)
		assert.deepEqual(
			(onlyPending.body.rows as Json[]).map((row) => row.attemptId).sort(),
			[pending, realAttemptId].sort()
		)
	})

	test('дашборд админа: pending считается в попытках, но не в среднем и «пройдено»', async () => {
		const reply = ok(await call(ctx, 'GET', '/api/tests/admin/dashboard', { cookies: world.adminCookie }))
		const summary = reply.body.summary as Json
		assert.equal(summary.totalAttempts, 4)
		assert.equal(summary.passedAttempts, 2)
		assert.equal(summary.averageScore, 87.5)
		const latest = reply.body.latestAttempts
		assert.ok(Array.isArray(latest))
		assert.equal(latest.length, 4)
		const row = byKey(latest, 'attemptId', pending, 'дашборд P')
		assert.equal(row.scorePercentage, null)
		assert.equal(row.reviewStatus, 'pending')
	})

	test('разбор проверяющего: none, pending и graded', async () => {
		const reviewNone = await reviewOf(none)
		expectNone(reviewNone, 'разбор N')

		const reviewPending = await reviewOf(pending)
		expectPending(reviewPending, 'разбор P')
		const pendingQuestion = byKey(reviewPending.results, 'status', 'pending', 'разбор P: открытый вопрос')
		assert.equal(pendingQuestion.points, 3)
		assert.equal(pendingQuestion.earnedPoints, 0)

		const reviewGraded = await reviewOf(graded)
		expectGraded(reviewGraded, 'разбор G')
		assert.equal(reviewGraded.autoEarnedPoints, 1)
		assert.equal(reviewGraded.autoTotalPoints, 1)
	})

	test('ответ сдачи: none, а сдача с открытым вопросом даёт pending без процента', async () => {
		expectNone(submittedNone.body, 'сдача N')

		const body = submittedReal.body
		expectPending(body, 'сдача R')
		assert.equal(body.attemptId, realAttemptId)
		const results = body.results as Json[]
		assert.equal(results.length, 2)
		assert.equal(results.find((item) => item.status === 'pending')?.points, 3)
		assert.equal(results.find((item) => item.status === 'correct')?.earnedPoints, 1)

		const { readAttemptView } = await import('../../services/scored-attempt/read.js')
		const stored = await readAttemptView(realAttemptId, { kind: 'student', showCorrectAnswer: true })
		assert.deepEqual(body, JSON.parse(JSON.stringify(stored)))
	})
})

describe('настоящая сдача с открытым вопросом', () => {
	type StoredAttempt = {
		review_status: string
		final_earned_points: number | null
		final_score_percentage: number | null
		final_passed: boolean | null
		auto_total_points: number
		passing_score: number | null
		earned_points: number
		total_points: number
		score_percentage: number
		passed: boolean
		results: unknown
		results_version: number
		answers: unknown
	}

	async function storedAttempt(attemptId: string): Promise<StoredAttempt> {
		const result = await ctx.pgPool.query<StoredAttempt>('SELECT * FROM test_attempts WHERE id = $1', [attemptId])
		const row = result.rows[0]
		assert.ok(row, `попытка ${attemptId} не найдена`)
		return row
	}

	function sameNumber(actual: number | null, expected: number | null, label: string): void {
		if (actual === null || expected === null) return assert.equal(actual, expected, label)
		assert.equal(Math.fround(actual), Math.fround(expected), label)
	}

	test('повтор той же сдачи возвращает ту же попытку и не меняет факты', async () => {
		const rowsBefore = await ctx.pgPool.query('SELECT id FROM test_attempts WHERE user_id = $1', [secondStudent.id])
		const before = await storedAttempt(realAttemptId)

		const repeated = ok(
			await submitAttempt(world, secondStudent.cookie, testTwo, {
				sessionId: realSessionId,
				clientAttemptId: realClientAttemptId,
				answers: realAnswers,
			})
		)
		assert.equal(repeated.body.attemptId, realAttemptId)
		expectPending(repeated.body, 'повтор сдачи')

		const rowsAfter = await ctx.pgPool.query('SELECT id FROM test_attempts WHERE user_id = $1', [secondStudent.id])
		assert.equal(rowsBefore.rowCount, 1)
		assert.equal(rowsAfter.rowCount, 1)
		assert.deepEqual(await storedAttempt(realAttemptId), before)
	})

	test('сохранённая проекция равна пересчёту по фактам попытки', async () => {
		const { readFacts } = await import('../../services/scored-attempt/read.js')
		const row = await storedAttempt(realAttemptId)
		assert.equal(row.review_status, 'pending')
		const facts = await readFacts({
			attemptId: realAttemptId,
			testId: testTwo,
			results: row.results,
			resultsVersion: row.results_version,
		})
		const expected = projectionOf(
			computeAttemptOutcome({ facts, finalScores: new Map(), passingScore: row.passing_score })
		)
		assert.equal(row.passing_score, PASSING_SCORE)
		assert.equal(row.review_status, expected.reviewStatus)
		sameNumber(row.final_earned_points, expected.finalEarnedPoints, 'final_earned_points')
		sameNumber(row.final_score_percentage, expected.finalScorePercentage, 'final_score_percentage')
		assert.equal(row.final_passed, expected.finalPassed)
		sameNumber(row.auto_total_points, expected.autoTotalPoints, 'auto_total_points')
		assert.equal(row.final_score_percentage, null)
		assert.equal(row.auto_total_points, 1)
	})
})

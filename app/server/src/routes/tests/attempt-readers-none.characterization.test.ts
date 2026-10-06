import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { afterAll, beforeAll, describe, test } from 'vitest'

import {
	addQuestion,
	adminReview,
	assignTest,
	countRows,
	createAttemptTest,
	seedAttemptWorld,
	seedStudent,
	startSession,
	submitAttempt,
	type AttemptWorld,
} from '../../test-support/attempt-world.js'
import { call, startAuthApp, type AuthApp, type Reply } from '../../test-support/auth-app.js'

type Json = Record<string, unknown>

type Expected = { earnedPoints: number; totalPoints: number; scorePercentage: number; passed: boolean }

type Made = {
	attemptId: string
	submittedAt: string
	expected: Expected
	submitBody: Json
}

const A1_EXPECTED: Expected = { earnedPoints: 2, totalPoints: 2, scorePercentage: 100, passed: true }
const A2_EXPECTED: Expected = { earnedPoints: 1, totalPoints: 2, scorePercentage: 50, passed: false }
const B1_EXPECTED: Expected = { earnedPoints: 0, totalPoints: 1, scorePercentage: 0, passed: true }

let ctx: AuthApp
let world: AttemptWorld
let student: { id: string; cookie: string }
let testA = ''
let testB = ''
let titleA = ''
let a1: Made
let a2: Made
let b1: Made
let a2Session = ''
let a2ClientAttemptId = ''
let a2Answers: Json = {}

function ok(reply: Reply): Reply {
	assert.equal(reply.status, 200, `ожидался 200, пришёл ${reply.status}: ${JSON.stringify(reply.body)}`)
	return reply
}

function expectFields(actual: Json | undefined, expected: Expected, label: string): void {
	assert.ok(actual, `${label}: нет объекта`)
	assert.equal(actual.earnedPoints, expected.earnedPoints, `${label}: earnedPoints`)
	assert.equal(actual.totalPoints, expected.totalPoints, `${label}: totalPoints`)
	assert.equal(actual.scorePercentage, expected.scorePercentage, `${label}: scorePercentage`)
	assert.equal(actual.passed, expected.passed, `${label}: passed`)
}

function byKey(items: unknown, key: string, value: string, label: string): Json {
	assert.ok(Array.isArray(items), `${label}: не массив`)
	const found = (items as Json[]).find((item) => item[key] === value)
	assert.ok(found, `${label}: нет записи ${key}=${value}`)
	return found
}

async function submitScenario(
	testId: string,
	answers: Json,
	expected: Expected,
	clientAttemptId: string = crypto.randomUUID()
): Promise<Made & { sessionId: string; clientAttemptId: string; answers: Json }> {
	const started = ok(await startSession(world, student.cookie, testId))
	const sessionId = started.body.sessionId as string
	const reply = ok(await submitAttempt(world, student.cookie, testId, { sessionId, clientAttemptId, answers }))
	return {
		attemptId: reply.body.attemptId as string,
		submittedAt: reply.body.submittedAt as string,
		expected,
		submitBody: reply.body,
		sessionId,
		clientAttemptId,
		answers,
	}
}

async function storedRow(attemptId: string): Promise<string> {
	const result = await ctx.pgPool.query(
		`SELECT answers, results, earned_points, total_points, score_percentage, passed
		 FROM test_attempts WHERE id = $1`,
		[attemptId]
	)
	assert.equal(result.rows.length, 1)
	return JSON.stringify(result.rows[0])
}

beforeAll(async () => {
	ctx = await startAuthApp('test_readers_none')
	world = await seedAttemptWorld(ctx, 'rdn')
	student = await seedStudent(world, 'rdn_student')

	testA = await createAttemptTest(world, { slug: 'rdn-a' })
	titleA = 'Тест rdn-a'
	const radioA = await addQuestion(world, testA, 'radio', { order: 0 })
	const shortA = await addQuestion(world, testA, 'short_answer', { order: 1 })
	await ctx.pgPool.query('UPDATE tests SET passing_score = 60 WHERE id = $1', [testA])
	await assignTest(world, testA, student.id)

	testB = await createAttemptTest(world, { slug: 'rdn-b' })
	const radioB = await addQuestion(world, testB, 'radio', { order: 0 })
	await ctx.pgPool.query('UPDATE tests SET passing_score = NULL WHERE id = $1', [testB])
	await assignTest(world, testB, student.id)

	a1 = await submitScenario(testA, { [radioA]: 'b', [shortA]: 'Митоз' }, A1_EXPECTED)
	const second = await submitScenario(testA, { [radioA]: 'b', [shortA]: 'Амитоз' }, A2_EXPECTED)
	a2 = second
	a2Session = second.sessionId
	a2ClientAttemptId = second.clientAttemptId
	a2Answers = second.answers
	b1 = await submitScenario(testB, { [radioB]: 'a' }, B1_EXPECTED)
}, 120_000)

afterAll(async () => {
	await ctx?.stop()
})

describe('читатели результата: попытки без открытых вопросов', () => {
	test.each([
		['A1: оба ответа верны, порог 60', () => a1],
		['A2: верен один, порог 60', () => a2],
		['B1: неверный ответ, порога нет', () => b1],
	])('ответ сдачи %s', (_label, made) => {
		const attempt = made()
		expectFields(attempt.submitBody, attempt.expected, 'ответ сдачи')
	})

	test('формула итога: без порога passed = true при 0 %, с порогом 60 passed = false при 50 %', () => {
		assert.equal(b1.submitBody.scorePercentage, 0)
		assert.equal(b1.submitBody.passed, true)
		assert.equal(a2.submitBody.scorePercentage, 50)
		assert.equal(a2.submitBody.passed, false)
	})

	test('список попыток админа: строки, summary и scopeTotal', async () => {
		const reply = ok(await call(ctx, 'GET', '/api/tests/admin/attempts', { cookies: world.adminCookie }))
		const rows = reply.body.rows
		for (const [label, made] of [
			['A1', a1],
			['A2', a2],
			['B1', b1],
		] as const) {
			expectFields(byKey(rows, 'attemptId', made.attemptId, `список ${label}`), made.expected, `список ${label}`)
		}
		const summary = reply.body.summary as Json
		assert.equal(summary.passed, 2)
		assert.equal(summary.averageScore, 50)
		assert.equal(reply.body.scopeTotal, 3)
	})

	test('дашборд админа: summary, latestAttempts, dailyActivity', async () => {
		const reply = ok(await call(ctx, 'GET', '/api/tests/admin/dashboard', { cookies: world.adminCookie }))
		const summary = reply.body.summary as Json
		assert.equal(summary.totalAttempts, 3)
		assert.equal(summary.passedAttempts, 2)
		assert.equal(summary.averageScore, 50)
		const latest = reply.body.latestAttempts
		assert.ok(Array.isArray(latest))
		assert.equal(latest.length, 3)
		for (const [label, made] of [
			['A1', a1],
			['A2', a2],
			['B1', b1],
		] as const) {
			const row = byKey(latest, 'attemptId', made.attemptId, `дашборд ${label}`)
			assert.equal(row.scorePercentage, made.expected.scorePercentage, `дашборд ${label}: scorePercentage`)
			assert.equal(row.passed, made.expected.passed, `дашборд ${label}: passed`)
		}
		const daily = reply.body.dailyActivity as Json[]
		assert.equal(daily.length, 1)
		assert.equal(daily[0]?.attempts, 3)
		assert.equal(daily[0]?.averageScore, 50)
	})

	test('разбор попытки админа', async () => {
		const reply = ok(await adminReview(world, a2.attemptId))
		const attempt = reply.body.attempt as Json
		expectFields(attempt, A2_EXPECTED, 'разбор A2')
		assert.equal(attempt.attemptId, a2.attemptId)
	})

	test('«Мои попытки» ученика', async () => {
		const reply = ok(
			await call(ctx, 'GET', `/api/tests/public/tests/${testA}/attempts/me`, { cookies: student.cookie })
		)
		assert.equal(reply.body.total, 2)
		const rows = reply.body.rows
		expectFields(byKey(rows, 'id', a1.attemptId, 'мои попытки A1'), A1_EXPECTED, 'мои попытки A1')
		expectFields(byKey(rows, 'id', a2.attemptId, 'мои попытки A2'), A2_EXPECTED, 'мои попытки A2')
	})

	test('chart-data ученика', async () => {
		const day = a1.submittedAt.slice(0, 10)
		const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
		const to = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
		const reply = ok(
			await call(
				ctx,
				'GET',
				`/api/tests/public/tests/${testA}/chart-data?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
				{ cookies: student.cookie }
			)
		)
		const attempts = reply.body.attempts as Json[]
		assert.deepEqual(
			attempts.map((row) => row.id),
			[a1.attemptId, a2.attemptId]
		)
		assert.ok(attempts.every((row) => String(row.submittedAt).slice(0, 10) === day))
		assert.deepEqual(
			attempts.map((row) => Number(row.scorePercentage)).sort((left, right) => left - right),
			[50, 100]
		)
	})

	test('попытки в профиле ученика', async () => {
		const reply = ok(await call(ctx, 'GET', `/api/users/${student.id}/test-attempts`, { cookies: world.adminCookie }))
		const attempts = reply.body.attempts
		assert.ok(Array.isArray(attempts))
		assert.equal(attempts.length, 3)
		for (const [label, made] of [
			['A1', a1],
			['A2', a2],
			['B1', b1],
		] as const) {
			expectFields(byKey(attempts, 'attemptId', made.attemptId, `профиль ${label}`), made.expected, `профиль ${label}`)
		}
	})

	test('глобальный поиск по попыткам: title, subtitle и поиск по проценту', async () => {
		const byTitle = ok(
			await call(ctx, 'GET', `/api/search?q=${encodeURIComponent(titleA)}&scope=attempts&limit=25`, {
				cookies: world.adminCookie,
			})
		)
		const categories = byTitle.body.categories as Array<{ scope: string; items: Json[] }>
		const items = categories.find((category) => category.scope === 'attempts')?.items
		const found1 = byKey(items, 'id', a1.attemptId, 'поиск A1')
		const found2 = byKey(items, 'id', a2.attemptId, 'поиск A2')
		assert.equal(found1.title, `${titleA} · 100%`)
		assert.equal(found2.title, `${titleA} · 50%`)
		assert.ok(String(found1.subtitle).includes('Сдано'))
		assert.ok(!String(found1.subtitle).includes('Не сдано'))
		assert.ok(String(found2.subtitle).includes('Не сдано'))

		const byPercent = ok(
			await call(ctx, 'GET', '/api/search?q=50&scope=attempts&limit=25', { cookies: world.adminCookie })
		)
		const percentItems = (byPercent.body.categories as Array<{ scope: string; items: Json[] }>).find(
			(category) => category.scope === 'attempts'
		)?.items
		byKey(percentItems, 'id', a2.attemptId, 'поиск по проценту')
	})

	test('повторная сдача с тем же clientAttemptId возвращает ту же попытку и не меняет строку', async () => {
		const rowBefore = await storedRow(a2.attemptId)
		const attemptsBefore = await countRows(world, 'SELECT count(*) FROM test_attempts WHERE user_id = $1', [student.id])
		assert.equal(attemptsBefore, 3)

		const again = ok(
			await submitAttempt(world, student.cookie, testA, {
				sessionId: a2Session,
				clientAttemptId: a2ClientAttemptId,
				answers: a2Answers,
			})
		)
		assert.equal(again.body.attemptId, a2.attemptId)
		expectFields(again.body, A2_EXPECTED, 'повторная сдача')

		assert.equal(
			await countRows(world, 'SELECT count(*) FROM test_attempts WHERE user_id = $1', [student.id]),
			attemptsBefore
		)
		assert.equal(await storedRow(a2.attemptId), rowBefore)
	})
})

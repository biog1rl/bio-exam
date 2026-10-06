import { AttemptSessionSchema } from '@bio-exam/exam-core'

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { afterAll, beforeAll, describe, test } from 'vitest'

import {
	addQuestion,
	adminReview,
	assignTest,
	attemptRowOf,
	createAttemptTest,
	insertOpenQuestion,
	seedAttemptWorld,
	seedStudent,
	shiftStartedAt,
	startSession,
	submitAttempt,
	type AttemptWorld,
} from '../../test-support/attempt-world.js'
import { startAuthApp, type AuthApp } from '../../test-support/auth-app.js'

type Student = { id: string; cookie: string }

let ctx: AuthApp
let world: AttemptWorld
let student: Student

beforeAll(async () => {
	ctx = await startAuthApp('test_attempt_deadline', { env: { PG_POOL_MAX: '12' } })
	world = await seedAttemptWorld(ctx, 'deadline')
	student = await seedStudent(world, 'deadline_student')
}, 60_000)

afterAll(async () => {
	await ctx?.stop()
})

async function databaseNowMs(): Promise<number> {
	const result = await ctx.pgPool.query<{ now: Date }>('SELECT clock_timestamp() AS now')
	return result.rows[0]!.now.getTime()
}

const MINUTE_MS = 60_000

type WindowTest = { testId: string; shortId: string; openId: string | null }

async function prepareWindowTest(
	slug: string,
	options: { timeLimitMinutes: number | null; withOpen: boolean }
): Promise<WindowTest> {
	const testId = await createAttemptTest(world, { slug, timeLimitMinutes: options.timeLimitMinutes })
	const shortId = await addQuestion(world, testId, 'short_answer')
	const openId = options.withOpen ? await insertOpenQuestion(ctx, testId, { order: 1 }) : null
	await assignTest(world, testId, student.id)
	return { testId, shortId, openId }
}

async function startOk(testId: string): Promise<string> {
	const reply = await startSession(world, student.cookie, testId)
	assert.equal(reply.status, 200, JSON.stringify(reply.body))
	return reply.body.sessionId as string
}

async function submitOk(prepared: WindowTest, sessionId: string): Promise<Record<string, unknown>> {
	const answers: Record<string, string> = { [prepared.shortId]: 'Митоз' }
	if (prepared.openId) answers[prepared.openId] = 'Соматическая клетка делится митозом'
	const reply = await submitAttempt(world, student.cookie, prepared.testId, {
		sessionId,
		clientAttemptId: crypto.randomUUID(),
		answers,
	})
	assert.equal(reply.status, 200, JSON.stringify(reply.body))
	return reply.body
}

async function startedAtOf(sessionId: string): Promise<Date> {
	const result = await ctx.pgPool.query<{ started_at: Date }>('SELECT started_at FROM test_sessions WHERE id = $1', [
		sessionId,
	])
	const row = result.rows[0]
	assert.ok(row, `session ${sessionId} not found`)
	return row.started_at
}

function assertSameMoment(actual: Date | null, expected: Date, label: string): void {
	assert.ok(actual, label)
	assert.ok(
		Math.abs(actual.getTime() - expected.getTime()) <= 1000,
		`${label}: ${actual.toISOString()} != ${expected.toISOString()}`
	)
}

describe('serverNow у /start', () => {
	test('новая и повторно открытая сессия несут время базы, тело проходит AttemptSessionSchema', async () => {
		const testId = await createAttemptTest(world, { slug: 'deadline-server-now', timeLimitMinutes: 30 })
		await addQuestion(world, testId, 'radio')
		await assignTest(world, testId, student.id)

		for (const attempt of ['first', 'repeat']) {
			const reply = await startSession(world, student.cookie, testId)
			assert.equal(reply.status, 200, `${attempt}: ${JSON.stringify(reply.body)}`)
			const serverNow = reply.body.serverNow
			assert.equal(typeof serverNow, 'string', attempt)
			const parsed = Date.parse(serverNow as string)
			assert.ok(!Number.isNaN(parsed), attempt)
			assert.ok(Math.abs((await databaseNowMs()) - parsed) <= 5000, attempt)
			assert.equal(AttemptSessionSchema.safeParse(reply.body).success, true, attempt)
		}
	})
})

describe('окно для фото при ручной сдаче', () => {
	test('сдача теста с открытым вопросом пишет upload_closes_at, ответ /submit его отдаёт', async () => {
		const prepared = await prepareWindowTest('deadline-window-tracer', { timeLimitMinutes: 10, withOpen: true })
		const sessionId = await startOk(prepared.testId)
		const body = await submitOk(prepared, sessionId)

		assert.equal(body.submitSource, 'client')
		assert.equal(typeof body.uploadClosesAt, 'string')
		const row = await attemptRowOf(ctx, body.attemptId as string)
		assertSameMoment(row.uploadClosesAt, new Date(row.submittedAt.getTime() + 15 * MINUTE_MS), 'upload_closes_at')
		assert.equal(Date.parse(body.uploadClosesAt as string), row.uploadClosesAt!.getTime())
	})

	type WindowCase = {
		name: string
		timeLimitMinutes: number | null
		withOpen: boolean
		windowMinutes?: number
		startedAgo?: string
		closesFrom: 'timer_end' | 'submitted' | null
	}

	test.each<WindowCase>([
		{
			name: 'в пределах льготы окно идёт от конца таймера',
			timeLimitMinutes: 10,
			withOpen: true,
			startedAgo: '11 minutes',
			closesFrom: 'timer_end',
		},
		{ name: 'без лимита окно идёт от сдачи', timeLimitMinutes: null, withOpen: true, closesFrom: 'submitted' },
		{ name: 'окно 0 — окна нет', timeLimitMinutes: 10, withOpen: true, windowMinutes: 0, closesFrom: null },
		{ name: 'без открытого вопроса окна нет', timeLimitMinutes: 10, withOpen: false, closesFrom: null },
	])('$name', async ({ name, timeLimitMinutes, withOpen, windowMinutes, startedAgo, closesFrom }) => {
		const slug = `deadline-window-${crypto.randomUUID().slice(0, 8)}`
		const prepared = await prepareWindowTest(slug, { timeLimitMinutes, withOpen })
		if (windowMinutes !== undefined) {
			await ctx.pgPool.query('UPDATE tests SET photo_upload_window_minutes = $2 WHERE id = $1', [
				prepared.testId,
				windowMinutes,
			])
		}
		const sessionId = await startOk(prepared.testId)
		if (startedAgo) await shiftStartedAt(ctx, sessionId, startedAgo)
		const body = await submitOk(prepared, sessionId)
		const attemptId = body.attemptId as string
		const row = await attemptRowOf(ctx, attemptId)

		assert.equal(row.submitSource, 'client', name)
		if (closesFrom === null) {
			assert.equal(row.uploadClosesAt, null, name)
			assert.equal(body.uploadClosesAt, null, name)
		} else {
			const anchor =
				closesFrom === 'timer_end'
					? (await startedAtOf(sessionId)).getTime() + (timeLimitMinutes ?? 0) * MINUTE_MS
					: row.submittedAt.getTime()
			assertSameMoment(row.uploadClosesAt, new Date(anchor + 15 * MINUTE_MS), name)
			assert.equal(Date.parse(body.uploadClosesAt as string), row.uploadClosesAt!.getTime(), name)
		}

		const review = await adminReview(world, attemptId)
		assert.equal(review.status, 200, JSON.stringify(review.body))
		const reviewed = review.body.attempt as Record<string, unknown>
		assert.equal(reviewed.uploadClosesAt, body.uploadClosesAt, name)
		assert.equal(reviewed.submitSource, 'client', name)
	})
})

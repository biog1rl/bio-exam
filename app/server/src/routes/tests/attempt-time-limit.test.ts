import assert from 'node:assert/strict'
import { afterAll, beforeAll, describe, test } from 'vitest'

import {
	addQuestion,
	assignTest,
	countRows,
	createAttemptTest,
	saveDraft,
	seedAttemptWorld,
	seedStudent,
	startSession,
	type AttemptWorld,
} from '../../test-support/attempt-world.js'
import { startAuthApp, type AuthApp } from '../../test-support/auth-app.js'

type Student = { id: string; cookie: string }

type SessionRow = {
	closed_at: Date | null
	close_reason: string | null
	submitted_at: Date | null
	draft_answers: unknown
}

let ctx: AuthApp
let world: AttemptWorld
let student: Student

async function prepareTest(slug: string, timeLimitMinutes: number | null) {
	const testId = await createAttemptTest(world, { slug, timeLimitMinutes })
	const questionId = await addQuestion(world, testId, 'radio')
	await assignTest(world, testId, student.id)
	return { testId, questionId }
}

async function startOk(testId: string, cookie = student.cookie): Promise<string> {
	const reply = await startSession(world, cookie, testId)
	assert.equal(reply.status, 200, JSON.stringify(reply.body))
	assert.equal(typeof reply.body.sessionId, 'string')
	return reply.body.sessionId as string
}

async function shiftStartedAt(sessionId: string, interval: string): Promise<void> {
	await ctx.pgPool.query('UPDATE test_sessions SET started_at = now() - $2::interval WHERE id = $1', [
		sessionId,
		interval,
	])
}

async function sessionRow(sessionId: string): Promise<SessionRow> {
	const result = await ctx.pgPool.query<SessionRow>(
		'SELECT closed_at, close_reason, submitted_at, draft_answers FROM test_sessions WHERE id = $1',
		[sessionId]
	)
	const row = result.rows[0]
	assert.ok(row, `session ${sessionId} not found`)
	return row
}

async function openSessionsOf(testId: string, userId: string): Promise<number> {
	return countRows(
		world,
		'SELECT count(*)::int AS count FROM test_sessions WHERE test_id = $1 AND user_id = $2 AND submitted_at IS NULL AND closed_at IS NULL',
		[testId, userId]
	)
}

beforeAll(async () => {
	ctx = await startAuthApp('test_attempt_time')
	world = await seedAttemptWorld(ctx, 'time')
	student = await seedStudent(world, 'time_student')
}, 60_000)

afterAll(async () => {
	await ctx?.stop()
})

describe('лимит времени на /start', () => {
	test('в пределах льготы /start возвращает ту же сессию, за льготой закрывает её как expired и открывает новую', async () => {
		const { testId, questionId } = await prepareTest('time-limit-start', 10)
		const first = await startOk(testId)
		const draft = await saveDraft(world, student.cookie, testId, first, { questionId, value: 'a' })
		assert.equal(draft.status, 200)

		await shiftStartedAt(first, '11 minutes')
		const withinGrace = await startSession(world, student.cookie, testId)
		assert.equal(withinGrace.status, 200)
		assert.equal(withinGrace.body.sessionId, first)
		assert.deepEqual(withinGrace.body.draftAnswers, { [questionId]: 'a' })

		await shiftStartedAt(first, '13 minutes')
		const restarted = await startSession(world, student.cookie, testId)
		assert.equal(restarted.status, 200)
		const second = restarted.body.sessionId as string
		assert.equal(typeof second, 'string')
		assert.notEqual(second, first)
		assert.equal(restarted.body.draftAnswers, null)
		assert.equal(restarted.body.draftLastQuestionId, null)
		assert.equal(restarted.body.draftTelemetry, null)

		const closed = await sessionRow(first)
		assert.notEqual(closed.closed_at, null)
		assert.equal(closed.close_reason, 'expired')
		assert.equal(closed.submitted_at, null)
		assert.deepEqual(closed.draft_answers, { [questionId]: 'a' })

		const fresh = await sessionRow(second)
		assert.equal(fresh.closed_at, null)
		assert.equal(fresh.draft_answers, null)

		assert.equal(await openSessionsOf(testId, student.id), 1)
		assert.equal(
			await countRows(world, 'SELECT count(*)::int AS count FROM test_sessions WHERE test_id = $1 AND user_id = $2', [
				testId,
				student.id,
			]),
			2
		)
		assert.equal(
			await countRows(world, 'SELECT count(*)::int AS count FROM test_attempts WHERE test_id = $1 AND user_id = $2', [
				testId,
				student.id,
			]),
			0
		)
	})

	test('тест без лимита: сессия десятидневной давности остаётся той же', async () => {
		const { testId } = await prepareTest('time-no-limit', null)
		const first = await startOk(testId)
		await shiftStartedAt(first, '10 days')
		const again = await startSession(world, student.cookie, testId)
		assert.equal(again.status, 200)
		assert.equal(again.body.sessionId, first)
		const row = await sessionRow(first)
		assert.equal(row.closed_at, null)
		assert.equal(await openSessionsOf(testId, student.id), 1)
	})
})

describe('PATCH черновика и лимит времени', () => {
	test('PATCH в просроченную, но не закрытую сессию отвечает 200 и сохраняет ответ', async () => {
		const { testId, questionId } = await prepareTest('time-patch-expired-open', 10)
		const sessionId = await startOk(testId)
		await shiftStartedAt(sessionId, '13 minutes')
		const reply = await saveDraft(world, student.cookie, testId, sessionId, { questionId, value: 'b' })
		assert.equal(reply.status, 200)
		assert.deepEqual(reply.body, { ok: true })
		const row = await sessionRow(sessionId)
		assert.equal(row.closed_at, null)
		assert.deepEqual(row.draft_answers, { [questionId]: 'b' })
	})

	test('PATCH в сессию, закрытую как expired, отвечает 404 и черновик не меняется', async () => {
		const { testId, questionId } = await prepareTest('time-patch-closed', 10)
		const first = await startOk(testId)
		const draft = await saveDraft(world, student.cookie, testId, first, { questionId, value: 'a' })
		assert.equal(draft.status, 200)
		await shiftStartedAt(first, '13 minutes')
		const second = await startOk(testId)
		assert.notEqual(second, first)

		const reply = await saveDraft(world, student.cookie, testId, first, { questionId, value: 'c' })
		assert.equal(reply.status, 404)
		assert.deepEqual(reply.body, { error: 'Session not found or already submitted' })
		const row = await sessionRow(first)
		assert.equal(row.close_reason, 'expired')
		assert.deepEqual(row.draft_answers, { [questionId]: 'a' })
	})

	test('PATCH в сессию другого назначенного пользователя отвечает 404 и черновик не пишется', async () => {
		const { testId, questionId } = await prepareTest('time-patch-foreign', null)
		const other = await seedStudent(world, 'time_other')
		await assignTest(world, testId, other.id)
		const sessionId = await startOk(testId)

		const reply = await saveDraft(world, other.cookie, testId, sessionId, { questionId, value: 'a' })
		assert.equal(reply.status, 404)
		assert.deepEqual(reply.body, { error: 'Session not found or already submitted' })
		const row = await sessionRow(sessionId)
		assert.equal(row.draft_answers, null)
	})
})

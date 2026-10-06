import { computeAttemptOutcome } from '@bio-exam/exam-core'

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { afterAll, beforeAll, describe, test } from 'vitest'

import {
	addQuestion,
	assignTest,
	countRows,
	createAttemptTest,
	saveDraft,
	seedAttemptWorld,
	seedStudent,
	shiftStartedAt,
	startSession,
	submitAttempt,
	type AttemptWorld,
} from '../../test-support/attempt-world.js'
import { startAuthApp, type AuthApp } from '../../test-support/auth-app.js'

type Student = { id: string; cookie: string }

type AttemptSessionsModule = typeof import('../../services/attempt-sessions/index.js')

type SessionRow = {
	closed_at: Date | null
	close_reason: string | null
	submitted_at: Date | null
	draft_answers: unknown
}

let ctx: AuthApp
let world: AttemptWorld
let student: Student
let attemptSessions: AttemptSessionsModule

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

async function sessionRow(sessionId: string): Promise<SessionRow> {
	const result = await ctx.pgPool.query<SessionRow>(
		'SELECT closed_at, close_reason, submitted_at, draft_answers FROM test_sessions WHERE id = $1',
		[sessionId]
	)
	const row = result.rows[0]
	assert.ok(row, `session ${sessionId} not found`)
	return row
}

async function deadlineAttemptsOf(sessionId: string): Promise<{ submit_source: string; answers: unknown }[]> {
	const result = await ctx.pgPool.query<{ submit_source: string; answers: unknown }>(
		'SELECT submit_source, answers FROM test_attempts WHERE session_id = $1',
		[sessionId]
	)
	return result.rows
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
	attemptSessions = await import('../../services/attempt-sessions/index.js')
}, 60_000)

afterAll(async () => {
	await ctx?.stop()
})

describe('лимит времени на /start', () => {
	test('в пределах льготы /start возвращает ту же сессию, за льготой сдаёт её по черновику и открывает новую', async () => {
		const { testId, questionId } = await prepareTest('time-limit-start', 10)
		const first = await startOk(testId)
		const draft = await saveDraft(world, student.cookie, testId, first, { questionId, value: 'a' })
		assert.equal(draft.status, 200)

		await shiftStartedAt(ctx, first, '11 minutes')
		const withinGrace = await startSession(world, student.cookie, testId)
		assert.equal(withinGrace.status, 200)
		assert.equal(withinGrace.body.sessionId, first)
		assert.deepEqual(withinGrace.body.draftAnswers, { [questionId]: 'a' })

		await shiftStartedAt(ctx, first, '13 minutes')
		const restarted = await startSession(world, student.cookie, testId)
		assert.equal(restarted.status, 200)
		const second = restarted.body.sessionId as string
		assert.equal(typeof second, 'string')
		assert.notEqual(second, first)
		assert.equal(restarted.body.draftAnswers, null)
		assert.equal(restarted.body.draftLastQuestionId, null)
		assert.equal(restarted.body.draftTelemetry, null)

		const finalized = await sessionRow(first)
		assert.notEqual(finalized.submitted_at, null)
		assert.equal(finalized.closed_at, null)
		assert.deepEqual(await deadlineAttemptsOf(first), [{ submit_source: 'deadline', answers: { [questionId]: 'a' } }])

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
			1
		)
	})

	test('тест без лимита: сессия десятидневной давности остаётся той же', async () => {
		const { testId } = await prepareTest('time-no-limit', null)
		const first = await startOk(testId)
		await shiftStartedAt(ctx, first, '10 days')
		const again = await startSession(world, student.cookie, testId)
		assert.equal(again.status, 200)
		assert.equal(again.body.sessionId, first)
		const row = await sessionRow(first)
		assert.equal(row.closed_at, null)
		assert.equal(await openSessionsOf(testId, student.id), 1)
	})
})

describe('PATCH черновика и лимит времени', () => {
	test.each([
		{ name: 'с черновиком — попытка deadline по нему', withDraft: true },
		{ name: 'без черновика — сессия закрыта expired', withDraft: false },
	])('PATCH за льготой отвечает 404 и не пишет ответ, $name', async ({ withDraft }) => {
		const { testId, questionId } = await prepareTest(`time-patch-expired-${withDraft ? 'draft' : 'empty'}`, 10)
		const sessionId = await startOk(testId)
		if (withDraft) {
			const draft = await saveDraft(world, student.cookie, testId, sessionId, { questionId, value: 'a' })
			assert.equal(draft.status, 200)
		}
		await shiftStartedAt(ctx, sessionId, '13 minutes')

		const reply = await saveDraft(world, student.cookie, testId, sessionId, { questionId, value: 'b' })
		assert.equal(reply.status, 404, JSON.stringify(reply.body))
		assert.deepEqual(reply.body, { error: 'Session not found or already submitted' })

		const row = await sessionRow(sessionId)
		if (withDraft) {
			assert.notEqual(row.submitted_at, null)
			assert.equal(row.closed_at, null)
			assert.deepEqual(await deadlineAttemptsOf(sessionId), [
				{ submit_source: 'deadline', answers: { [questionId]: 'a' } },
			])
			return
		}
		assert.equal(row.close_reason, 'expired')
		assert.equal(row.submitted_at, null)
		assert.equal(row.draft_answers, null)
		assert.equal(await attemptsOf(testId), 0)
	})

	test('PATCH в сессию, закрытую как expired, отвечает 404 и черновик не меняется', async () => {
		const { testId, questionId } = await prepareTest('time-patch-closed', 10)
		const first = await startOk(testId)
		await shiftStartedAt(ctx, first, '13 minutes')
		const second = await startOk(testId)
		assert.notEqual(second, first)

		const reply = await saveDraft(world, student.cookie, testId, first, { questionId, value: 'c' })
		assert.equal(reply.status, 404)
		assert.deepEqual(reply.body, { error: 'Session not found or already submitted' })
		const row = await sessionRow(first)
		assert.equal(row.close_reason, 'expired')
		assert.equal(row.draft_answers, null)
	})

	test('PATCH в сессию, сданную сервером на /start за льготой, отвечает 404 и ответ никуда не пишется', async () => {
		const { testId, questionId } = await prepareTest('time-patch-finalized', 10)
		const first = await startOk(testId)
		const draft = await saveDraft(world, student.cookie, testId, first, { questionId, value: 'a' })
		assert.equal(draft.status, 200)
		await shiftStartedAt(ctx, first, '13 minutes')
		const second = await startOk(testId)
		assert.notEqual(second, first)
		assert.notEqual((await sessionRow(first)).submitted_at, null)

		const reply = await saveDraft(world, student.cookie, testId, first, { questionId, value: 'c' })
		assert.equal(reply.status, 404)
		assert.deepEqual(reply.body, { error: 'Session not found or already submitted' })
		assert.deepEqual(await deadlineAttemptsOf(first), [{ submit_source: 'deadline', answers: { [questionId]: 'a' } }])
		assert.equal(await attemptsOf(testId), 1)
		assert.equal((await sessionRow(first)).draft_answers, null)
		assert.equal((await sessionRow(second)).draft_answers, null)
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

describe('PATCH черновика: входная проверка', () => {
	test('чужой questionId отвечает 400 foreign_question, черновик не меняется', async () => {
		const { testId, questionId } = await prepareTest('time-draft-foreign', null)
		const other = await prepareTest('time-draft-foreign-other', null)
		const sessionId = await startOk(testId)
		const saved = await saveDraft(world, student.cookie, testId, sessionId, { questionId, value: 'a' })
		assert.equal(saved.status, 200)

		const reply = await saveDraft(world, student.cookie, testId, sessionId, {
			questionId: other.questionId,
			value: 'a',
		})
		assert.equal(reply.status, 400, JSON.stringify(reply.body))
		assert.deepEqual(reply.body, { error: 'ANSWERS_INVALID', reason: 'foreign_question' })
		assert.deepEqual((await sessionRow(sessionId)).draft_answers, { [questionId]: 'a' })
	})

	test('краткий ответ в 201 знак отвечает 400 short_text_too_long, а следующее корректное сохранение проходит', async () => {
		const testId = await createAttemptTest(world, { slug: 'time-draft-short', timeLimitMinutes: null })
		const questionId = await addQuestion(world, testId, 'short_answer')
		await assignTest(world, testId, student.id)
		const sessionId = await startOk(testId)

		const reply = await saveDraft(world, student.cookie, testId, sessionId, {
			questionId,
			value: 'а'.repeat(201),
		})
		assert.equal(reply.status, 400, JSON.stringify(reply.body))
		assert.deepEqual(reply.body, { error: 'ANSWERS_INVALID', reason: 'short_text_too_long', limit: 200 })
		assert.equal((await sessionRow(sessionId)).draft_answers, null)

		const ok = await saveDraft(world, student.cookie, testId, sessionId, { questionId, value: 'а'.repeat(200) })
		assert.equal(ok.status, 200, JSON.stringify(ok.body))
		assert.deepEqual((await sessionRow(sessionId)).draft_answers, { [questionId]: 'а'.repeat(200) })
	})

	test('строка сверх предела id на вопросе с выбором отвечает 400 answer_shape_invalid, черновик не меняется', async () => {
		const { testId, questionId } = await prepareTest('time-draft-shape', null)
		const sessionId = await startOk(testId)

		const reply = await saveDraft(world, student.cookie, testId, sessionId, { questionId, value: 'a'.repeat(201) })
		assert.equal(reply.status, 400, JSON.stringify(reply.body))
		assert.deepEqual(reply.body, { error: 'ANSWERS_INVALID', reason: 'answer_shape_invalid' })
		assert.equal((await sessionRow(sessionId)).draft_answers, null)
	})

	test('25 одновременных сохранений черновика отвечают 200 без зависания', async () => {
		const { testId, questionId } = await prepareTest('time-draft-concurrent', null)
		const sessionId = await startOk(testId)

		const replies = await Promise.all(
			Array.from({ length: 25 }, () => saveDraft(world, student.cookie, testId, sessionId, { questionId, value: 'b' }))
		)
		assert.deepEqual(
			replies.map((reply) => reply.status),
			Array.from({ length: 25 }, () => 200)
		)
		assert.deepEqual((await sessionRow(sessionId)).draft_answers, { [questionId]: 'b' })
	})
})

async function attemptsOf(testId: string): Promise<number> {
	return countRows(world, 'SELECT count(*)::int AS count FROM test_attempts WHERE test_id = $1 AND user_id = $2', [
		testId,
		student.id,
	])
}

function submitEnvelope(sessionId: string, questionId: string) {
	return { sessionId, clientAttemptId: crypto.randomUUID(), answers: { [questionId]: 'b' } }
}

const STUB_FACTS = {
	results: [],
	resultsVersion: 1 as const,
	earnedPoints: 0,
	totalPoints: 0,
	scorePercentage: 0,
	passed: false,
	outcome: computeAttemptOutcome({ facts: [], finalScores: new Map(), passingScore: 60 }),
	passingScore: 60,
}

describe('лимит времени на submit', () => {
	test('лимит 10, started_at 11 минут назад: submit отвечает 200', async () => {
		const { testId, questionId } = await prepareTest('time-submit-grace', 10)
		const sessionId = await startOk(testId)
		await shiftStartedAt(ctx, sessionId, '11 minutes')
		const reply = await submitAttempt(world, student.cookie, testId, submitEnvelope(sessionId, questionId))
		assert.equal(reply.status, 200, JSON.stringify(reply.body))
		assert.equal(await attemptsOf(testId), 1)
		const row = await sessionRow(sessionId)
		assert.notEqual(row.submitted_at, null)
		assert.equal(row.closed_at, null)
	})

	test('лимит 10, started_at 13 минут назад: 422, сессия закрыта как expired, попытки нет, /start открывает новую', async () => {
		const { testId, questionId } = await prepareTest('time-submit-expired', 10)
		const sessionId = await startOk(testId)
		await shiftStartedAt(ctx, sessionId, '13 minutes')
		const reply = await submitAttempt(world, student.cookie, testId, submitEnvelope(sessionId, questionId))
		assert.equal(reply.status, 422)
		assert.deepEqual(reply.body, { error: 'TIME_EXPIRED' })
		assert.equal(await attemptsOf(testId), 0)
		const row = await sessionRow(sessionId)
		assert.notEqual(row.closed_at, null)
		assert.equal(row.close_reason, 'expired')
		assert.equal(row.submitted_at, null)

		const again = await submitAttempt(world, student.cookie, testId, submitEnvelope(sessionId, questionId))
		assert.equal(again.status, 422)
		assert.deepEqual(again.body, { error: 'TIME_EXPIRED' })

		const next = await startOk(testId)
		assert.notEqual(next, sessionId)
		assert.equal(await openSessionsOf(testId, student.id), 1)
		assert.equal(await attemptsOf(testId), 0)
	})

	test('тест без лимита, started_at 10 дней назад: submit отвечает 200', async () => {
		const { testId, questionId } = await prepareTest('time-submit-no-limit', null)
		const sessionId = await startOk(testId)
		await shiftStartedAt(ctx, sessionId, '10 days')
		const reply = await submitAttempt(world, student.cookie, testId, submitEnvelope(sessionId, questionId))
		assert.equal(reply.status, 200, JSON.stringify(reply.body))
		assert.equal(await attemptsOf(testId), 1)
	})
})

describe('между предпроверкой и транзакцией submit', () => {
	test('оценка дольше остатка льготы не даёт 422, если на входе срок не истёк', async () => {
		const { testId } = await prepareTest('time-between-slow-scoring', 10)
		const sessionId = await startOk(testId)
		await shiftStartedAt(ctx, sessionId, '11 minutes')
		const clientAttemptId = crypto.randomUUID()

		const precheck = await attemptSessions.precheckSubmit({
			testId,
			userId: student.id,
			testSessionId: sessionId,
			clientAttemptId,
			timeLimitMinutes: 10,
		})
		assert.deepEqual(precheck, { kind: 'open' })

		await shiftStartedAt(ctx, sessionId, '13 minutes')
		const outcome = await attemptSessions.submitAttempt({
			testId,
			userId: student.id,
			testSessionId: sessionId,
			clientAttemptId,
			answers: {},
			scored: STUB_FACTS,
		})
		assert.equal(outcome.kind, 'created')
		assert.equal(await attemptsOf(testId), 1)
		const row = await sessionRow(sessionId)
		assert.notEqual(row.submitted_at, null)
		assert.equal(row.closed_at, null)
		assert.equal(row.close_reason, null)
	})

	test('сессия, закрытая как expired параллельным /start до транзакции, даёт closed с reason expired', async () => {
		const { testId } = await prepareTest('time-between-closed', 10)
		const sessionId = await startOk(testId)
		const clientAttemptId = crypto.randomUUID()

		const precheck = await attemptSessions.precheckSubmit({
			testId,
			userId: student.id,
			testSessionId: sessionId,
			clientAttemptId,
			timeLimitMinutes: 10,
		})
		assert.deepEqual(precheck, { kind: 'open' })

		await ctx.pgPool.query("UPDATE test_sessions SET closed_at = now(), close_reason = 'expired' WHERE id = $1", [
			sessionId,
		])
		const outcome = await attemptSessions.submitAttempt({
			testId,
			userId: student.id,
			testSessionId: sessionId,
			clientAttemptId,
			answers: {},
			scored: STUB_FACTS,
		})
		assert.deepEqual(outcome, { kind: 'closed', reason: 'expired' })
		assert.equal(await attemptsOf(testId), 0)
		const row = await sessionRow(sessionId)
		assert.equal(row.submitted_at, null)
		assert.equal(row.close_reason, 'expired')
	})
})

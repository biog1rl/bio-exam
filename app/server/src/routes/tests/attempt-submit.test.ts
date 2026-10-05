import { SubmitAttemptErrorSchema } from '@bio-exam/exam-core'

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
	startSession,
	submitAttempt,
	type AttemptWorld,
} from '../../test-support/attempt-world.js'
import { startAuthApp, type AuthApp } from '../../test-support/auth-app.js'

type Student = { id: string; cookie: string }

type SessionRow = {
	submitted_at: Date | null
	attempt_id: string | null
	closed_at: Date | null
	close_reason: string | null
	draft_answers: unknown
	draft_last_question_id: string | null
	draft_telemetry: unknown
	draft_updated_at: Date | null
}

let ctx: AuthApp
let world: AttemptWorld
let student: Student
let classmate: Student

async function prepareTest(slug: string) {
	const testId = await createAttemptTest(world, { slug })
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

function envelope(sessionId: string, questionId: string, clientAttemptId = crypto.randomUUID()) {
	return { sessionId, clientAttemptId, answers: { [questionId]: 'b' } }
}

async function attemptsOf(testId: string, userId: string): Promise<number> {
	return countRows(world, 'SELECT count(*)::int AS count FROM test_attempts WHERE test_id = $1 AND user_id = $2', [
		testId,
		userId,
	])
}

async function sessionRow(sessionId: string): Promise<SessionRow> {
	const result = await ctx.pgPool.query<SessionRow>(
		'SELECT submitted_at, attempt_id, closed_at, close_reason, draft_answers, draft_last_question_id, draft_telemetry, draft_updated_at FROM test_sessions WHERE id = $1',
		[sessionId]
	)
	const row = result.rows[0]
	assert.ok(row, `session ${sessionId} not found`)
	return row
}

async function insertClosedSession(testId: string, userId: string, reason: 'expired' | 'superseded'): Promise<string> {
	const result = await ctx.pgPool.query<{ id: string }>(
		'INSERT INTO test_sessions (test_id, user_id, closed_at, close_reason) VALUES ($1, $2, now(), $3) RETURNING id',
		[testId, userId, reason]
	)
	const id = result.rows[0]?.id
	assert.ok(id, 'closed session was not inserted')
	return id
}

beforeAll(async () => {
	ctx = await startAuthApp('test_attempt_submit')
	world = await seedAttemptWorld(ctx, 'submit')
	student = await seedStudent(world, 'submit_student')
	classmate = await seedStudent(world, 'submit_classmate')
}, 60_000)

afterAll(async () => {
	await ctx?.stop()
})

describe('POST submit: разбор конверта', () => {
	test('без sessionId, без clientAttemptId и с sessionId не uuid отвечает 400', async () => {
		const { testId, questionId } = await prepareTest('submit-bad-request')
		const sessionId = await startOk(testId)
		const bodies = [
			{ clientAttemptId: crypto.randomUUID(), answers: { [questionId]: 'b' } },
			{ sessionId, answers: { [questionId]: 'b' } },
			{ sessionId: 'not-a-uuid', clientAttemptId: crypto.randomUUID(), answers: { [questionId]: 'b' } },
		]
		for (const body of bodies) {
			const reply = await submitAttempt(world, student.cookie, testId, body)
			assert.equal(reply.status, 400, JSON.stringify(body))
			assert.equal(reply.body.error, 'Bad request')
		}
		assert.equal(await attemptsOf(testId, student.id), 0)
		assert.equal((await sessionRow(sessionId)).submitted_at, null)
	})
})

describe('POST submit: сессия не найдена', () => {
	test('случайный sessionId отвечает 404 Session not found', async () => {
		const { testId, questionId } = await prepareTest('submit-random-session')
		const reply = await submitAttempt(world, student.cookie, testId, envelope(crypto.randomUUID(), questionId))
		assert.equal(reply.status, 404)
		assert.deepEqual(reply.body, { error: 'Session not found' })
		assert.equal(await attemptsOf(testId, student.id), 0)
	})

	test('сессия другого студента того же теста отвечает 404 Session not found', async () => {
		const { testId, questionId } = await prepareTest('submit-foreign-user')
		await assignTest(world, testId, classmate.id)
		const foreignSession = await startOk(testId, classmate.cookie)
		const reply = await submitAttempt(world, student.cookie, testId, envelope(foreignSession, questionId))
		assert.equal(reply.status, 404)
		assert.deepEqual(reply.body, { error: 'Session not found' })
		assert.equal(await attemptsOf(testId, student.id), 0)
		assert.equal(await attemptsOf(testId, classmate.id), 0)
		assert.equal((await sessionRow(foreignSession)).submitted_at, null)
	})

	test('сессия этого студента в другом тесте отвечает 404 Session not found', async () => {
		const { testId, questionId } = await prepareTest('submit-foreign-test')
		const other = await prepareTest('submit-foreign-test-other')
		const otherSession = await startOk(other.testId)
		const reply = await submitAttempt(world, student.cookie, testId, envelope(otherSession, questionId))
		assert.equal(reply.status, 404)
		assert.deepEqual(reply.body, { error: 'Session not found' })
		assert.equal(await attemptsOf(testId, student.id), 0)
		assert.equal(await attemptsOf(other.testId, student.id), 0)
		assert.equal((await sessionRow(otherSession)).submitted_at, null)
	})
})

describe('POST submit: сдача и повтор', () => {
	test('повтор того же конверта отвечает 200 тем же телом, попытка одна и связана с сессией', async () => {
		const { testId, questionId } = await prepareTest('submit-replay')
		const sessionId = await startOk(testId)
		const draft = await saveDraft(world, student.cookie, testId, sessionId, {
			questionId,
			value: 'a',
			telemetry: { [questionId]: { timeSpentMs: 500, focusLossCount: 1, visitCount: 1 } },
		})
		assert.equal(draft.status, 200)

		const body = envelope(sessionId, questionId)
		const first = await submitAttempt(world, student.cookie, testId, body)
		const second = await submitAttempt(world, student.cookie, testId, body)
		assert.equal(first.status, 200, JSON.stringify(first.body))
		assert.equal(second.status, 200, JSON.stringify(second.body))
		assert.deepEqual(second.body, first.body)
		assert.equal(typeof first.body.attemptId, 'string')
		const attemptId = first.body.attemptId as string

		assert.equal(await attemptsOf(testId, student.id), 1)
		const session = await sessionRow(sessionId)
		assert.notEqual(session.submitted_at, null)
		assert.equal(session.attempt_id, attemptId)
		assert.equal(session.closed_at, null)
		assert.equal(session.draft_answers, null)
		assert.equal(session.draft_last_question_id, null)
		assert.equal(session.draft_telemetry, null)
		assert.equal(session.draft_updated_at, null)

		const attempt = await ctx.pgPool.query<{ session_id: string; client_attempt_id: string; results_version: number }>(
			'SELECT session_id, client_attempt_id, results_version FROM test_attempts WHERE id = $1',
			[attemptId]
		)
		assert.deepEqual(attempt.rows, [
			{ session_id: sessionId, client_attempt_id: body.clientAttemptId, results_version: 2 },
		])
	})

	test('PATCH черновика в сданную сессию отвечает 404, черновик остаётся пустым', async () => {
		const { testId, questionId } = await prepareTest('submit-then-draft')
		const sessionId = await startOk(testId)
		const draft = await saveDraft(world, student.cookie, testId, sessionId, { questionId, value: 'a' })
		assert.equal(draft.status, 200)
		const submitted = await submitAttempt(world, student.cookie, testId, envelope(sessionId, questionId))
		assert.equal(submitted.status, 200, JSON.stringify(submitted.body))

		const late = await saveDraft(world, student.cookie, testId, sessionId, {
			questionId,
			value: 'c',
			telemetry: { [questionId]: { timeSpentMs: 300, focusLossCount: 0, visitCount: 1 } },
		})
		assert.equal(late.status, 404)
		assert.deepEqual(late.body, { error: 'Session not found or already submitted' })
		const session = await sessionRow(sessionId)
		assert.equal(session.attempt_id, submitted.body.attemptId)
		assert.equal(session.draft_answers, null)
		assert.equal(session.draft_last_question_id, null)
		assert.equal(session.draft_telemetry, null)
		assert.equal(session.draft_updated_at, null)
	})

	test('та же сессия с другим clientAttemptId отвечает 409 ATTEMPT_ALREADY_SUBMITTED с attemptId первой', async () => {
		const { testId, questionId } = await prepareTest('submit-conflict')
		const sessionId = await startOk(testId)
		const first = await submitAttempt(world, student.cookie, testId, envelope(sessionId, questionId))
		assert.equal(first.status, 200)

		const second = await submitAttempt(world, student.cookie, testId, envelope(sessionId, questionId))
		assert.equal(second.status, 409)
		assert.deepEqual(second.body, { error: 'ATTEMPT_ALREADY_SUBMITTED', attemptId: first.body.attemptId })
		assert.equal(await attemptsOf(testId, student.id), 1)
	})

	test('clientAttemptId сданной сессии в новой сессии отвечает 409, новая сессия остаётся открытой', async () => {
		const { testId, questionId } = await prepareTest('submit-reused-client-id')
		const s1 = await startOk(testId)
		const clientAttemptId = crypto.randomUUID()
		const first = await submitAttempt(world, student.cookie, testId, envelope(s1, questionId, clientAttemptId))
		assert.equal(first.status, 200)

		const s2 = await startOk(testId)
		assert.notEqual(s2, s1)
		const second = await submitAttempt(world, student.cookie, testId, envelope(s2, questionId, clientAttemptId))
		assert.equal(second.status, 409)
		assert.deepEqual(second.body, { error: 'ATTEMPT_ALREADY_SUBMITTED', attemptId: first.body.attemptId })

		const session = await sessionRow(s2)
		assert.equal(session.submitted_at, null)
		assert.equal(session.closed_at, null)
		assert.equal(session.attempt_id, null)
		assert.equal(await attemptsOf(testId, student.id), 1)
	})
})

describe('POST submit: закрытая сессия', () => {
	test('сессия, закрытая как superseded, отвечает 404 Session not found', async () => {
		const { testId, questionId } = await prepareTest('submit-superseded')
		const sessionId = await insertClosedSession(testId, student.id, 'superseded')
		const reply = await submitAttempt(world, student.cookie, testId, envelope(sessionId, questionId))
		assert.equal(reply.status, 404)
		assert.deepEqual(reply.body, { error: 'Session not found' })
		assert.equal(await attemptsOf(testId, student.id), 0)
		assert.equal((await sessionRow(sessionId)).submitted_at, null)
	})

	test('сессия, закрытая как expired, отвечает 422 TIME_EXPIRED', async () => {
		const { testId, questionId } = await prepareTest('submit-closed-expired')
		const sessionId = await insertClosedSession(testId, student.id, 'expired')
		const reply = await submitAttempt(world, student.cookie, testId, envelope(sessionId, questionId))
		assert.equal(reply.status, 422)
		assert.deepEqual(reply.body, { error: 'TIME_EXPIRED' })
		assert.equal(await attemptsOf(testId, student.id), 0)
		assert.equal((await sessionRow(sessionId)).submitted_at, null)
	})
})

async function prepareShortAnswerTest(slug: string) {
	const testId = await createAttemptTest(world, { slug })
	const questionId = await addQuestion(world, testId, 'short_answer')
	await assignTest(world, testId, student.id)
	return { testId, questionId }
}

async function insertRawQuestion(testId: string, type: string): Promise<string> {
	const result = await ctx.pgPool.query<{ id: string }>(
		'INSERT INTO questions (test_id, type, "order", points) VALUES ($1, $2, 0, 3) RETURNING id',
		[testId, type]
	)
	const id = result.rows[0]?.id
	assert.ok(id, 'question was not inserted')
	return id
}

describe('POST submit: входная проверка ответов', () => {
	test('ответ на вопрос другого теста отвечает 422 foreign_question, строки нет, сессия открыта, исправленная сдача проходит', async () => {
		const { testId, questionId } = await prepareTest('submit-invalid-foreign')
		const other = await prepareTest('submit-invalid-foreign-other')
		const sessionId = await startOk(testId)

		const reply = await submitAttempt(world, student.cookie, testId, {
			sessionId,
			clientAttemptId: crypto.randomUUID(),
			answers: { [questionId]: 'b', [other.questionId]: 'a' },
		})
		assert.equal(reply.status, 422, JSON.stringify(reply.body))
		const body = SubmitAttemptErrorSchema.parse(reply.body)
		assert.equal(body.error, 'ANSWERS_INVALID')
		assert.equal(body.reason, 'foreign_question')
		assert.equal(await attemptsOf(testId, student.id), 0)
		const session = await sessionRow(sessionId)
		assert.equal(session.closed_at, null)
		assert.equal(session.submitted_at, null)

		const fixed = await submitAttempt(world, student.cookie, testId, envelope(sessionId, questionId))
		assert.equal(fixed.status, 200, JSON.stringify(fixed.body))
		assert.equal(await attemptsOf(testId, student.id), 1)
	})

	test('краткий ответ в 200 знаков принимается, в 201 отвечает 422 short_text_too_long с limit 200', async () => {
		const { testId, questionId } = await prepareShortAnswerTest('submit-invalid-short')
		const sessionId = await startOk(testId)

		const tooLong = await submitAttempt(world, student.cookie, testId, {
			sessionId,
			clientAttemptId: crypto.randomUUID(),
			answers: { [questionId]: 'а'.repeat(201) },
		})
		assert.equal(tooLong.status, 422, JSON.stringify(tooLong.body))
		assert.deepEqual(tooLong.body, { error: 'ANSWERS_INVALID', reason: 'short_text_too_long', limit: 200 })
		assert.equal(await attemptsOf(testId, student.id), 0)
		assert.equal((await sessionRow(sessionId)).submitted_at, null)

		const edge = await submitAttempt(world, student.cookie, testId, {
			sessionId,
			clientAttemptId: crypto.randomUUID(),
			answers: { [questionId]: 'а'.repeat(200) },
		})
		assert.equal(edge.status, 200, JSON.stringify(edge.body))
		assert.equal(await attemptsOf(testId, student.id), 1)
	})

	test('вопрос с типом вне question_types отвечает 422 unknown_question_type вместо 500', async () => {
		const { testId, questionId } = await prepareTest('submit-invalid-unknown-type')
		const sessionId = await startOk(testId)
		await ctx.pgPool.query("UPDATE questions SET type = 'retired_type' WHERE id = $1", [questionId])

		const reply = await submitAttempt(world, student.cookie, testId, envelope(sessionId, questionId))
		assert.equal(reply.status, 422, JSON.stringify(reply.body))
		assert.deepEqual(reply.body, { error: 'ANSWERS_INVALID', reason: 'unknown_question_type' })
		assert.equal(await attemptsOf(testId, student.id), 0)
		assert.equal((await sessionRow(sessionId)).submitted_at, null)
	})

	test('ответ на открытый вопрос в 5001 знак отвечает 422 open_text_too_long с limit 5000', async () => {
		const testId = await createAttemptTest(world, { slug: 'submit-invalid-open' })
		const questionId = await insertRawQuestion(testId, 'open')
		await assignTest(world, testId, student.id)
		const sessionId = await startOk(testId)

		const reply = await submitAttempt(world, student.cookie, testId, {
			sessionId,
			clientAttemptId: crypto.randomUUID(),
			answers: { [questionId]: 'я'.repeat(5001) },
		})
		assert.equal(reply.status, 422, JSON.stringify(reply.body))
		assert.deepEqual(reply.body, { error: 'ANSWERS_INVALID', reason: 'open_text_too_long', limit: 5000 })
		assert.equal(await attemptsOf(testId, student.id), 0)
		assert.equal((await sessionRow(sessionId)).submitted_at, null)
	})

	test('повтор сданной попытки тем же клиентом с лишним ответом возвращает сохранённую попытку', async () => {
		const { testId, questionId } = await prepareTest('submit-invalid-replay')
		const sessionId = await startOk(testId)
		const body = envelope(sessionId, questionId)
		const first = await submitAttempt(world, student.cookie, testId, body)
		assert.equal(first.status, 200, JSON.stringify(first.body))

		const replay = await submitAttempt(world, student.cookie, testId, {
			...body,
			answers: { ...body.answers, [crypto.randomUUID()]: 'a' },
		})
		assert.equal(replay.status, 200, JSON.stringify(replay.body))
		assert.deepEqual(replay.body, first.body)
		assert.equal(await attemptsOf(testId, student.id), 1)
	})
})

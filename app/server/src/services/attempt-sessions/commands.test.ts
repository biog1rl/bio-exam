import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { afterAll, beforeAll, describe, test } from 'vitest'

import {
	addQuestion,
	assignTest,
	createAttemptTest,
	insertOpenQuestion,
	saveDraft,
	seedAttemptWorld,
	seedStudent,
	shiftStartedAt,
	startSession,
	type AttemptWorld,
} from '../../test-support/attempt-world.js'
import { startAuthApp, type AuthApp } from '../../test-support/auth-app.js'

type AttemptSessionsModule = typeof import('./index.js')
type DraftAnswersModule = typeof import('./draft-answers.js')
type DeadlineModule = typeof import('./deadline.js')
type BackgroundJobsModule = typeof import('../background-jobs/index.js')

type Prepared = { testId: string; sessionId: string; userId: string; questionId: string }

let ctx: AuthApp
let world: AttemptWorld
let attemptSessions: AttemptSessionsModule
let draftAnswers: DraftAnswersModule
let deadline: DeadlineModule
let backgroundJobs: BackgroundJobsModule
let students = 0

beforeAll(async () => {
	ctx = await startAuthApp('test_attempt_commands', { env: { PG_POOL_MAX: '12' } })
	world = await seedAttemptWorld(ctx, 'commands')
	attemptSessions = await import('./index.js')
	draftAnswers = await import('./draft-answers.js')
	deadline = await import('./deadline.js')
	backgroundJobs = await import('../background-jobs/index.js')
}, 60_000)

afterAll(async () => {
	await ctx?.stop()
})

async function prepareSession(options: {
	timeLimitMinutes: number | null
	answer?: string
	startedAgo?: string
}): Promise<Prepared> {
	students += 1
	const owner = await seedStudent(world, `commands_student_${students}`)
	const testId = await createAttemptTest(world, {
		slug: `commands-${crypto.randomUUID().slice(0, 8)}`,
		timeLimitMinutes: options.timeLimitMinutes,
	})
	const questionId = await addQuestion(world, testId, 'short_answer')
	await assignTest(world, testId, owner.id)
	const started = await startSession(world, owner.cookie, testId)
	assert.equal(started.status, 200, JSON.stringify(started.body))
	const sessionId = started.body.sessionId as string
	if (options.answer !== undefined) {
		const draft = await saveDraft(world, owner.cookie, testId, sessionId, { questionId, value: options.answer })
		assert.equal(draft.status, 200, JSON.stringify(draft.body))
	}
	if (options.startedAgo) await shiftStartedAt(ctx, sessionId, options.startedAgo)
	return { testId, sessionId, userId: owner.id, questionId }
}

async function startedAtOf(sessionId: string): Promise<Date> {
	const result = await ctx.pgPool.query<{ started_at: Date }>('SELECT started_at FROM test_sessions WHERE id = $1', [
		sessionId,
	])
	const row = result.rows[0]
	assert.ok(row, `session ${sessionId} not found`)
	return row.started_at
}

function assertIso(value: unknown, label: string): void {
	assert.equal(typeof value, 'string', label)
	assert.equal(new Date(value as string).toISOString(), value, label)
}

describe('finalizeSessionByDeadline: исход open несёт сессию', () => {
	test.each([
		{ name: 'лимит 10, в пределах лимита', timeLimitMinutes: 10, startedAgo: undefined },
		{ name: 'тест без лимита, старт 10 дней назад', timeLimitMinutes: null, startedAgo: '10 days' },
	])('$name', async ({ timeLimitMinutes, startedAgo }) => {
		const prepared = await prepareSession({ timeLimitMinutes, answer: 'Митоз', startedAgo })
		const outcome = await attemptSessions.finalizeSessionByDeadline(prepared.sessionId, {
			testId: prepared.testId,
			userId: prepared.userId,
		})

		assert.equal(outcome.kind, 'open', JSON.stringify(outcome))
		const session = (outcome as { session?: Record<string, unknown> }).session
		assert.ok(session, 'open без session')
		assert.equal(session.sessionId, prepared.sessionId)
		assertIso(session.startedAt, 'startedAt')
		assertIso(session.serverNow, 'serverNow')
		assert.equal(Date.parse(session.startedAt as string), (await startedAtOf(prepared.sessionId)).getTime())
		assert.deepEqual(session.draftAnswers, { [prepared.questionId]: 'Митоз' })
		assert.equal(session.draftLastQuestionId, prepared.questionId)
	})
})

async function insertGhostQuestion(testId: string): Promise<string> {
	const result = await ctx.pgPool.query<{ id: string }>(
		`INSERT INTO questions (test_id, type, "order", points, prompt_path) VALUES ($1, 'ghost_type', 5, 1, NULL) RETURNING id`,
		[testId]
	)
	return result.rows[0]!.id
}

async function sessionStateOf(sessionId: string) {
	const result = await ctx.pgPool.query<{
		closed_at: Date | null
		close_reason: string | null
		submitted_at: Date | null
		draft_answers: unknown
	}>('SELECT closed_at, close_reason, submitted_at, draft_answers FROM test_sessions WHERE id = $1', [sessionId])
	const row = result.rows[0]
	assert.ok(row, `session ${sessionId} not found`)
	return row
}

describe('startAttemptSession', () => {
	test('R3: ошибка данных финализации на старте даёт новую сессию, прежняя закрыта expired с черновиком', async () => {
		const prepared = await prepareSession({ timeLimitMinutes: 10, answer: 'Митоз' })
		await insertGhostQuestion(prepared.testId)
		await shiftStartedAt(ctx, prepared.sessionId, '13 minutes')
		const test = await attemptSessions.findVisibleTest(prepared.testId)
		assert.ok(test)

		const outcome = await attemptSessions.startAttemptSession({ test, userId: prepared.userId })

		assert.equal(outcome.kind, 'open')
		assert.notEqual(outcome.session.sessionId, prepared.sessionId)
		const previous = await sessionStateOf(prepared.sessionId)
		assert.notEqual(previous.closed_at, null)
		assert.equal(previous.close_reason, 'expired')
		assert.equal(previous.submitted_at, null)
		assert.deepEqual(previous.draft_answers, { [prepared.questionId]: 'Митоз' })
		const attempts = await ctx.pgPool.query<{ count: number }>(
			'SELECT count(*)::int AS count FROM test_attempts WHERE session_id = $1',
			[prepared.sessionId]
		)
		assert.equal(attempts.rows[0]?.count, 0)
	})
})

async function attemptsOf(sessionId: string) {
	const result = await ctx.pgPool.query<{
		id: string
		submit_source: string
		submitted_at: Date
		upload_closes_at: Date | null
	}>('SELECT id, submit_source, submitted_at, upload_closes_at FROM test_attempts WHERE session_id = $1', [sessionId])
	return result.rows
}

describe('submitSession', () => {
	test('тест без вопросов: no_questions, попытки нет', async () => {
		const prepared = await prepareSession({ timeLimitMinutes: 10 })
		await ctx.pgPool.query('DELETE FROM questions WHERE test_id = $1', [prepared.testId])
		const test = await attemptSessions.findVisibleTest(prepared.testId)
		assert.ok(test)

		const outcome = await attemptSessions.submitSession(
			{ test, userId: prepared.userId },
			{ sessionId: prepared.sessionId, clientAttemptId: crypto.randomUUID(), answers: {} }
		)

		assert.deepEqual(outcome, { kind: 'no_questions' })
		assert.equal((await attemptsOf(prepared.sessionId)).length, 0)
	})

	test('тест с открытым вопросом: accepted, окно фото при ручной сдаче не открывается', async () => {
		const prepared = await prepareSession({ timeLimitMinutes: null })
		const openId = await insertOpenQuestion(ctx, prepared.testId, { order: 1 })
		const test = await attemptSessions.findVisibleTest(prepared.testId)
		assert.ok(test)
		assert.equal(test.photoUploadWindowMinutes, 15)

		const outcome = await attemptSessions.submitSession(
			{ test, userId: prepared.userId },
			{
				sessionId: prepared.sessionId,
				clientAttemptId: crypto.randomUUID(),
				answers: { [prepared.questionId]: 'Митоз', [openId]: 'Развёрнутый ответ' },
			}
		)

		assert.equal(outcome.kind, 'accepted', JSON.stringify(outcome))
		const [attempt] = await attemptsOf(prepared.sessionId)
		assert.ok(attempt)
		assert.equal(attempt.upload_closes_at, null)
	})

	test('гонка трёх путей финализации без HTTP: пять раундов, одна попытка deadline', async () => {
		const jobs = backgroundJobs.createBackgroundJobs({ log: { info: () => {}, warn: () => {}, error: () => {} } })

		for (let round = 0; round < 5; round++) {
			const prepared = await prepareSession({ timeLimitMinutes: 10, answer: 'Митоз', startedAgo: '20 minutes' })
			const test = await attemptSessions.findVisibleTest(prepared.testId)
			assert.ok(test)
			const owner = { testId: prepared.testId, userId: prepared.userId }

			const [finalized, submitted] = await Promise.all([
				attemptSessions.finalizeSessionByDeadline(prepared.sessionId, owner),
				attemptSessions.submitSession(
					{ test, userId: prepared.userId },
					{
						sessionId: prepared.sessionId,
						clientAttemptId: crypto.randomUUID(),
						answers: { [prepared.questionId]: 'Мейоз' },
					}
				),
				jobs.runNow(backgroundJobs.FINALIZE_DEADLINES_JOB),
			])

			const attempts = await attemptsOf(prepared.sessionId)
			assert.equal(attempts.length, 1, `round ${round}`)
			assert.equal(attempts[0]!.submit_source, 'deadline', `round ${round}`)
			const attemptId = attempts[0]!.id
			assert.deepEqual(finalized, { kind: 'finalized', attemptId }, `round ${round}`)
			assert.deepEqual(submitted, { kind: 'finalized', attemptId }, `round ${round}`)
		}
	})
})

describe('draftAnswerRule', () => {
	type QuestionRef = 'own' | 'other' | 'ghost' | 'not-a-uuid'
	const ids: Record<QuestionRef, string> = { own: '', other: '', ghost: '', 'not-a-uuid': 'not-a-uuid' }
	let testId = ''

	beforeAll(async () => {
		testId = await createAttemptTest(world, { slug: `commands-rule-${crypto.randomUUID().slice(0, 8)}` })
		ids.own = await addQuestion(world, testId, 'short_answer')
		ids.ghost = await insertGhostQuestion(testId)
		const otherTestId = await createAttemptTest(world, {
			slug: `commands-rule-other-${crypto.randomUUID().slice(0, 8)}`,
		})
		ids.other = await addQuestion(world, otherTestId, 'short_answer')
	})

	test.each<{ name: string; question: QuestionRef; raw: unknown; reason: string | null; limit?: number }>([
		{ name: 'свой короткий ответ', question: 'own', raw: 'Митоз', reason: null },
		{ name: 'свой длиннее предела', question: 'own', raw: 'М'.repeat(201), reason: 'short_text_too_long', limit: 200 },
		{ name: 'вопрос другого теста', question: 'other', raw: 'Митоз', reason: 'foreign_question' },
		{ name: 'ключ не UUID', question: 'not-a-uuid', raw: 'Митоз', reason: 'foreign_question' },
		{ name: 'вопрос неизвестного типа', question: 'ghost', raw: 'Митоз', reason: 'unknown_question_type' },
		{ name: 'значение неверной формы', question: 'own', raw: { x: 1 }, reason: 'answer_shape_invalid' },
	])('$name → $reason', async ({ question, raw, reason, limit }) => {
		const rule = await draftAnswers.draftAnswerRule(testId)
		const verdict = rule(ids[question], raw)

		if (reason === null) {
			assert.deepEqual(verdict, { ok: true, value: raw })
			return
		}
		assert.deepEqual(verdict, {
			ok: false,
			violation: { reason, questionId: ids[question], ...(limit ? { limit } : {}) },
		})
	})
})

describe('untilDraftSettles', () => {
	test.each([
		{ name: 'черновик стабилен', changes: 0, calls: 1, settled: true },
		{ name: 'черновик меняется 2 раза', changes: 2, calls: 3, settled: true },
		{ name: 'черновик меняется 3 раза', changes: 3, calls: 3, settled: false },
	])('$name: вызовов $calls', async ({ changes, calls, settled }) => {
		let call = 0
		const step = async () => {
			call += 1
			return call <= changes ? { kind: 'draft_changed' as const } : { kind: 'done' as const, call }
		}

		if (settled) {
			assert.deepEqual(await deadline.untilDraftSettles(step), { kind: 'done', call: calls })
		} else {
			await assert.rejects(deadline.untilDraftSettles(step), /draft kept changing/)
		}
		assert.equal(call, calls)
	})
})

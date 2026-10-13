import { AttemptSessionSchema, AttemptViewSchema, computeAttemptOutcome, SessionFateSchema } from '@bio-exam/exam-core'

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
	saveDraft,
	seedAttemptWorld,
	seedStudent,
	shiftStartedAt,
	startSession,
	submitAttempt,
	type AttemptWorld,
} from '../../test-support/attempt-world.js'
import { call, startAuthApp, type AuthApp } from '../../test-support/auth-app.js'

type Student = { id: string; cookie: string }

type AttemptSessionsModule = typeof import('../../services/attempt-sessions/index.js')
type BackgroundJobsModule = typeof import('../../services/background-jobs/index.js')
type SubmitStepsModule = typeof import('../../services/attempt-sessions/submit.js')
type ScoredSubmission = import('../../services/attempt-sessions/submit.js').ScoredSubmission

let ctx: AuthApp
let world: AttemptWorld
let student: Student
let attemptSessions: AttemptSessionsModule
let backgroundJobs: BackgroundJobsModule
let submitSteps: SubmitStepsModule

const STUB_SCORED: ScoredSubmission = {
	ok: true,
	facts: [],
	outcome: computeAttemptOutcome({ facts: [], finalScores: new Map(), passingScore: null }),
	passingScore: null,
	earnedPoints: 0,
	totalPoints: 0,
	scorePercentage: 0,
	passed: false,
}

beforeAll(async () => {
	ctx = await startAuthApp('test_attempt_deadline', { env: { PG_POOL_MAX: '12' } })
	world = await seedAttemptWorld(ctx, 'deadline')
	student = await seedStudent(world, 'deadline_student')
	attemptSessions = await import('../../services/attempt-sessions/index.js')
	backgroundJobs = await import('../../services/background-jobs/index.js')
	submitSteps = await import('../../services/attempt-sessions/submit.js')
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

type DeadlineSession = { testId: string; sessionId: string; owner: Student; questionIds: string[] }

type SessionState = {
	submitted_at: Date | null
	attempt_id: string | null
	closed_at: Date | null
	close_reason: string | null
	draft_answers: unknown
}

let deadlineStudents = 0

async function prepareDeadlineSession(options: {
	timeLimitMinutes: number | null
	questions?: number
	answered?: number[]
	withOpen?: boolean
	startedAgo?: string
}): Promise<DeadlineSession> {
	deadlineStudents += 1
	const owner = await seedStudent(world, `deadline_fin_${deadlineStudents}`)
	const testId = await createAttemptTest(world, {
		slug: `deadline-fin-${crypto.randomUUID().slice(0, 8)}`,
		timeLimitMinutes: options.timeLimitMinutes,
	})
	const questionIds: string[] = []
	for (let i = 0; i < (options.questions ?? 1); i++) questionIds.push(await addQuestion(world, testId, 'short_answer'))
	if (options.withOpen) await insertOpenQuestion(ctx, testId, { order: questionIds.length })
	await assignTest(world, testId, owner.id)
	const started = await startSession(world, owner.cookie, testId)
	assert.equal(started.status, 200, JSON.stringify(started.body))
	const sessionId = started.body.sessionId as string
	for (const index of options.answered ?? questionIds.map((_, i) => i)) {
		const draft = await saveDraft(world, owner.cookie, testId, sessionId, {
			questionId: questionIds[index],
			value: `Митоз ${index}`,
		})
		assert.equal(draft.status, 200, JSON.stringify(draft.body))
	}
	if (options.startedAgo) await shiftStartedAt(ctx, sessionId, options.startedAgo)
	return { testId, sessionId, owner, questionIds }
}

async function sessionStateOf(sessionId: string): Promise<SessionState> {
	const result = await ctx.pgPool.query<SessionState>(
		'SELECT submitted_at, attempt_id, closed_at, close_reason, draft_answers FROM test_sessions WHERE id = $1',
		[sessionId]
	)
	const row = result.rows[0]
	assert.ok(row, `session ${sessionId} not found`)
	return row
}

async function attemptsOfSession(sessionId: string): Promise<number> {
	const result = await ctx.pgPool.query<{ count: number }>(
		'SELECT count(*)::int AS count FROM test_attempts WHERE session_id = $1',
		[sessionId]
	)
	return result.rows[0]?.count ?? 0
}

async function attemptAnswersOf(attemptId: string): Promise<unknown> {
	const result = await ctx.pgPool.query<{ answers: unknown }>('SELECT answers FROM test_attempts WHERE id = $1', [
		attemptId,
	])
	return result.rows[0]?.answers
}

function finalizedId(outcome: { kind: string; attemptId?: string | null }): string {
	assert.equal(outcome.kind, 'finalized', JSON.stringify(outcome))
	assert.equal(typeof outcome.attemptId, 'string')
	return outcome.attemptId as string
}

async function assertClosedWithoutAttempt(prepared: DeadlineSession, draftBefore: unknown): Promise<void> {
	const state = await sessionStateOf(prepared.sessionId)
	assert.notEqual(state.closed_at, null)
	assert.equal(state.close_reason, 'expired')
	assert.equal(state.submitted_at, null)
	assert.deepEqual(state.draft_answers, draftBefore)
	assert.equal(await attemptsOfSession(prepared.sessionId), 0)
}

describe('финализация по дедлайну', () => {
	test('просроченная сессия с черновиком становится попыткой deadline с моментом сдачи в конце таймера', async () => {
		const prepared = await prepareDeadlineSession({ timeLimitMinutes: 10, startedAgo: '13 minutes' })
		const attemptId = finalizedId(await attemptSessions.finalizeSessionByDeadline(prepared.sessionId))

		const timerEndsAt = new Date((await startedAtOf(prepared.sessionId)).getTime() + 10 * MINUTE_MS)
		const row = await attemptRowOf(ctx, attemptId)
		assert.equal(row.submitSource, 'deadline')
		assert.equal(row.clientAttemptId, `deadline:${prepared.sessionId}`)
		assertSameMoment(row.submittedAt, timerEndsAt, 'attempt submitted_at')
		assert.deepEqual(await attemptAnswersOf(attemptId), { [prepared.questionIds[0]!]: 'Митоз 0' })

		const state = await sessionStateOf(prepared.sessionId)
		assertSameMoment(state.submitted_at, timerEndsAt, 'session submitted_at')
		assert.equal(state.attempt_id, attemptId)
		assert.equal(state.draft_answers, null)
		assert.equal(state.closed_at, null)
	})

	test('D-04: просроченная сессия без черновика закрывается expired без попытки', async () => {
		const prepared = await prepareDeadlineSession({ timeLimitMinutes: 10, answered: [], startedAgo: '13 minutes' })
		assert.deepEqual(await attemptSessions.finalizeSessionByDeadline(prepared.sessionId), { kind: 'expired' })
		await assertClosedWithoutAttempt(prepared, null)
	})

	test.each([
		{ startedAgo: '25 hours 12 minutes', kind: 'expired' },
		{ startedAgo: '23 hours 12 minutes', kind: 'finalized' },
	])('D-21: дедлайн плюс льгота $startedAgo назад даёт $kind', async ({ startedAgo, kind }) => {
		const prepared = await prepareDeadlineSession({ timeLimitMinutes: 10, startedAgo })
		const draftBefore = (await sessionStateOf(prepared.sessionId)).draft_answers
		const outcome = await attemptSessions.finalizeSessionByDeadline(prepared.sessionId)

		if (kind === 'expired') {
			assert.deepEqual(outcome, { kind: 'expired' })
			await assertClosedWithoutAttempt(prepared, draftBefore)
			return
		}
		const row = await attemptRowOf(ctx, finalizedId(outcome))
		assert.equal(row.submitSource, 'deadline')
		assert.equal(await attemptsOfSession(prepared.sessionId), 1)
	})

	test('ответ на удалённый вопрос выбрасывается: только он — expired, вместе с живым — попытка по живому', async () => {
		const onlyDeleted = await prepareDeadlineSession({ timeLimitMinutes: 10, questions: 2, answered: [1] })
		await ctx.pgPool.query('DELETE FROM questions WHERE id = $1', [onlyDeleted.questionIds[1]])
		await shiftStartedAt(ctx, onlyDeleted.sessionId, '13 minutes')
		const draftBefore = (await sessionStateOf(onlyDeleted.sessionId)).draft_answers
		assert.deepEqual(await attemptSessions.finalizeSessionByDeadline(onlyDeleted.sessionId), { kind: 'expired' })
		await assertClosedWithoutAttempt(onlyDeleted, draftBefore)

		const mixed = await prepareDeadlineSession({ timeLimitMinutes: 10, questions: 2 })
		await ctx.pgPool.query('DELETE FROM questions WHERE id = $1', [mixed.questionIds[1]])
		await shiftStartedAt(ctx, mixed.sessionId, '13 minutes')
		const attemptId = finalizedId(await attemptSessions.finalizeSessionByDeadline(mixed.sessionId))
		assert.deepEqual(await attemptAnswersOf(attemptId), { [mixed.questionIds[0]!]: 'Митоз 0' })
	})

	test('ошибка данных при оценке закрывает сессию expired, черновик остаётся в строке', async () => {
		const prepared = await prepareDeadlineSession({ timeLimitMinutes: 10, startedAgo: '13 minutes' })
		await ctx.pgPool.query(
			`INSERT INTO questions (test_id, type, "order", points, prompt_path) VALUES ($1, 'ghost_type', 5, 1, NULL)`,
			[prepared.testId]
		)
		const draftBefore = (await sessionStateOf(prepared.sessionId)).draft_answers
		assert.deepEqual(await attemptSessions.finalizeSessionByDeadline(prepared.sessionId), { kind: 'expired' })
		await assertClosedWithoutAttempt(prepared, draftBefore)
	})

	test('повторный вызов возвращает ту же попытку, вторая не создаётся', async () => {
		const prepared = await prepareDeadlineSession({ timeLimitMinutes: 10, startedAgo: '13 minutes' })
		const first = finalizedId(await attemptSessions.finalizeSessionByDeadline(prepared.sessionId))
		const second = await attemptSessions.finalizeSessionByDeadline(prepared.sessionId)
		assert.deepEqual(second, { kind: 'finalized', attemptId: first })
		assert.equal(await attemptsOfSession(prepared.sessionId), 1)
	})

	test('чужой владелец получает not_found, сессия не меняется', async () => {
		const prepared = await prepareDeadlineSession({ timeLimitMinutes: 10, startedAgo: '13 minutes' })
		const before = await sessionStateOf(prepared.sessionId)
		const outcome = await attemptSessions.finalizeSessionByDeadline(prepared.sessionId, {
			testId: prepared.testId,
			userId: student.id,
		})
		assert.deepEqual(outcome, { kind: 'not_found' })
		assert.deepEqual(await sessionStateOf(prepared.sessionId), before)
		assert.equal(await attemptsOfSession(prepared.sessionId), 0)
	})

	test.each([
		{ name: 'тест без лимита, старт 10 дней назад', timeLimitMinutes: null, startedAgo: '10 days' },
		{ name: 'лимит 10, старт 11 минут назад (в льготе)', timeLimitMinutes: 10, startedAgo: '11 minutes' },
	])('$name: open, база не меняется', async ({ timeLimitMinutes, startedAgo }) => {
		const prepared = await prepareDeadlineSession({ timeLimitMinutes, startedAgo })
		const before = await sessionStateOf(prepared.sessionId)
		assert.equal((await attemptSessions.finalizeSessionByDeadline(prepared.sessionId)).kind, 'open')
		assert.deepEqual(await sessionStateOf(prepared.sessionId), before)
		assert.equal(await attemptsOfSession(prepared.sessionId), 0)
	})

	test('сданная вручную сессия даёт submitted с клиентской попыткой, закрытая superseded — superseded', async () => {
		const submitted = await prepareDeadlineSession({ timeLimitMinutes: 10 })
		const reply = await submitAttempt(world, submitted.owner.cookie, submitted.testId, {
			sessionId: submitted.sessionId,
			clientAttemptId: crypto.randomUUID(),
			answers: { [submitted.questionIds[0]!]: 'Митоз' },
		})
		assert.equal(reply.status, 200, JSON.stringify(reply.body))
		await shiftStartedAt(ctx, submitted.sessionId, '13 minutes')
		assert.deepEqual(await attemptSessions.finalizeSessionByDeadline(submitted.sessionId), {
			kind: 'submitted',
			attemptId: reply.body.attemptId,
		})
		assert.equal(await attemptsOfSession(submitted.sessionId), 1)

		const superseded = await prepareDeadlineSession({ timeLimitMinutes: 10, startedAgo: '13 minutes' })
		await ctx.pgPool.query(`UPDATE test_sessions SET closed_at = now(), close_reason = 'superseded' WHERE id = $1`, [
			superseded.sessionId,
		])
		assert.deepEqual(await attemptSessions.finalizeSessionByDeadline(superseded.sessionId), { kind: 'superseded' })
		assert.equal(await attemptsOfSession(superseded.sessionId), 0)
	})

	test('окно для фото серверной попытки идёт от конца таймера', async () => {
		const prepared = await prepareDeadlineSession({ timeLimitMinutes: 10, withOpen: true, startedAgo: '13 minutes' })
		const attemptId = finalizedId(await attemptSessions.finalizeSessionByDeadline(prepared.sessionId))
		const row = await attemptRowOf(ctx, attemptId)
		const startedAt = (await startedAtOf(prepared.sessionId)).getTime()
		assertSameMoment(row.uploadClosesAt, new Date(startedAt + 25 * MINUTE_MS), 'upload_closes_at')
	})

	test('submitAttempt с устаревшим expectedDraft возвращает draft_changed и ничего не пишет', async () => {
		const prepared = await prepareDeadlineSession({ timeLimitMinutes: 10, startedAgo: '13 minutes' })
		const outcome = await submitSteps.submitAttempt({
			owner: { testId: prepared.testId, userId: prepared.owner.id },
			sessionId: prepared.sessionId,
			clientAttemptId: `deadline:${prepared.sessionId}`,
			answers: {},
			scored: STUB_SCORED,
			test: { timeLimitMinutes: 10, photoUploadWindowMinutes: 15 },
			source: 'deadline',
			expectedDraft: { [prepared.questionIds[0]!]: 'Мейоз' },
		})
		assert.deepEqual(outcome, { kind: 'draft_changed' })
		assert.equal(await attemptsOfSession(prepared.sessionId), 0)
		const state = await sessionStateOf(prepared.sessionId)
		assert.equal(state.submitted_at, null)
		assert.equal(state.closed_at, null)
	})

	test('пять параллельных вызовов дают одну попытку с одним attemptId', async () => {
		const prepared = await prepareDeadlineSession({ timeLimitMinutes: 10, startedAgo: '13 minutes' })
		const outcomes = await Promise.all(
			Array.from({ length: 5 }, () => attemptSessions.finalizeSessionByDeadline(prepared.sessionId))
		)
		const ids = new Set(outcomes.map(finalizedId))
		assert.equal(ids.size, 1)
		assert.equal(await attemptsOfSession(prepared.sessionId), 1)
	})
})

type AttemptBody = { attemptId: string; results: { questionId: string; userAnswer: unknown }[] }

function userAnswerOf(attempt: AttemptBody, questionId: string): unknown {
	return attempt.results.find((result) => result.questionId === questionId)?.userAnswer
}

function assertIsoNow(value: unknown, label: string): void {
	assert.equal(typeof value, 'string', label)
	assert.ok(!Number.isNaN(Date.parse(value as string)), label)
}

describe('ленивая финализация на /submit', () => {
	test('сдача после льготы с черновиком: 409 с видом попытки deadline по сохранённому черновику', async () => {
		const prepared = await prepareDeadlineSession({ timeLimitMinutes: 10, answered: [] })
		const questionId = prepared.questionIds[0]!
		const draft = await saveDraft(world, prepared.owner.cookie, prepared.testId, prepared.sessionId, {
			questionId,
			value: 'черновик',
		})
		assert.equal(draft.status, 200, JSON.stringify(draft.body))
		await shiftStartedAt(ctx, prepared.sessionId, '13 minutes')

		const reply = await submitAttempt(world, prepared.owner.cookie, prepared.testId, {
			sessionId: prepared.sessionId,
			clientAttemptId: crypto.randomUUID(),
			answers: { [questionId]: 'тело' },
		})
		assert.equal(reply.status, 409, JSON.stringify(reply.body))
		assert.equal(reply.body.error, 'ATTEMPT_ALREADY_SUBMITTED')
		assert.equal(reply.body.submitSource, 'deadline')
		assert.equal(await attemptsOfSession(prepared.sessionId), 1)
		assert.equal(reply.body.attemptId, (await sessionStateOf(prepared.sessionId)).attempt_id)
		assert.equal(AttemptViewSchema.safeParse(reply.body.attempt).success, true, JSON.stringify(reply.body.attempt))
		assert.equal(userAnswerOf(reply.body.attempt as AttemptBody, questionId), 'черновик')
		assert.equal(reply.body.uploadClosesAt, null)
		assertIsoNow(reply.body.serverNow, 'serverNow')
	})
})

async function startAgain(prepared: DeadlineSession): Promise<string> {
	const reply = await startSession(world, prepared.owner.cookie, prepared.testId)
	assert.equal(reply.status, 200, JSON.stringify(reply.body))
	const sessionId = reply.body.sessionId as string
	assert.notEqual(sessionId, prepared.sessionId)
	assert.equal((await sessionStateOf(sessionId)).closed_at, null)
	return sessionId
}

describe('ленивая финализация на /start и PATCH', () => {
	test('/start за льготой с пустым черновиком закрывает сессию expired без попытки и открывает новую', async () => {
		const prepared = await prepareDeadlineSession({ timeLimitMinutes: 10, answered: [], startedAgo: '13 minutes' })
		await startAgain(prepared)
		await assertClosedWithoutAttempt(prepared, null)
	})

	test('PATCH в пределах льготы после конца таймера отвечает 200 и сохраняет ответ', async () => {
		const prepared = await prepareDeadlineSession({ timeLimitMinutes: 10, answered: [], startedAgo: '11 minutes' })
		const questionId = prepared.questionIds[0]!
		const reply = await saveDraft(world, prepared.owner.cookie, prepared.testId, prepared.sessionId, {
			questionId,
			value: 'Мейоз',
		})
		assert.equal(reply.status, 200, JSON.stringify(reply.body))
		const state = await sessionStateOf(prepared.sessionId)
		assert.deepEqual(state.draft_answers, { [questionId]: 'Мейоз' })
		assert.equal(state.closed_at, null)
		assert.equal(state.submitted_at, null)
	})

	test('тест без лимита, старт 10 дней назад: PATCH 200, /start отдаёт ту же сессию, попыток нет', async () => {
		const prepared = await prepareDeadlineSession({ timeLimitMinutes: null, startedAgo: '10 days' })
		const questionId = prepared.questionIds[0]!
		const reply = await saveDraft(world, prepared.owner.cookie, prepared.testId, prepared.sessionId, {
			questionId,
			value: 'Мейоз',
		})
		assert.equal(reply.status, 200, JSON.stringify(reply.body))
		const again = await startSession(world, prepared.owner.cookie, prepared.testId)
		assert.equal(again.status, 200, JSON.stringify(again.body))
		assert.equal(again.body.sessionId, prepared.sessionId)
		assert.deepEqual(again.body.draftAnswers, { [questionId]: 'Мейоз' })
		assert.equal(await attemptsOfSession(prepared.sessionId), 0)
	})

	test('D-21: давняя сессия (25 hours 12 minutes) на /start закрывается expired без попытки, /submit в неё — 422', async () => {
		const prepared = await prepareDeadlineSession({ timeLimitMinutes: 10, startedAgo: '25 hours 12 minutes' })
		const draftBefore = (await sessionStateOf(prepared.sessionId)).draft_answers
		await startAgain(prepared)
		await assertClosedWithoutAttempt(prepared, draftBefore)

		const reply = await submitAttempt(world, prepared.owner.cookie, prepared.testId, {
			sessionId: prepared.sessionId,
			clientAttemptId: crypto.randomUUID(),
			answers: { [prepared.questionIds[0]!]: 'Митоз' },
		})
		assert.equal(reply.status, 422, JSON.stringify(reply.body))
		assert.deepEqual(reply.body, { error: 'TIME_EXPIRED' })
		assert.equal(await attemptsOfSession(prepared.sessionId), 0)
	})

	test('R3: ошибка данных финализации на /start не даёт 500, прежняя сессия закрыта expired с черновиком', async () => {
		const prepared = await prepareDeadlineSession({ timeLimitMinutes: 10 })
		await ctx.pgPool.query(
			`INSERT INTO questions (test_id, type, "order", points, prompt_path) VALUES ($1, 'mystery', 5, 1, NULL)`,
			[prepared.testId]
		)
		await shiftStartedAt(ctx, prepared.sessionId, '13 minutes')
		const draftBefore = (await sessionStateOf(prepared.sessionId)).draft_answers
		await startAgain(prepared)
		await assertClosedWithoutAttempt(prepared, draftBefore)
	})

	test.each([
		{
			name: 'черновик, 13 минут — новая сессия, у прежней попытка deadline',
			startedAgo: '13 minutes',
			answered: [0],
			finalized: true,
		},
		{
			name: 'черновик, 25 hours 12 minutes — новая сессия, прежняя expired с черновиком',
			startedAgo: '25 hours 12 minutes',
			answered: [0],
			finalized: false,
		},
		{
			name: 'пустой черновик, 13 минут — новая сессия, прежняя expired',
			startedAgo: '13 minutes',
			answered: [],
			finalized: false,
		},
	])('startAttemptSession на просроченной сессии: $name', async ({ startedAgo, answered, finalized }) => {
		const prepared = await prepareDeadlineSession({ timeLimitMinutes: 10, answered, startedAgo })
		const before = await sessionStateOf(prepared.sessionId)
		const test = await attemptSessions.findVisibleTest(prepared.testId)
		assert.ok(test)

		const outcome = await attemptSessions.startAttemptSession({ test, userId: prepared.owner.id })
		assert.equal(outcome.kind, 'open')
		assert.notEqual(outcome.session.sessionId, prepared.sessionId)
		assert.equal((await sessionStateOf(outcome.session.sessionId)).closed_at, null)

		if (finalized) {
			const state = await sessionStateOf(prepared.sessionId)
			assert.ok(state.attempt_id)
			assert.equal((await attemptRowOf(ctx, state.attempt_id)).submitSource, 'deadline')
			assert.equal(await attemptsOfSession(prepared.sessionId), 1)
			return
		}
		await assertClosedWithoutAttempt(prepared, before.draft_answers)
	})
})

describe('тела ответов 200 и 409', () => {
	test('PATCH 200 несёт serverNow, /submit 200 — вид попытки client без serverNow', async () => {
		const prepared = await prepareDeadlineSession({ timeLimitMinutes: 10, answered: [] })
		const questionId = prepared.questionIds[0]!
		const draft = await saveDraft(world, prepared.owner.cookie, prepared.testId, prepared.sessionId, {
			questionId,
			value: 'Митоз',
		})
		assert.equal(draft.status, 200, JSON.stringify(draft.body))
		assert.equal(draft.body.ok, true)
		assertIsoNow(draft.body.serverNow, 'PATCH serverNow')
		assert.ok(Math.abs((await databaseNowMs()) - Date.parse(draft.body.serverNow as string)) <= 5000)

		const reply = await submitAttempt(world, prepared.owner.cookie, prepared.testId, {
			sessionId: prepared.sessionId,
			clientAttemptId: crypto.randomUUID(),
			answers: { [questionId]: 'Митоз' },
		})
		assert.equal(reply.status, 200, JSON.stringify(reply.body))
		assert.equal(AttemptViewSchema.safeParse(reply.body).success, true, JSON.stringify(reply.body))
		assert.equal(reply.body.submitSource, 'client')
		assert.equal('serverNow' in reply.body, false)
	})

	test('сдача из другой вкладки после ручной сдачи получает прежнее тело 409', async () => {
		const prepared = await prepareDeadlineSession({ timeLimitMinutes: 10 })
		const answers = { [prepared.questionIds[0]!]: 'Митоз' }
		const first = await submitAttempt(world, prepared.owner.cookie, prepared.testId, {
			sessionId: prepared.sessionId,
			clientAttemptId: crypto.randomUUID(),
			answers,
		})
		assert.equal(first.status, 200, JSON.stringify(first.body))

		const second = await submitAttempt(world, prepared.owner.cookie, prepared.testId, {
			sessionId: prepared.sessionId,
			clientAttemptId: crypto.randomUUID(),
			answers,
		})
		assert.equal(second.status, 409)
		assert.deepEqual(second.body, { error: 'ATTEMPT_ALREADY_SUBMITTED', attemptId: first.body.attemptId })
	})

	test('повторная сдача после серверной финализации новым clientAttemptId получает то же тело deadline', async () => {
		const prepared = await prepareDeadlineSession({ timeLimitMinutes: 10, startedAgo: '13 minutes' })
		const attemptId = finalizedId(await attemptSessions.finalizeSessionByDeadline(prepared.sessionId))

		for (const round of ['first', 'second']) {
			const reply = await submitAttempt(world, prepared.owner.cookie, prepared.testId, {
				sessionId: prepared.sessionId,
				clientAttemptId: crypto.randomUUID(),
				answers: { [prepared.questionIds[0]!]: 'тело' },
			})
			assert.equal(reply.status, 409, `${round}: ${JSON.stringify(reply.body)}`)
			assert.equal(reply.body.error, 'ATTEMPT_ALREADY_SUBMITTED', round)
			assert.equal(reply.body.attemptId, attemptId, round)
			assert.equal(reply.body.submitSource, 'deadline', round)
			assert.equal((reply.body.attempt as AttemptBody).attemptId, attemptId, round)
			assertIsoNow(reply.body.serverNow, round)
		}
		assert.equal(await attemptsOfSession(prepared.sessionId), 1)
	})

	test('клиентская сдача после финализации той же сессии получает finalized с попыткой deadline', async () => {
		const prepared = await prepareDeadlineSession({ timeLimitMinutes: 10, startedAgo: '13 minutes' })
		const attemptId = finalizedId(await attemptSessions.finalizeSessionByDeadline(prepared.sessionId))
		const outcome = await submitSteps.submitAttempt({
			owner: { testId: prepared.testId, userId: prepared.owner.id },
			sessionId: prepared.sessionId,
			clientAttemptId: crypto.randomUUID(),
			answers: {},
			scored: STUB_SCORED,
			test: { timeLimitMinutes: 10, photoUploadWindowMinutes: 15 },
			source: 'client',
		})
		assert.deepEqual(outcome, { kind: 'finalized', attemptId })
		assert.equal(await attemptsOfSession(prepared.sessionId), 1)
	})
})

function readFate(cookie: string, testId: string, sessionId: string) {
	return call(ctx, 'GET', `/api/tests/public/tests/${testId}/sessions/${sessionId}`, { cookies: cookie })
}

async function fateOk(prepared: DeadlineSession): Promise<Record<string, unknown>> {
	const reply = await readFate(prepared.owner.cookie, prepared.testId, prepared.sessionId)
	assert.equal(reply.status, 200, JSON.stringify(reply.body))
	assert.equal(SessionFateSchema.safeParse(reply.body).success, true, JSON.stringify(reply.body))
	assertIsoNow(reply.body.serverNow, 'serverNow')
	return reply.body
}

describe('судьба сессии GET /sessions/:sessionId', () => {
	test('просроченная сессия с черновиком финализируется лениво: submitted deadline с видом попытки', async () => {
		const prepared = await prepareDeadlineSession({ timeLimitMinutes: 10, startedAgo: '13 minutes' })
		const body = await fateOk(prepared)

		assert.equal(body.state, 'submitted')
		assert.equal(body.submitSource, 'deadline')
		assert.equal(await attemptsOfSession(prepared.sessionId), 1)
		assert.equal(body.attemptId, (await sessionStateOf(prepared.sessionId)).attempt_id)
		const attempt = body.attempt as AttemptBody
		assert.equal(attempt.attemptId, body.attemptId)
		assert.equal(userAnswerOf(attempt, prepared.questionIds[0]!), 'Митоз 0')
		assert.equal(body.uploadClosesAt, null)
	})

	test.each([
		{ name: 'лимит 10, в пределах лимита', timeLimitMinutes: 10, startedAgo: undefined },
		{ name: 'тест без лимита, старт 10 дней назад', timeLimitMinutes: null, startedAgo: '10 days' },
	])('$name: open, база не меняется', async ({ timeLimitMinutes, startedAgo }) => {
		const prepared = await prepareDeadlineSession({ timeLimitMinutes, startedAgo })
		const before = await sessionStateOf(prepared.sessionId)
		const body = await fateOk(prepared)

		assert.equal(body.state, 'open')
		assert.equal(body.sessionId, prepared.sessionId)
		assert.equal(Date.parse(body.startedAt as string), (await startedAtOf(prepared.sessionId)).getTime())
		assert.deepEqual(await sessionStateOf(prepared.sessionId), before)
		assert.equal(await attemptsOfSession(prepared.sessionId), 0)
	})

	test('D-04: просроченная сессия с пустым черновиком — expired, попытки нет', async () => {
		const prepared = await prepareDeadlineSession({ timeLimitMinutes: 10, answered: [], startedAgo: '13 minutes' })
		const body = await fateOk(prepared)
		assert.equal(body.state, 'expired')
		await assertClosedWithoutAttempt(prepared, null)
	})

	test.each([
		{ name: 'D-21: дедлайн плюс льгота больше 24 ч назад', startedAgo: '25 hours 12 minutes', brokenData: false },
		{ name: 'R3: ошибка данных финализации', startedAgo: '13 minutes', brokenData: true },
	])('$name — expired, черновик в строке, попытки нет', async ({ startedAgo, brokenData }) => {
		const prepared = await prepareDeadlineSession({ timeLimitMinutes: 10, startedAgo })
		if (brokenData) {
			await ctx.pgPool.query(
				`INSERT INTO questions (test_id, type, "order", points, prompt_path) VALUES ($1, 'phantom_type', 5, 1, NULL)`,
				[prepared.testId]
			)
		}
		const draftBefore = (await sessionStateOf(prepared.sessionId)).draft_answers
		const body = await fateOk(prepared)
		assert.equal(body.state, 'expired')
		await assertClosedWithoutAttempt(prepared, draftBefore)
	})

	test('сданная вручную сессия — submitted client с той же попыткой', async () => {
		const prepared = await prepareDeadlineSession({ timeLimitMinutes: 10 })
		const reply = await submitAttempt(world, prepared.owner.cookie, prepared.testId, {
			sessionId: prepared.sessionId,
			clientAttemptId: crypto.randomUUID(),
			answers: { [prepared.questionIds[0]!]: 'Митоз' },
		})
		assert.equal(reply.status, 200, JSON.stringify(reply.body))

		const body = await fateOk(prepared)
		assert.equal(body.state, 'submitted')
		assert.equal(body.submitSource, 'client')
		assert.equal(body.attemptId, reply.body.attemptId)
		assert.equal((body.attempt as AttemptBody).attemptId, reply.body.attemptId)
	})

	test('тест с открытым вопросом: uploadClosesAt — конец таймера плюс 15 минут', async () => {
		const prepared = await prepareDeadlineSession({ timeLimitMinutes: 10, withOpen: true, startedAgo: '13 minutes' })
		const body = await fateOk(prepared)
		assert.equal(body.state, 'submitted')
		const startedAt = (await startedAtOf(prepared.sessionId)).getTime()
		assertSameMoment(new Date(body.uploadClosesAt as string), new Date(startedAt + 25 * MINUTE_MS), 'uploadClosesAt')
	})

	test('три параллельных чтения и повторное чтение дают одну попытку с одним attemptId', async () => {
		const prepared = await prepareDeadlineSession({ timeLimitMinutes: 10, startedAgo: '13 minutes' })
		const bodies = await Promise.all(Array.from({ length: 3 }, () => fateOk(prepared)))
		const ids = new Set(bodies.map((body) => body.attemptId))
		assert.equal(ids.size, 1)
		assert.equal(bodies[0]!.state, 'submitted')

		const again = await fateOk(prepared)
		assert.equal(again.attemptId, bodies[0]!.attemptId)
		assert.equal(again.submitSource, 'deadline')
		assert.equal(await attemptsOfSession(prepared.sessionId), 1)
	})

	test('чужая, несуществующая и закрытая superseded сессия — одинаковый 404, чужая не финализируется', async () => {
		const foreign = await prepareDeadlineSession({ timeLimitMinutes: 10, startedAgo: '13 minutes' })
		await assignTest(world, foreign.testId, student.id)
		const before = await sessionStateOf(foreign.sessionId)

		const foreignReply = await readFate(student.cookie, foreign.testId, foreign.sessionId)
		const missingReply = await readFate(student.cookie, foreign.testId, crypto.randomUUID())
		assert.equal(foreignReply.status, 404)
		assert.equal(missingReply.status, 404)
		assert.deepEqual(foreignReply.body, { error: 'Session not found' })
		assert.deepEqual(foreignReply.body, missingReply.body)
		assert.deepEqual(await sessionStateOf(foreign.sessionId), before)
		assert.equal(await attemptsOfSession(foreign.sessionId), 0)

		const superseded = await prepareDeadlineSession({ timeLimitMinutes: 10 })
		await ctx.pgPool.query(`UPDATE test_sessions SET closed_at = now(), close_reason = 'superseded' WHERE id = $1`, [
			superseded.sessionId,
		])
		const supersededReply = await readFate(superseded.owner.cookie, superseded.testId, superseded.sessionId)
		assert.equal(supersededReply.status, 404)
		assert.deepEqual(supersededReply.body, missingReply.body)
	})

	test('ученик без назначения получает 403, sessionId не UUID — 400', async () => {
		const prepared = await prepareDeadlineSession({ timeLimitMinutes: 10, startedAgo: '13 minutes' })
		const outsider = await seedStudent(world, 'deadline_fate_outsider')

		const denied = await readFate(outsider.cookie, prepared.testId, prepared.sessionId)
		assert.equal(denied.status, 403, JSON.stringify(denied.body))
		assert.equal(await attemptsOfSession(prepared.sessionId), 0)

		const invalid = await readFate(prepared.owner.cookie, prepared.testId, 'not-a-uuid')
		assert.equal(invalid.status, 400, JSON.stringify(invalid.body))
	})
})

describe('гонка трёх путей финализации', () => {
	test('GET судьбы, runNow finalize-deadlines и POST /submit в пяти раундах дают одну попытку deadline', async () => {
		const jobs = backgroundJobs.createBackgroundJobs({ log: { info: () => {}, warn: () => {}, error: () => {} } })

		for (let round = 0; round < 5; round++) {
			const prepared = await prepareDeadlineSession({ timeLimitMinutes: 10, startedAgo: '20 minutes' })
			const [fate, report, submitted] = await Promise.all([
				readFate(prepared.owner.cookie, prepared.testId, prepared.sessionId),
				jobs.runNow(backgroundJobs.FINALIZE_DEADLINES_JOB),
				submitAttempt(world, prepared.owner.cookie, prepared.testId, {
					sessionId: prepared.sessionId,
					clientAttemptId: crypto.randomUUID(),
					answers: { [prepared.questionIds[0]!]: 'тело' },
				}),
			])

			assert.equal(await attemptsOfSession(prepared.sessionId), 1, `round ${round}`)
			const attemptId = (await sessionStateOf(prepared.sessionId)).attempt_id
			assert.ok(attemptId, `round ${round}`)
			assert.equal((await attemptRowOf(ctx, attemptId)).submitSource, 'deadline', `round ${round}`)
			assert.equal('skipped' in report, false, `round ${round}: ${JSON.stringify(report)}`)

			assert.equal(fate.status, 200, `round ${round}: ${JSON.stringify(fate.body)}`)
			assert.equal(fate.body.state, 'submitted', `round ${round}`)
			assert.equal(fate.body.attemptId, attemptId, `round ${round}`)

			assert.equal(submitted.status, 409, `round ${round}: ${JSON.stringify(submitted.body)}`)
			assert.equal(submitted.body.attemptId, attemptId, `round ${round}`)
			assert.equal(submitted.body.submitSource, 'deadline', `round ${round}`)
		}
	})
})

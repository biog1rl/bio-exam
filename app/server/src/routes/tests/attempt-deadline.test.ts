import { AttemptSessionSchema, computeAttemptOutcome } from '@bio-exam/exam-core'

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
import { startAuthApp, type AuthApp } from '../../test-support/auth-app.js'

type Student = { id: string; cookie: string }

type AttemptSessionsModule = typeof import('../../services/attempt-sessions/index.js')

let ctx: AuthApp
let world: AttemptWorld
let student: Student
let attemptSessions: AttemptSessionsModule

beforeAll(async () => {
	ctx = await startAuthApp('test_attempt_deadline', { env: { PG_POOL_MAX: '12' } })
	world = await seedAttemptWorld(ctx, 'deadline')
	student = await seedStudent(world, 'deadline_student')
	attemptSessions = await import('../../services/attempt-sessions/index.js')
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
		assert.deepEqual(await attemptSessions.finalizeSessionByDeadline(prepared.sessionId), { kind: 'open' })
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
		const outcome = await attemptSessions.submitAttempt({
			testId: prepared.testId,
			userId: prepared.owner.id,
			testSessionId: prepared.sessionId,
			clientAttemptId: `deadline:${prepared.sessionId}`,
			answers: {},
			scored: {
				results: [],
				resultsVersion: 2,
				earnedPoints: 0,
				totalPoints: 0,
				scorePercentage: 0,
				passed: false,
				outcome: computeAttemptOutcome({ facts: [], finalScores: new Map(), passingScore: null }),
				passingScore: null,
			},
			source: 'deadline',
			timeLimitMinutes: 10,
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

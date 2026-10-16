import { computeAttemptOutcome } from '@bio-exam/exam-core'

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { afterAll, beforeAll, describe, test } from 'vitest'

import {
	addQuestion,
	assignTest,
	createAttemptTest,
	saveDraft,
	seedAttemptWorld,
	seedStudent,
	shiftStartedAt,
	startSession,
	type AttemptWorld,
} from '../../test-support/attempt-world.js'
import { startAuthApp, type AuthApp } from '../../test-support/auth-app.js'

type BackgroundJobsModule = typeof import('./index.js')
type AttemptSessionsModule = typeof import('../attempt-sessions/index.js')
type Job = import('./index.js').Job
type SubmitStepsModule = typeof import('../attempt-sessions/submit.js')
type ScoredSubmission = import('../attempt-sessions/submit.js').ScoredSubmission

type Prepared = { testId: string; sessionId: string; userId: string }

type SessionRow = {
	submitted_at: Date | null
	attempt_id: string | null
	closed_at: Date | null
	close_reason: string | null
	draft_answers: unknown
}

type LoggedCall = { data: Record<string, unknown>; message: string }

let ctx: AuthApp
let world: AttemptWorld
let jobsModule: BackgroundJobsModule
let attemptSessions: AttemptSessionsModule
let submitSteps: SubmitStepsModule
let students = 0

const quietLog = { info: () => {}, error: () => {}, warn: () => {} }

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
	ctx = await startAuthApp('test_background_jobs', { env: { PG_POOL_MAX: '12' } })
	world = await seedAttemptWorld(ctx, 'jobs')
	jobsModule = await import('./index.js')
	attemptSessions = await import('../attempt-sessions/index.js')
	submitSteps = await import('../attempt-sessions/submit.js')
}, 60_000)

afterAll(async () => {
	await ctx?.stop()
})

function deferred(): { promise: Promise<void>; resolve: () => void } {
	let resolve: () => void = () => {}
	const promise = new Promise<void>((done) => {
		resolve = done
	})
	return { promise, resolve }
}

async function prepareSession(startedAgo?: string): Promise<Prepared> {
	students += 1
	const owner = await seedStudent(world, `jobs_student_${students}`)
	const testId = await createAttemptTest(world, {
		slug: `jobs-${crypto.randomUUID().slice(0, 8)}`,
		timeLimitMinutes: 10,
	})
	const questionId = await addQuestion(world, testId, 'short_answer')
	await assignTest(world, testId, owner.id)
	const started = await startSession(world, owner.cookie, testId)
	assert.equal(started.status, 200, JSON.stringify(started.body))
	const sessionId = started.body.sessionId as string
	const draft = await saveDraft(world, owner.cookie, testId, sessionId, { questionId, value: 'Митоз' })
	assert.equal(draft.status, 200, JSON.stringify(draft.body))
	if (startedAgo) await shiftStartedAt(ctx, sessionId, startedAgo)
	return { testId, sessionId, userId: owner.id }
}

async function closeOtherOpenSessions(): Promise<void> {
	await ctx.pgPool.query(
		`UPDATE test_sessions SET closed_at = now(), close_reason = 'superseded' WHERE submitted_at IS NULL AND closed_at IS NULL`
	)
}

async function sessionRowOf(sessionId: string): Promise<SessionRow> {
	const result = await ctx.pgPool.query<SessionRow>(
		'SELECT submitted_at, attempt_id, closed_at, close_reason, draft_answers FROM test_sessions WHERE id = $1',
		[sessionId]
	)
	const row = result.rows[0]
	assert.ok(row, `session ${sessionId} not found`)
	return row
}

async function attemptSourcesOf(sessionIds: string[]): Promise<string[]> {
	const result = await ctx.pgPool.query<{ submit_source: string }>(
		'SELECT submit_source FROM test_attempts WHERE session_id = ANY($1::uuid[])',
		[sessionIds]
	)
	return result.rows.map((row) => row.submit_source)
}

function emptyReport(overrides: Record<string, number>): Record<string, number> {
	return { stale: 0, due: 0, finalized: 0, expired: 0, other: 0, failed: 0, timeBounded: 0, ...overrides }
}

function recordingLog() {
	const errors: LoggedCall[] = []
	return {
		errors,
		log: {
			info: () => {},
			warn: () => {},
			error: (data: Record<string, unknown>, message: string) => {
				errors.push({ data, message })
			},
		},
	}
}

function fakeTimers() {
	const calls: { fn: () => void; ms: number; handle: number }[] = []
	const cleared: unknown[] = []
	return {
		calls,
		cleared,
		setTimer: (fn: () => void, ms: number) => {
			const handle = calls.length + 1
			calls.push({ fn, ms, handle })
			return handle
		},
		clearTimer: (handle: unknown) => {
			cleared.push(handle)
		},
		async waitForCalls(count: number): Promise<void> {
			const deadline = Date.now() + 5000
			while (calls.length < count) {
				if (Date.now() > deadline) throw new Error(`timer was not set: ${calls.length} < ${count}`)
				await new Promise((resolve) => setTimeout(resolve, 5))
			}
		},
	}
}

describe('finalize-deadlines по запросу', () => {
	test('просроченная сессия с черновиком становится попыткой deadline, повторный прогон её не находит', async () => {
		await closeOtherOpenSessions()
		const prepared = await prepareSession('20 minutes')
		const jobs = jobsModule.createBackgroundJobs({ log: quietLog })

		const first = await jobs.runNow(jobsModule.FINALIZE_DEADLINES_JOB)
		assert.deepEqual(first, emptyReport({ due: 1, finalized: 1 }))
		assert.deepEqual(await attemptSourcesOf([prepared.sessionId]), ['deadline'])
		assert.notEqual((await sessionRowOf(prepared.sessionId)).submitted_at, null)

		const second = await jobs.runNow(jobsModule.FINALIZE_DEADLINES_JOB)
		assert.deepEqual(second, emptyReport({}))
		assert.deepEqual(await attemptSourcesOf([prepared.sessionId]), ['deadline'])
	})
})

describe('замок задачи', () => {
	test('второй исполнитель получает skipped, пока первый держит замок, и выполняет задачу после', async () => {
		const name = `test-lock-${crypto.randomUUID()}`
		const started = deferred()
		const release = deferred()
		let runs = 0
		const job: Job = {
			name,
			intervalMs: null,
			async runOnce() {
				runs += 1
				started.resolve()
				await release.promise
				return { runs }
			},
		}
		const first = jobsModule.createJobRunner({ log: quietLog })
		const second = jobsModule.createJobRunner({ log: quietLog })
		first.register(job)
		second.register(job)

		const firstRun = first.runNow(name)
		await started.promise
		assert.deepEqual(await second.runNow(name), { skipped: 'locked' })
		release.resolve()
		assert.deepEqual(await firstRun, { runs: 1 })
		assert.deepEqual(await second.runNow(name), { runs: 2 })
		await assert.rejects(second.runNow('missing-job'), /unknown job missing-job/)
	})
})

describe('остановка', () => {
	test('stop() ждёт текущий прогон и поднимает сигнал прерывания', async () => {
		const name = `test-stop-${crypto.randomUUID()}`
		const started = deferred()
		const release = deferred()
		let seen: AbortSignal | null = null
		const runner = jobsModule.createJobRunner({ log: quietLog })
		runner.register({
			name,
			intervalMs: null,
			async runOnce({ signal }) {
				seen = signal
				started.resolve()
				await release.promise
				return { aborted: signal.aborted ? 1 : 0 }
			},
		})

		const run = runner.runNow(name)
		await started.promise
		let stopped = false
		const stopping = runner.stop().then(() => {
			stopped = true
		})
		await new Promise((resolve) => setTimeout(resolve, 50))
		assert.equal(stopped, false)
		assert.equal((seen as AbortSignal | null)?.aborted, true)

		release.resolve()
		await stopping
		assert.equal(stopped, true)
		assert.deepEqual(await run, { aborted: 1 })
	})

	test('батч из трёх сессий при сигнале, поднятом после первой, финализирует одну', async () => {
		await closeOtherOpenSessions()
		const sessions = [
			await prepareSession('20 minutes'),
			await prepareSession('20 minutes'),
			await prepareSession('20 minutes'),
		]
		const controller = new AbortController()
		const job = jobsModule.finalizeDeadlinesJob({
			finalize: async (sessionId) => {
				const outcome = await attemptSessions.finalizeSessionByDeadline(sessionId)
				controller.abort()
				return outcome
			},
			log: quietLog,
		})

		const report = await job.runOnce({ signal: controller.signal })
		assert.deepEqual(report, emptyReport({ due: 3, finalized: 1 }))
		assert.deepEqual(await attemptSourcesOf(sessions.map((session) => session.sessionId)), ['deadline'])
	})
})

describe('расписание на подменных таймерах', () => {
	test('start() ставит таймеры finalize-deadlines на 30 000 мс и no-answer-reviews, stop() их снимает', async () => {
		const timers = fakeTimers()
		const jobs = jobsModule.createBackgroundJobs({
			log: quietLog,
			setTimer: timers.setTimer,
			clearTimer: timers.clearTimer,
		})
		assert.deepEqual(jobs.names(), [
			jobsModule.FINALIZE_DEADLINES_JOB,
			jobsModule.NO_ANSWER_REVIEWS_JOB,
			jobsModule.RECONCILE_OUTCOMES_JOB,
		])

		jobs.start()
		assert.deepEqual(
			timers.calls.map((call) => call.ms),
			[jobsModule.FINALIZE_DEADLINES_INTERVAL_MS, jobsModule.NO_ANSWER_REVIEWS_INTERVAL_MS]
		)
		assert.equal(jobsModule.FINALIZE_DEADLINES_INTERVAL_MS, 30_000)
		await jobs.stop()
		assert.deepEqual(
			timers.cleared,
			timers.calls.map((call) => call.handle)
		)
		assert.equal(timers.calls.length, 2)
	})

	test('следующий таймер ставится после прогона, исключение уходит в log.error, после stop() таймеров нет', async () => {
		const timers = fakeTimers()
		const { log, errors } = recordingLog()
		const runner = jobsModule.createJobRunner({ log, setTimer: timers.setTimer, clearTimer: timers.clearTimer })
		const name = `test-schedule-${crypto.randomUUID()}`
		let runs = 0
		let failNext = false
		runner.register({
			name,
			intervalMs: 30_000,
			async runOnce() {
				runs += 1
				if (failNext) throw new Error('job exploded')
				return { runs }
			},
		})
		runner.register({
			name: `${name}-manual`,
			intervalMs: null,
			async runOnce() {
				return {}
			},
		})

		runner.start()
		assert.equal(timers.calls.length, 1)
		assert.equal(runs, 0)

		timers.calls[0]!.fn()
		await timers.waitForCalls(2)
		assert.equal(runs, 1)
		assert.equal(timers.calls[1]!.ms, 30_000)

		failNext = true
		timers.calls[1]!.fn()
		await timers.waitForCalls(3)
		assert.equal(runs, 2)
		assert.equal(errors.length, 1)
		assert.equal(errors[0]!.data.job, name)
		assert.equal(timers.calls[2]!.ms, 30_000)

		await runner.stop()
		assert.deepEqual(timers.cleared, [timers.calls[2]!.handle])
		timers.calls[2]!.fn()
		await new Promise((resolve) => setTimeout(resolve, 50))
		assert.equal(runs, 2)
		assert.equal(timers.calls.length, 3)
	})
})

describe('запас после льготы', () => {
	test('предпроверка open на краю льготы: задача не трогает сессию, клиентская сдача создаёт свою попытку', async () => {
		await closeOtherOpenSessions()
		const prepared = await prepareSession('11 minutes')
		const clientAttemptId = crypto.randomUUID()
		const precheck = await submitSteps.precheckSubmit(
			{ testId: prepared.testId, userId: prepared.userId },
			{ sessionId: prepared.sessionId, clientAttemptId },
			10
		)
		assert.deepEqual(precheck, { kind: 'writable' })

		await shiftStartedAt(ctx, prepared.sessionId, '12 minutes 30 seconds')
		const jobs = jobsModule.createBackgroundJobs({ log: quietLog })
		assert.deepEqual(await jobs.runNow(jobsModule.FINALIZE_DEADLINES_JOB), emptyReport({}))
		const untouched = await sessionRowOf(prepared.sessionId)
		assert.equal(untouched.submitted_at, null)
		assert.equal(untouched.closed_at, null)

		const outcome = await submitSteps.submitAttempt({
			owner: { testId: prepared.testId, userId: prepared.userId },
			sessionId: prepared.sessionId,
			clientAttemptId,
			answers: {},
			scored: STUB_SCORED,
			test: { timeLimitMinutes: 10, photoUploadWindowMinutes: 15 },
			source: 'client',
		})
		assert.equal(outcome.kind, 'accepted')
		assert.deepEqual(await attemptSourcesOf([prepared.sessionId]), ['client'])
	})
})

describe('D-21: давний хвост', () => {
	test('сессия старше 24 ч после дедлайна закрывается expired без попытки, свежая сдаётся deadline', async () => {
		await closeOtherOpenSessions()
		const stale = await prepareSession('25 hours 12 minutes')
		const fresh = await prepareSession('23 hours 12 minutes')
		const staleDraft = (await sessionRowOf(stale.sessionId)).draft_answers

		const jobs = jobsModule.createBackgroundJobs({ log: quietLog })
		assert.deepEqual(
			await jobs.runNow(jobsModule.FINALIZE_DEADLINES_JOB),
			emptyReport({ stale: 1, due: 1, finalized: 1 })
		)

		const staleRow = await sessionRowOf(stale.sessionId)
		assert.notEqual(staleRow.closed_at, null)
		assert.equal(staleRow.close_reason, 'expired')
		assert.equal(staleRow.submitted_at, null)
		assert.deepEqual(staleRow.draft_answers, staleDraft)
		assert.deepEqual(await attemptSourcesOf([stale.sessionId]), [])
		assert.deepEqual(await attemptSourcesOf([fresh.sessionId]), ['deadline'])
	})
})

describe('память сбоев и предел прогона', () => {
	test('сессия, на которой finalize бросил, исключается из выборки на FINALIZE_FAILURE_COOLDOWN_MS', async () => {
		let clock = 1_000
		const excludeIds: string[][] = []
		const finalized: string[] = []
		const { log, errors } = recordingLog()
		const job = jobsModule.finalizeDeadlinesJob({
			closeStale: async () => 0,
			find: async (_limit, exclude = []) => {
				excludeIds.push([...exclude])
				return ['A', 'B'].filter((id) => !exclude.includes(id))
			},
			finalize: async (sessionId) => {
				finalized.push(sessionId)
				if (sessionId === 'A') throw new Error('broken session')
				return { kind: 'finalized', attemptId: `attempt-${sessionId}` }
			},
			now: () => clock,
			log,
		})
		const signal = new AbortController().signal

		assert.deepEqual(await job.runOnce({ signal }), emptyReport({ due: 2, finalized: 1, failed: 1 }))
		assert.deepEqual(finalized, ['A', 'B'])
		assert.equal(errors[0]!.data.sessionId, 'A')

		await job.runOnce({ signal })
		assert.deepEqual(excludeIds[1], ['A'])

		clock += jobsModule.FINALIZE_FAILURE_COOLDOWN_MS
		await job.runOnce({ signal })
		assert.deepEqual(excludeIds[2], [])
		assert.equal(jobsModule.FINALIZE_FAILURE_COOLDOWN_MS, 600_000)
	})

	test('после FINALIZE_RUN_BUDGET_MS новые сессии батча не берутся, timeBounded = 1', async () => {
		let clock = 0
		const finalized: string[] = []
		const job = jobsModule.finalizeDeadlinesJob({
			closeStale: async () => 0,
			find: async () => ['A', 'B', 'C'],
			finalize: async (sessionId) => {
				finalized.push(sessionId)
				clock += jobsModule.FINALIZE_RUN_BUDGET_MS
				return { kind: 'finalized', attemptId: `attempt-${sessionId}` }
			},
			now: () => clock,
			log: quietLog,
		})

		const report = await job.runOnce({ signal: new AbortController().signal })
		assert.deepEqual(report, emptyReport({ due: 3, finalized: 1, timeBounded: 1 }))
		assert.deepEqual(finalized, ['A'])
		assert.equal(jobsModule.FINALIZE_RUN_BUDGET_MS, 20_000)
	})
})

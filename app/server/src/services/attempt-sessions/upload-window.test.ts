import { UploadWindowRefusalSchema } from '@bio-exam/exam-core'

import { sql } from 'drizzle-orm'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { afterAll, beforeAll, describe, test } from 'vitest'

import {
	addQuestion,
	assignTest,
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

type WindowModule = typeof import('./upload-window.js')
type UploadWindowInput = import('./upload-window.js').UploadWindowInput
type UploadWindowState = import('./upload-window.js').UploadWindowState

let ctx: AuthApp
let world: AttemptWorld
let student: { id: string; cookie: string }
let windowModule: WindowModule

beforeAll(async () => {
	ctx = await startAuthApp('test_upload_window')
	windowModule = await import('./upload-window.js')
	world = await seedAttemptWorld(ctx, 'upwin')
	student = await seedStudent(world, 'upwin_student')
}, 60_000)

afterAll(async () => {
	await ctx?.stop()
})

const MINUTE_MS = 60_000
const T0 = new Date('2026-01-01T10:00:00.000Z')

function at(offsetMs: number): Date {
	return new Date(T0.getTime() + offsetMs)
}

function openInput(overrides: Partial<UploadWindowInput> = {}): UploadWindowInput {
	return {
		now: T0,
		startedAt: at(-5 * MINUTE_MS),
		timeLimitMinutes: null,
		windowMinutes: 15,
		submittedAt: null,
		closedAt: null,
		uploadClosesAt: null,
		...overrides,
	}
}

describe('uploadWindowState', () => {
	type StateCase = { name: string; input: UploadWindowInput; expected: UploadWindowState }

	const cases: StateCase[] = [
		{ name: 'открытая сессия без лимита', input: openInput(), expected: { open: true, closesAt: null } },
		{
			name: 'открытая сессия с лимитом до границы',
			input: openInput({ timeLimitMinutes: 10 }),
			expected: { open: true, closesAt: at(-5 * MINUTE_MS + 25 * MINUTE_MS) },
		},
		{
			name: 'ровно на границе — закрыто',
			input: openInput({ timeLimitMinutes: 10, startedAt: at(-25 * MINUTE_MS) }),
			expected: { open: false, reason: 'window_closed', closesAt: T0 },
		},
		{
			name: 'за секунду до границы — открыто',
			input: openInput({ timeLimitMinutes: 10, startedAt: at(-25 * MINUTE_MS + 1000) }),
			expected: { open: true, closesAt: at(1000) },
		},
		{
			name: 'после границы',
			input: openInput({ timeLimitMinutes: 10, startedAt: at(-26 * MINUTE_MS) }),
			expected: { open: false, reason: 'window_closed', closesAt: at(-MINUTE_MS) },
		},
		{
			name: 'окно 0 с лимитом в льготе — закрыто',
			input: openInput({ timeLimitMinutes: 10, windowMinutes: 0, startedAt: at(-10 * MINUTE_MS - 1000) }),
			expected: { open: false, reason: 'window_closed', closesAt: at(-1000) },
		},
		{
			name: 'сданная попытка, окно в будущем',
			input: openInput({
				submittedAt: at(-MINUTE_MS),
				uploadClosesAt: at(14 * MINUTE_MS),
			}),
			expected: { open: true, closesAt: at(14 * MINUTE_MS) },
		},
		{
			name: 'сданная попытка, окно в прошлом',
			input: openInput({
				submittedAt: at(-20 * MINUTE_MS),
				uploadClosesAt: at(-5 * MINUTE_MS),
			}),
			expected: { open: false, reason: 'window_closed', closesAt: at(-5 * MINUTE_MS) },
		},
		{
			name: 'сданная попытка без окна',
			input: openInput({ submittedAt: at(-MINUTE_MS), uploadClosesAt: null }),
			expected: { open: false, reason: 'no_window', closesAt: null },
		},
		{
			name: 'сессия закрыта expired без попытки',
			input: openInput({ closedAt: at(-MINUTE_MS) }),
			expected: { open: false, reason: 'session_closed', closesAt: null },
		},
		{
			name: 'сессия закрыта superseded без попытки',
			input: openInput({ closedAt: at(-MINUTE_MS), timeLimitMinutes: 10 }),
			expected: { open: false, reason: 'session_closed', closesAt: null },
		},
	]

	test.each(cases)('$name', ({ input, expected }) => {
		assert.deepEqual(windowModule.uploadWindowState(input), expected)
	})
})

describe('uploadWindowRefusal', () => {
	type RefusalCase = {
		name: string
		state: UploadWindowState
		expected: { error: string; uploadClosesAt: string | null } | null
	}

	const cases: RefusalCase[] = [
		{ name: 'открыто — отказа нет', state: { open: true, closesAt: T0 }, expected: null },
		{
			name: 'window_closed несёт момент закрытия',
			state: { open: false, reason: 'window_closed', closesAt: T0 },
			expected: { error: 'UPLOAD_WINDOW_CLOSED', uploadClosesAt: T0.toISOString() },
		},
		{
			name: 'no_window',
			state: { open: false, reason: 'no_window', closesAt: null },
			expected: { error: 'UPLOAD_WINDOW_NONE', uploadClosesAt: null },
		},
		{
			name: 'session_closed',
			state: { open: false, reason: 'session_closed', closesAt: null },
			expected: { error: 'UPLOAD_WINDOW_NONE', uploadClosesAt: null },
		},
	]

	test.each(cases)('$name', ({ state, expected }) => {
		const refusal = windowModule.uploadWindowRefusal(state)
		if (expected === null) {
			assert.equal(refusal, null)
			return
		}
		assert.ok(refusal)
		assert.equal(refusal.status, 422)
		assert.deepEqual(refusal.body, expected)
		assert.equal(UploadWindowRefusalSchema.safeParse(refusal.body).success, true)
	})
})

type Prepared = { testId: string; shortId: string; openId: string | null }

async function prepare(options: { timeLimitMinutes: number | null; withOpen: boolean }): Promise<Prepared> {
	const slug = `upwin-${crypto.randomUUID().slice(0, 8)}`
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

async function submitOk(prepared: Prepared, sessionId: string): Promise<string> {
	const answers: Record<string, string> = { [prepared.shortId]: 'Митоз' }
	if (prepared.openId) answers[prepared.openId] = 'Соматическая клетка делится митозом'
	const reply = await submitAttempt(world, student.cookie, prepared.testId, {
		sessionId,
		clientAttemptId: crypto.randomUUID(),
		answers,
	})
	assert.equal(reply.status, 200, JSON.stringify(reply.body))
	return reply.body.attemptId as string
}

async function windowOf(sessionId: string): Promise<UploadWindowState> {
	const state = await windowModule.photoUploadWindow(ctx.db, { sessionId })
	assert.ok(state, `session ${sessionId} not found`)
	return state
}

async function startedAtOf(sessionId: string): Promise<Date> {
	const result = await ctx.pgPool.query<{ started_at: Date }>('SELECT started_at FROM test_sessions WHERE id = $1', [
		sessionId,
	])
	return result.rows[0]!.started_at
}

describe('photoUploadWindow на базе', () => {
	test('открытая сессия с лимитом: граница — старт плюс лимит плюс окно по умолчанию', async () => {
		const prepared = await prepare({ timeLimitMinutes: 10, withOpen: false })
		const sessionId = await startOk(prepared.testId)
		const state = await windowOf(sessionId)

		assert.equal(state.open, true)
		assert.ok(state.closesAt)
		const expected = (await startedAtOf(sessionId)).getTime() + 25 * MINUTE_MS
		assert.ok(Math.abs(state.closesAt.getTime() - expected) <= 1000)
	})

	test('открытая сессия без лимита: открыто без границы', async () => {
		const prepared = await prepare({ timeLimitMinutes: null, withOpen: false })
		const sessionId = await startOk(prepared.testId)

		assert.deepEqual(await windowOf(sessionId), { open: true, closesAt: null })
	})

	test.each([
		{ name: 'за секунду до границы — открыто', startedAgo: '24 minutes 59 seconds', open: true },
		{ name: 'через секунду после границы — закрыто', startedAgo: '25 minutes 1 second', open: false },
	])('открытая сессия, $name', async ({ startedAgo, open }) => {
		const prepared = await prepare({ timeLimitMinutes: 10, withOpen: false })
		const sessionId = await startOk(prepared.testId)
		await shiftStartedAt(ctx, sessionId, startedAgo)
		const state = await windowOf(sessionId)

		assert.equal(state.open, open)
		if (!state.open) {
			assert.equal(state.reason, 'window_closed')
			const refusal = windowModule.uploadWindowRefusal(state)
			assert.ok(refusal)
			assert.equal(refusal.body.error, 'UPLOAD_WINDOW_CLOSED')
			assert.equal(UploadWindowRefusalSchema.safeParse(refusal.body).success, true)
		}
	})

	test.each([
		{ name: 'за секунду до upload_closes_at — открыто', offset: "+ interval '2 seconds'", open: true },
		{ name: 'через секунду после upload_closes_at — закрыто', offset: "- interval '1 second'", open: false },
	])('сданная попытка, $name', async ({ offset, open }) => {
		const prepared = await prepare({ timeLimitMinutes: 10, withOpen: true })
		const sessionId = await startOk(prepared.testId)
		const attemptId = await submitOk(prepared, sessionId)
		await ctx.pgPool.query(`UPDATE test_attempts SET upload_closes_at = clock_timestamp() ${offset} WHERE id = $1`, [
			attemptId,
		])
		const state = await windowOf(sessionId)

		assert.equal(state.open, open)
		if (state.open) assert.ok(state.closesAt)
		else {
			assert.equal(state.reason, 'window_closed')
			assert.equal(windowModule.uploadWindowRefusal(state)?.status, 422)
		}
	})

	test('сданная попытка теста без открытого вопроса: окна нет', async () => {
		const prepared = await prepare({ timeLimitMinutes: 10, withOpen: false })
		const sessionId = await startOk(prepared.testId)
		await submitOk(prepared, sessionId)
		const state = await windowOf(sessionId)

		assert.deepEqual(state, { open: false, reason: 'no_window', closesAt: null })
		const refusal = windowModule.uploadWindowRefusal(state)
		assert.equal(refusal?.body.error, 'UPLOAD_WINDOW_NONE')
	})

	test.each([{ reason: 'expired' }, { reason: 'superseded' }])(
		'сессия, закрытая $reason без попытки: фото не принимается',
		async ({ reason }) => {
			const prepared = await prepare({ timeLimitMinutes: 10, withOpen: true })
			const sessionId = await startOk(prepared.testId)
			await ctx.pgPool.query('UPDATE test_sessions SET closed_at = now(), close_reason = $2 WHERE id = $1', [
				sessionId,
				reason,
			])
			const state = await windowOf(sessionId)

			assert.deepEqual(state, { open: false, reason: 'session_closed', closesAt: null })
			const refusal = windowModule.uploadWindowRefusal(state)
			assert.equal(refusal?.body.error, 'UPLOAD_WINDOW_NONE')
			assert.equal(refusal?.body.uploadClosesAt, null)
		}
	)

	test('несуществующая сессия: null', async () => {
		assert.equal(await windowModule.photoUploadWindow(ctx.db, { sessionId: crypto.randomUUID() }), null)
	})

	test('внутри транзакции момент берётся по clock_timestamp, а не по началу транзакции', async () => {
		const prepared = await prepare({ timeLimitMinutes: 10, withOpen: false })
		const sessionId = await startOk(prepared.testId)
		await shiftStartedAt(ctx, sessionId, '24 minutes 59 seconds')
		const state = await ctx.db.transaction(async (tx) => {
			await tx.execute(sql`SELECT pg_sleep(2)`)
			return windowModule.photoUploadWindow(tx, { sessionId })
		})

		assert.ok(state)
		assert.equal(state.open, false)
	})
})

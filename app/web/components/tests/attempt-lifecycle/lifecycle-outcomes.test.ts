import { ATTEMPT_GRACE_PERIOD_MINUTES, SUBMIT_ERROR_CODES } from '@bio-exam/exam-core'

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test, vi } from 'vitest'

import {
	ATTEMPT_ID,
	attemptViewOf,
	deferred,
	fakeAttemptApi,
	KEYS,
	NETWORK,
	Q1,
	presentKeys,
	readJson,
	requestError,
	response,
	seededStorage,
	sessionOf,
	settle,
	setupLifecycle,
	START,
	TEST_ID,
	textResult,
	type AttemptKeyName,
	type MemoryStorage,
} from './testing'

const LIMIT = 10
const DEADLINE = START + LIMIT * 60_000

beforeEach(() => {
	vi.useFakeTimers()
	vi.setSystemTime(START)
})

afterEach(() => {
	vi.useRealTimers()
})

type Outcome = {
	keys: AttemptKeyName[]
	walSessionId?: string | null
	unsent?: { attemptId: string | null; certain: boolean; text: string } | null
}

async function activeWithText(input: { timeLimitMinutes?: number | null; saveStatus?: number } = {}) {
	const fakeApi = fakeAttemptApi([sessionOf('s1')])
	if (input.saveStatus !== undefined) fakeApi.setSaveDefault(response(input.saveStatus))
	const setup = setupLifecycle({
		api: fakeApi,
		timeLimitMinutes: input.timeLimitMinutes ?? null,
		textQuestionIds: [Q1],
	})
	setup.lifecycle.init()
	if (input.timeLimitMinutes) await setup.lifecycle.confirmStart()
	else await settle()
	setup.lifecycle.answer(Q1, 'текст')
	return setup
}

async function submitWith(reply: Error | ReturnType<typeof attemptViewOf>, auto = false): Promise<MemoryStorage> {
	const { lifecycle, storage, fakeApi } = await activeWithText({ timeLimitMinutes: auto ? LIMIT : null })
	fakeApi.queueSubmit(reply)
	const done = lifecycle.submit({ auto })
	await vi.advanceTimersByTimeAsync(1_500)
	await done
	return storage
}

function finalized(results: ReturnType<typeof textResult>[]) {
	return requestError(409, SUBMIT_ERROR_CODES.alreadySubmitted, ATTEMPT_ID, {
		submitSource: 'deadline',
		attempt: attemptViewOf(ATTEMPT_ID, { results }),
	})
}

async function finalizedWith(results: ReturnType<typeof textResult>[]): Promise<MemoryStorage> {
	const { lifecycle, storage, fakeApi } = await activeWithText({ timeLimitMinutes: LIMIT, saveStatus: 500 })
	fakeApi.queueSubmit(finalized(results))
	await lifecycle.submit({ auto: true })
	return storage
}

async function startBlockedWithCache(): Promise<MemoryStorage> {
	const storage = seededStorage({
		session: { sessionId: 's1' },
		wal: { sessionId: 's1', answers: { [Q1]: 'текст' }, pending: [] },
	})
	const fakeApi = fakeAttemptApi([requestError(403)])
	const { lifecycle } = setupLifecycle({ storage, api: fakeApi, textQuestionIds: [Q1] })
	lifecycle.init()
	await settle()
	assert.equal(lifecycle.getSnapshot().blockReason, 'start-not-assigned')
	return storage
}

async function replacedWith(pending: string[]): Promise<MemoryStorage> {
	const storage = seededStorage({
		session: { sessionId: 's1' },
		wal: { sessionId: 's1', answers: { [Q1]: 'текст' }, pending },
	})
	const fakeApi = fakeAttemptApi([sessionOf('s2')])
	const { lifecycle } = setupLifecycle({ storage, api: fakeApi, textQuestionIds: [Q1] })
	lifecycle.init()
	await settle()
	assert.equal(lifecycle.getSnapshot().phase, 'active')
	return storage
}

async function retakeAfterResult(): Promise<MemoryStorage> {
	const { lifecycle, storage, fakeApi } = await activeWithText({ timeLimitMinutes: LIMIT })
	fakeApi.queueSubmit(attemptViewOf())
	await lifecycle.submit()
	lifecycle.retake()
	await settle()
	assert.equal(lifecycle.getSnapshot().phase, 'awaitingStart')
	return storage
}

async function frozenWithOtherSession(): Promise<MemoryStorage> {
	vi.setSystemTime(START + 60_000)
	const storage = seededStorage({
		session: { sessionId: 's1' },
		wal: { sessionId: 's1', answers: { [Q1]: 'текст' }, pending: [] },
		frozen: true,
	})
	const fakeApi = fakeAttemptApi([sessionOf('s2', new Date(START + 60_000).toISOString())])
	const { lifecycle } = setupLifecycle({ storage, api: fakeApi, timeLimitMinutes: LIMIT, textQuestionIds: [Q1] })
	lifecycle.init()
	await settle()
	assert.equal(lifecycle.getSnapshot().phase, 'active')
	assert.equal(fakeApi.submit.mock.calls.length, 0)
	return storage
}

describe('характеризация: ключи хранилища после каждого исхода', () => {
	test.each<[string, () => Promise<MemoryStorage>, Outcome]>([
		['200 ручной сдачи', () => submitWith(attemptViewOf()), { keys: [] }],
		['409 client', () => submitWith(requestError(409, SUBMIT_ERROR_CODES.alreadySubmitted, ATTEMPT_ID)), { keys: [] }],
		['409 deadline, текст совпал', () => finalizedWith([textResult(Q1, 'текст')]), { keys: [] }],
		[
			'409 deadline, текст не дошёл',
			() => finalizedWith([textResult(Q1, 'тек')]),
			{ keys: ['unsent'], unsent: { attemptId: ATTEMPT_ID, certain: true, text: 'текст' } },
		],
		[
			'422 TIME_EXPIRED',
			() => submitWith(requestError(422, SUBMIT_ERROR_CODES.timeExpired)),
			{ keys: ['wal'], walSessionId: 's1' },
		],
		['404 сдачи', () => submitWith(requestError(404)), { keys: ['wal'], walSessionId: null }],
		[
			'403 сдачи',
			() => submitWith(requestError(403)),
			{ keys: ['session', 'wal', 'clientAttemptId'], walSessionId: 's1' },
		],
		[
			'403 автосдачи',
			() => submitWith(requestError(403), true),
			{ keys: ['session', 'wal', 'clientAttemptId'], walSessionId: 's1' },
		],
		['404 автосдачи', () => submitWith(requestError(404), true), { keys: ['wal'], walSessionId: null }],
		[
			'сбой сети ручной сдачи',
			() => submitWith(new Error('network')),
			{ keys: ['session', 'wal', 'clientAttemptId'], walSessionId: 's1' },
		],
		[
			'сбой сети автосдачи',
			() => submitWith(new Error('network'), true),
			{ keys: ['session', 'wal', 'clientAttemptId'], walSessionId: 's1' },
		],
		['403 на старте при кэше сессии и WAL', startBlockedWithCache, { keys: ['wal'], walSessionId: null }],
		[
			'замена сессии, ответы s1 подтверждены',
			() => replacedWith([]),
			{ keys: ['session', 'wal'], walSessionId: 's2', unsent: null },
		],
		[
			'замена сессии, текст s1 не подтверждён',
			() => replacedWith([Q1]),
			{
				keys: ['session', 'wal', 'unsent'],
				walSessionId: 's2',
				unsent: { attemptId: null, certain: false, text: 'текст' },
			},
		],
		['«Начать заново» после результата теста с лимитом', retakeAfterResult, { keys: [] }],
		[
			'восстановление с frozen и другой сессией',
			frozenWithOtherSession,
			{ keys: ['session', 'wal'], walSessionId: 's2' },
		],
	])('%s', async (_name, run, expected) => {
		const storage = await run()
		assert.deepEqual(presentKeys(storage), expected.keys)
		if (expected.walSessionId !== undefined) {
			assert.equal((readJson(storage, KEYS.wal) as { sessionId: string | null }).sessionId, expected.walSessionId)
		}
		if (expected.unsent === null) assert.equal(storage.data.has(KEYS.unsent), false)
		if (expected.unsent) {
			assert.deepEqual(readJson(storage, KEYS.unsent), {
				v: 1,
				testId: TEST_ID,
				attemptId: expected.unsent.attemptId,
				certain: expected.unsent.certain,
				entries: [{ questionId: Q1, number: 1, text: expected.unsent.text }],
			})
		}
	})
})

describe('404 на PATCH после льготы', () => {
	test('очередь стоит, ответ в WAL и в теле автосдачи, 409 финализации показывает «Ответ принят» с недошедшим текстом', async () => {
		const fakeApi = fakeAttemptApi([sessionOf('s1')])
		fakeApi.setSaveDefault(NETWORK)
		const { lifecycle, storage, page } = setupLifecycle({
			api: fakeApi,
			timeLimitMinutes: LIMIT,
			textQuestionIds: [Q1],
		})
		lifecycle.init()
		await lifecycle.confirmStart()
		lifecycle.answer(Q1, 'текст')
		fakeApi.queueSubmit(new Error('network'))
		await vi.advanceTimersByTimeAsync(LIMIT * 60_000)
		await settle()
		assert.equal(lifecycle.getSnapshot().display.deadlinePanel, 'failed')
		vi.setSystemTime(DEADLINE + (ATTEMPT_GRACE_PERIOD_MINUTES + 1) * 60_000)
		const patches = fakeApi.saveDraft.mock.calls.length
		fakeApi.setSaveDefault(response(404))
		const finalSubmit = deferred<ReturnType<typeof attemptViewOf> | Error>()
		fakeApi.queueSubmit(finalSubmit)
		page.emit('online')
		await settle()
		assert.ok(fakeApi.saveDraft.mock.calls.length > patches)
		const afterStop = fakeApi.saveDraft.mock.calls.length
		await vi.advanceTimersByTimeAsync(60_000)
		assert.equal(fakeApi.saveDraft.mock.calls.length, afterStop)
		const wal = readJson(storage, KEYS.wal) as { answers: Record<string, unknown>; pending: string[] }
		assert.equal(wal.answers[Q1], 'текст')
		assert.deepEqual(wal.pending, [Q1])
		assert.equal(fakeApi.submit.mock.calls.length, 2)
		assert.equal(fakeApi.submitRequests()[1]?.answers[Q1], 'текст')
		finalSubmit.resolve(finalized([]))
		await settle()
		const snapshot = lifecycle.getSnapshot()
		assert.deepEqual(snapshot.display.outcome, { kind: 'result', accepted: true })
		assert.deepEqual(snapshot.unsent, { certain: true, entries: [{ questionId: Q1, number: 1, text: 'текст' }] })
		assert.deepEqual(presentKeys(storage), ['unsent'])
	})
})

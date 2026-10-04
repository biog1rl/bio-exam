import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test, vi } from 'vitest'

import {
	deferred,
	fakeAttemptApi,
	KEYS,
	memoryStorage,
	NETWORK,
	OK,
	Q1,
	Q2,
	Q3,
	readJson,
	requestError,
	response,
	sessionOf,
	settle,
	setupLifecycle,
	START,
	STARTED_AT,
	TEST_ID,
} from './testing'

beforeEach(() => {
	vi.useFakeTimers()
	vi.setSystemTime(START)
})

afterEach(() => {
	vi.useRealTimers()
})

describe('answer: синхронный WAL и очередь', () => {
	test('тест без лимита: init вызывает /start и переходит в active', async () => {
		const { lifecycle, fakeApi } = setupLifecycle()
		lifecycle.init()
		assert.equal(lifecycle.getSnapshot().phase, 'starting')
		await settle()
		assert.equal(fakeApi.start.mock.calls.length, 1)
		assert.equal(fakeApi.start.mock.calls[0]?.[0], TEST_ID)
		assert.equal(lifecycle.getSnapshot().phase, 'active')
		assert.equal(lifecycle.getSnapshot().interactionDisabled, false)
	})

	test('WAL пишется сразу после answer, до ответа сети', async () => {
		const { lifecycle, storage, fakeApi } = setupLifecycle()
		lifecycle.init()
		await settle()
		lifecycle.answer(Q1, 'a')
		const wal = readJson(storage, KEYS.wal) as { v: number; sessionId: string; answers: object; pending: string[] }
		assert.equal(wal.v, 2)
		assert.equal(wal.sessionId, 's1')
		assert.deepEqual(wal.answers, { [Q1]: 'a' })
		assert.deepEqual(wal.pending, [Q1])
		assert.deepEqual(lifecycle.getSnapshot().answers, { [Q1]: 'a' })
		assert.equal(fakeApi.saveDraft.mock.calls.length, 0)
	})

	test('Q1, через 300 мс Q2: после 600 мс от последнего ответа оба отправлены по одному в полёте', async () => {
		const { lifecycle, fakeApi } = setupLifecycle()
		const first = deferred<typeof OK>()
		fakeApi.queueSave(first)
		lifecycle.init()
		await settle()
		lifecycle.answer(Q1, 'a')
		await vi.advanceTimersByTimeAsync(300)
		lifecycle.answer(Q2, ['x'])
		await vi.advanceTimersByTimeAsync(599)
		assert.equal(fakeApi.saveDraft.mock.calls.length, 0)
		await vi.advanceTimersByTimeAsync(1)
		assert.equal(fakeApi.saveDraft.mock.calls.length, 1)
		assert.deepEqual(fakeApi.saveDraft.mock.calls[0], [
			TEST_ID,
			's1',
			{ questionId: Q1, value: 'a' },
			{ keepalive: false },
		])
		first.resolve(OK)
		await settle()
		assert.equal(fakeApi.saveDraft.mock.calls.length, 2)
		assert.deepEqual(fakeApi.saveDraft.mock.calls[1], [
			TEST_ID,
			's1',
			{ questionId: Q2, value: ['x'] },
			{ keepalive: false },
		])
	})

	test('D-26 п. 1: перезагрузка в окне дебаунса: новый модуль видит оба ответа и досылает их', async () => {
		const storage = memoryStorage()
		const fakeApi = fakeAttemptApi([sessionOf('s1')])
		const first = setupLifecycle({ storage, api: fakeApi })
		first.lifecycle.init()
		await settle()
		first.lifecycle.answer(Q1, 'a')
		await vi.advanceTimersByTimeAsync(300)
		first.lifecycle.answer(Q2, ['x'])
		vi.clearAllTimers()
		assert.equal(fakeApi.saveDraft.mock.calls.length, 0)

		const second = setupLifecycle({ storage, api: fakeApi })
		second.lifecycle.init()
		await settle()
		assert.equal(second.lifecycle.getSnapshot().phase, 'active')
		assert.deepEqual(second.lifecycle.getSnapshot().answers, { [Q1]: 'a', [Q2]: ['x'] })
		await vi.advanceTimersByTimeAsync(600)
		assert.deepEqual(fakeApi.savedBodies(), [
			{ questionId: Q1, value: 'a' },
			{ questionId: Q2, value: ['x'] },
			{ telemetry: { [Q1]: { timeSpentMs: 0, focusLossCount: 0, visitCount: 1 } } },
		])
		for (const call of fakeApi.saveDraft.mock.calls) assert.equal(call[1], 's1')
		const wal = readJson(storage, KEYS.wal) as { pending: string[] }
		assert.deepEqual(wal.pending, [])
	})

	test('D-26 п. 2: dispose в окне дебаунса: ответ в WAL и отправлен без ожидания дебаунса', async () => {
		const { lifecycle, storage, fakeApi } = setupLifecycle()
		lifecycle.init()
		await settle()
		lifecycle.answer(Q1, 'a')
		await vi.advanceTimersByTimeAsync(100)
		lifecycle.dispose()
		assert.equal(fakeApi.saveDraft.mock.calls.length, 2)
		assert.deepEqual(fakeApi.saveDraft.mock.calls[0], [
			TEST_ID,
			's1',
			{ questionId: Q1, value: 'a' },
			{ keepalive: false },
		])
		assert.deepEqual(fakeApi.saveDraft.mock.calls[1], [
			TEST_ID,
			's1',
			{ telemetry: { [Q1]: { timeSpentMs: 100, focusLossCount: 0, visitCount: 1 } } },
			{ keepalive: false },
		])
		await settle()
		const wal = readJson(storage, KEYS.wal) as { answers: object; pending: string[] }
		assert.deepEqual(wal.answers, { [Q1]: 'a' })
		assert.deepEqual(wal.pending, [Q1])
		await vi.advanceTimersByTimeAsync(10_000)
		assert.equal(fakeApi.saveDraft.mock.calls.length, 2)
	})

	test('getSnapshot возвращает тот же объект до следующего изменения', async () => {
		const { lifecycle } = setupLifecycle()
		lifecycle.init()
		await settle()
		const before = lifecycle.getSnapshot()
		assert.equal(lifecycle.getSnapshot(), before)
		lifecycle.answer(Q1, 'a')
		assert.notEqual(lifecycle.getSnapshot(), before)
	})

	test('подписчики узнают об изменениях, отписка работает', async () => {
		const { lifecycle } = setupLifecycle()
		const listener = vi.fn()
		const unsubscribe = lifecycle.subscribe(listener)
		lifecycle.init()
		await settle()
		const calls = listener.mock.calls.length
		assert.ok(calls > 0)
		unsubscribe()
		lifecycle.answer(Q1, 'a')
		assert.equal(listener.mock.calls.length, calls)
	})
})

function walRecord(record: Record<string, unknown>) {
	return JSON.stringify({
		v: 2,
		sessionId: 's1',
		answers: {},
		pending: [],
		position: null,
		telemetry: {},
		telemetryPending: false,
		...record,
	})
}

function cachedSession(sessionId: string, extra: Record<string, unknown> = {}) {
	return JSON.stringify({ sessionId, startedAt: STARTED_AT, ...extra })
}

describe('восстановление и смена сессии', () => {
	test('закэшированная s1, /start отдаёт s2: ключи прежней сессии сняты, ответы из черновика s2, уведомление session-replaced', async () => {
		const storage = memoryStorage({
			[KEYS.session]: cachedSession('s1'),
			[KEYS.wal]: walRecord({ answers: { [Q1]: 'old' }, pending: [Q1] }),
			[KEYS.frozen]: '1',
			[KEYS.clientAttemptId]: JSON.stringify({ sessionId: 's1', clientAttemptId: 'c1' }),
		})
		const fakeApi = fakeAttemptApi([sessionOf('s2', STARTED_AT, { answers: { [Q2]: 'srv' } })])
		const { lifecycle, onNotice } = setupLifecycle({ storage, api: fakeApi })
		lifecycle.init()
		await settle()
		assert.equal(lifecycle.getSnapshot().phase, 'active')
		assert.deepEqual(lifecycle.getSnapshot().answers, { [Q2]: 'srv' })
		assert.equal(storage.data.has(KEYS.frozen), false)
		assert.equal(storage.data.has(KEYS.clientAttemptId), false)
		const wal = readJson(storage, KEYS.wal) as { sessionId: string; answers: object; pending: string[] }
		assert.equal(wal.sessionId, 's2')
		assert.deepEqual(wal.answers, { [Q2]: 'srv' })
		assert.deepEqual(wal.pending, [])
		assert.deepEqual(onNotice.mock.calls, [[{ kind: 'session-replaced' }]])
		await vi.advanceTimersByTimeAsync(10_000)
		assert.equal(fakeApi.saveDraft.mock.calls.length, 0)
	})

	test('закэшированная s1, /start отдаёт s1: уведомление session-restored', async () => {
		const storage = memoryStorage({ [KEYS.session]: cachedSession('s1') })
		const { lifecycle, onNotice } = setupLifecycle({ storage })
		lifecycle.init()
		await settle()
		assert.deepEqual(onNotice.mock.calls, [[{ kind: 'session-restored' }]])
		assert.equal(lifecycle.getSnapshot().startedAt, STARTED_AT)
	})

	test('ответы WAL закэшированной сессии видны сразу после init, до ответа /start', async () => {
		const storage = memoryStorage({
			[KEYS.session]: cachedSession('s1'),
			[KEYS.wal]: walRecord({ answers: { [Q1]: 'a' }, pending: [Q1], position: Q2 }),
		})
		const fakeApi = fakeAttemptApi()
		const start = deferred<ReturnType<typeof sessionOf>>()
		fakeApi.start.mockImplementationOnce(() => start.promise)
		const { lifecycle } = setupLifecycle({ storage, api: fakeApi })
		lifecycle.init()
		assert.equal(lifecycle.getSnapshot().phase, 'starting')
		assert.equal(lifecycle.getSnapshot().interactionDisabled, true)
		assert.deepEqual(lifecycle.getSnapshot().answers, { [Q1]: 'a' })
		assert.equal(lifecycle.getSnapshot().currentQuestionId, Q2)
		start.resolve(sessionOf('s1'))
		await settle()
		assert.equal(lifecycle.getSnapshot().phase, 'active')
		assert.deepEqual(lifecycle.getSnapshot().answers, { [Q1]: 'a' })
	})

	test('D-26 п. 7: 403 на /start: blocked, ключи session и clientAttemptId сняты, WAL без сессии; следующий модуль досылает ответы в s3', async () => {
		const storage = memoryStorage({
			[KEYS.session]: cachedSession('s1'),
			[KEYS.wal]: walRecord({ answers: { [Q1]: 'a', [Q2]: 'b' }, pending: [Q2] }),
			[KEYS.clientAttemptId]: JSON.stringify({ sessionId: 's1', clientAttemptId: 'c1' }),
		})
		const blockedApi = fakeAttemptApi([requestError(403)])
		const first = setupLifecycle({ storage, api: blockedApi })
		first.lifecycle.init()
		await settle()
		const snapshot = first.lifecycle.getSnapshot()
		assert.equal(snapshot.phase, 'blocked')
		assert.equal(snapshot.blockReason, 'start-not-assigned')
		assert.equal(snapshot.interactionDisabled, true)
		assert.equal(storage.data.has(KEYS.session), false)
		assert.equal(storage.data.has(KEYS.clientAttemptId), false)
		const wal = readJson(storage, KEYS.wal) as { sessionId: string | null; answers: object; pending: string[] }
		assert.equal(wal.sessionId, null)
		assert.deepEqual(wal.answers, { [Q1]: 'a', [Q2]: 'b' })
		assert.deepEqual([...wal.pending].sort(), [Q1, Q2].sort())
		await vi.advanceTimersByTimeAsync(10_000)
		assert.equal(blockedApi.saveDraft.mock.calls.length, 0)
		first.lifecycle.dispose()

		const nextApi = fakeAttemptApi([sessionOf('s3')])
		const second = setupLifecycle({ storage, api: nextApi })
		second.lifecycle.init()
		await settle()
		assert.equal(second.lifecycle.getSnapshot().phase, 'active')
		assert.deepEqual(second.lifecycle.getSnapshot().answers, { [Q1]: 'a', [Q2]: 'b' })
		await vi.advanceTimersByTimeAsync(600)
		assert.deepEqual(
			nextApi.saveDraft.mock.calls.map((call) => [call[1], call[2]]),
			[
				['s3', { questionId: Q1, value: 'a' }],
				['s3', { questionId: Q2, value: 'b' }],
			]
		)
		assert.deepEqual((readJson(storage, KEYS.wal) as { pending: string[] }).pending, [])
	})

	test('D-26 п. 9: sessionKey после старта содержит только sessionId и startedAt', async () => {
		const fakeApi = fakeAttemptApi([sessionOf('s1', STARTED_AT, { answers: { [Q1]: 'srv' }, lastQuestionId: Q1 })])
		const { lifecycle, storage } = setupLifecycle({ api: fakeApi })
		lifecycle.init()
		await settle()
		assert.deepEqual(readJson(storage, KEYS.session), { sessionId: 's1', startedAt: STARTED_AT })
	})

	test('D-26 п. 9: прежняя форма sessionKey с draftAnswers перезаписывается без ответов', async () => {
		const storage = memoryStorage({
			[KEYS.session]: cachedSession('s1', {
				draftAnswers: { [Q1]: 'secret' },
				draftLastQuestionId: Q1,
				draftTelemetry: null,
			}),
		})
		const { lifecycle, onNotice } = setupLifecycle({ storage })
		lifecycle.init()
		await settle()
		assert.deepEqual(onNotice.mock.calls, [[{ kind: 'session-restored' }]])
		assert.deepEqual(readJson(storage, KEYS.session), { sessionId: 's1', startedAt: STARTED_AT })
		assert.equal(storage.data.get(KEYS.session)?.includes('secret'), false)
	})

	test('ревью P-01: черновик сервера записывается в WAL вне pending с текущей сессией', async () => {
		const storage = memoryStorage({
			[KEYS.session]: cachedSession('s1'),
			[KEYS.wal]: walRecord({ answers: { [Q2]: 'mine' }, pending: [Q2] }),
		})
		const fakeApi = fakeAttemptApi([sessionOf('s1', STARTED_AT, { answers: { [Q1]: 'srv' } })])
		const { lifecycle } = setupLifecycle({ storage, api: fakeApi })
		lifecycle.init()
		await settle()
		const wal = readJson(storage, KEYS.wal) as { sessionId: string; answers: object; pending: string[] }
		assert.equal(wal.sessionId, 's1')
		assert.deepEqual(wal.answers, { [Q1]: 'srv', [Q2]: 'mine' })
		assert.deepEqual(wal.pending, [Q2])
	})

	test('ревью C-01, R-04: WAL s0 без закэшированной сессии удаляется при /start s2', async () => {
		const storage = memoryStorage({
			[KEYS.wal]: walRecord({ sessionId: 's0', answers: { [Q1]: 'old' }, pending: [Q1] }),
		})
		const fakeApi = fakeAttemptApi([sessionOf('s2', STARTED_AT, { answers: { [Q2]: 'srv' } })])
		const removed: string[] = []
		const removeItem = storage.removeItem
		storage.removeItem = (key) => {
			removed.push(key)
			removeItem(key)
		}
		const { lifecycle } = setupLifecycle({ storage, api: fakeApi })
		lifecycle.init()
		assert.deepEqual(lifecycle.getSnapshot().answers, {})
		await settle()
		assert.deepEqual(removed, [KEYS.wal])
		assert.deepEqual(lifecycle.getSnapshot().answers, { [Q2]: 'srv' })
		const wal = readJson(storage, KEYS.wal) as { sessionId: string; answers: object; pending: string[] }
		assert.equal(wal.sessionId, 's2')
		assert.deepEqual(wal.answers, { [Q2]: 'srv' })
		assert.deepEqual(wal.pending, [])
		await vi.advanceTimersByTimeAsync(10_000)
		assert.equal(fakeApi.saveDraft.mock.calls.length, 0)
	})

	test('ревью R-04: другая вкладка записала WAL s1, ответ в сессии s2 уходит на сервер, WAL s1 не меняется', async () => {
		const fakeApi = fakeAttemptApi([sessionOf('s2')])
		const { lifecycle, storage } = setupLifecycle({ api: fakeApi })
		lifecycle.init()
		await settle()
		const alien = walRecord({ sessionId: 's1', answers: { [Q1]: 'alien' }, pending: [Q1] })
		storage.data.set(KEYS.wal, alien)
		lifecycle.answer(Q2, 'b')
		lifecycle.navigate(Q3)
		assert.deepEqual(lifecycle.getSnapshot().answers, { [Q2]: 'b' })
		await vi.advanceTimersByTimeAsync(600)
		assert.deepEqual(
			fakeApi.saveDraft.mock.calls.map((call) => [call[1], call[2]]),
			[
				['s2', { questionId: Q2, value: 'b' }],
				[
					's2',
					{
						telemetry: {
							[Q1]: { timeSpentMs: 0, focusLossCount: 0, visitCount: 1 },
							[Q3]: { timeSpentMs: 0, focusLossCount: 0, visitCount: 1 },
						},
					},
				],
			]
		)
		assert.equal(storage.data.get(KEYS.wal), alien)
	})

	test('D-09: ошибка записи хранилища не прерывает ответ и отправку', async () => {
		const storage = memoryStorage()
		storage.failWrites = true
		const { lifecycle, fakeApi } = setupLifecycle({ storage })
		lifecycle.init()
		await settle()
		assert.equal(lifecycle.getSnapshot().phase, 'active')
		assert.doesNotThrow(() => lifecycle.answer(Q1, 'a'))
		assert.deepEqual(lifecycle.getSnapshot().answers, { [Q1]: 'a' })
		await vi.advanceTimersByTimeAsync(600)
		assert.deepEqual(fakeApi.savedBodies(), [{ questionId: Q1, value: 'a' }])
	})
})

describe('сбой /start и тест с лимитом', () => {
	test('сбой /start при закэшированной сессии: active с закэшированной сессией, ответы уходят в неё', async () => {
		const storage = memoryStorage({
			[KEYS.session]: cachedSession('s1'),
			[KEYS.wal]: walRecord({ answers: { [Q1]: 'a' }, pending: [Q1] }),
		})
		const fakeApi = fakeAttemptApi([new Error('network')])
		const { lifecycle, onNotice } = setupLifecycle({ storage, api: fakeApi })
		lifecycle.init()
		await settle()
		assert.equal(lifecycle.getSnapshot().phase, 'active')
		assert.equal(lifecycle.getSnapshot().startedAt, STARTED_AT)
		assert.deepEqual(lifecycle.getSnapshot().answers, { [Q1]: 'a' })
		assert.deepEqual(onNotice.mock.calls, [])
		await vi.advanceTimersByTimeAsync(600)
		assert.deepEqual(
			fakeApi.saveDraft.mock.calls.map((call) => [call[1], call[2]]),
			[['s1', { questionId: Q1, value: 'a' }]]
		)
	})

	test('сбой /start теста без лимита без кэша: active без сессии, WAL с sessionId null, отправки нет', async () => {
		const fakeApi = fakeAttemptApi([new Error('network')])
		const { lifecycle, storage } = setupLifecycle({ api: fakeApi })
		lifecycle.init()
		await settle()
		assert.equal(lifecycle.getSnapshot().phase, 'active')
		assert.equal(lifecycle.getSnapshot().startedAt, null)
		lifecycle.answer(Q1, 'a')
		const wal = readJson(storage, KEYS.wal) as { sessionId: string | null; pending: string[] }
		assert.equal(wal.sessionId, null)
		assert.deepEqual(wal.pending, [Q1])
		await vi.advanceTimersByTimeAsync(10_000)
		assert.equal(fakeApi.saveDraft.mock.calls.length, 0)
	})

	test('тест с лимитом без кэша ждёт confirmStart; сбой /start даёт start-failed и снова awaitingStart', async () => {
		const fakeApi = fakeAttemptApi([new Error('network'), sessionOf('s1')])
		const { lifecycle, onNotice } = setupLifecycle({ api: fakeApi, timeLimitMinutes: 30 })
		lifecycle.init()
		await settle()
		assert.equal(lifecycle.getSnapshot().phase, 'awaitingStart')
		assert.equal(lifecycle.getSnapshot().interactionDisabled, true)
		assert.equal(fakeApi.start.mock.calls.length, 0)
		await lifecycle.confirmStart()
		assert.equal(lifecycle.getSnapshot().phase, 'awaitingStart')
		assert.deepEqual(onNotice.mock.calls, [[{ kind: 'start-failed' }]])
		await lifecycle.confirmStart()
		assert.equal(lifecycle.getSnapshot().phase, 'active')
		assert.equal(lifecycle.getSnapshot().startedAt, STARTED_AT)
	})

	test('тест с лимитом и закэшированной сессией идёт в /start без confirmStart', async () => {
		const storage = memoryStorage({ [KEYS.session]: cachedSession('s1') })
		const { lifecycle, fakeApi } = setupLifecycle({ storage, timeLimitMinutes: 30 })
		lifecycle.init()
		await settle()
		assert.equal(fakeApi.start.mock.calls.length, 1)
		assert.equal(lifecycle.getSnapshot().phase, 'active')
	})
})

describe('StrictMode: init → dispose → init', () => {
	test('фаза active, один подписчик видимости, WAL цел', async () => {
		const storage = memoryStorage({
			[KEYS.session]: cachedSession('s1'),
			[KEYS.wal]: walRecord({ answers: { [Q1]: 'a' }, pending: [Q1] }),
		})
		const { lifecycle, page, fakeApi } = setupLifecycle({ storage })
		lifecycle.init()
		lifecycle.dispose()
		assert.equal(page.listenerCount(), 0)
		lifecycle.init()
		await settle()
		assert.equal(lifecycle.getSnapshot().phase, 'active')
		assert.equal(page.listenerCount(), 1)
		assert.equal(fakeApi.start.mock.calls.length, 2)
		assert.deepEqual(lifecycle.getSnapshot().answers, { [Q1]: 'a' })
		const wal = readJson(storage, KEYS.wal) as { answers: object; pending: string[] }
		assert.deepEqual(wal.answers, { [Q1]: 'a' })
	})

	test('ревью M-1: после повторного init очередь создана заново и ответ отправляется', async () => {
		const { lifecycle, fakeApi } = setupLifecycle()
		lifecycle.init()
		await settle()
		lifecycle.dispose()
		lifecycle.init()
		await settle()
		lifecycle.answer(Q1, 'a')
		await vi.advanceTimersByTimeAsync(600)
		assert.deepEqual(fakeApi.savedBodies(), [
			{ telemetry: { [Q1]: { timeSpentMs: 0, focusLossCount: 0, visitCount: 1 } } },
			{ telemetry: { [Q1]: { timeSpentMs: 0, focusLossCount: 0, visitCount: 1 } } },
			{ questionId: Q1, value: 'a' },
		])
	})
})

async function activeLifecycle(fakeApi = fakeAttemptApi([sessionOf('s1')])) {
	const setup = setupLifecycle({ api: fakeApi })
	setup.lifecycle.init()
	await settle()
	return setup
}

describe('сбои отправки', () => {
	test('D-26 п. 3: сбой сети — повторы через 1, 2, 5, 10 с, ответ 200 снимает pending', async () => {
		const fakeApi = fakeAttemptApi([sessionOf('s1')])
		fakeApi.queueSave(NETWORK, NETWORK, NETWORK, NETWORK)
		const { lifecycle, storage } = await activeLifecycle(fakeApi)
		lifecycle.answer(Q1, 'a')
		await vi.advanceTimersByTimeAsync(600)
		assert.equal(fakeApi.saveDraft.mock.calls.length, 1)
		assert.equal(lifecycle.getSnapshot().saveIndicator, 'offline')
		for (const [delay, calls] of [
			[1000, 2],
			[2000, 3],
			[5000, 4],
			[10_000, 5],
		] as const) {
			await vi.advanceTimersByTimeAsync(delay - 1)
			assert.equal(fakeApi.saveDraft.mock.calls.length, calls - 1)
			await vi.advanceTimersByTimeAsync(1)
			assert.equal(fakeApi.saveDraft.mock.calls.length, calls)
		}
		assert.equal(lifecycle.getSnapshot().saveIndicator, 'saved')
		assert.deepEqual((readJson(storage, KEYS.wal) as { pending: string[] }).pending, [])
		for (const call of fakeApi.saveDraft.mock.calls) assert.deepEqual(call[2], { questionId: Q1, value: 'a' })
	})

	test.each([403, 404])('D-13: %i — без повторов, WAL цел, индикатор device-only', async (status) => {
		const fakeApi = fakeAttemptApi([sessionOf('s1')])
		fakeApi.queueSave(response(status))
		const { lifecycle, storage, page } = await activeLifecycle(fakeApi)
		lifecycle.answer(Q1, 'a')
		await vi.advanceTimersByTimeAsync(600)
		assert.equal(fakeApi.saveDraft.mock.calls.length, 1)
		assert.equal(lifecycle.getSnapshot().saveIndicator, 'device-only')
		lifecycle.answer(Q2, 'b')
		lifecycle.navigate(Q2)
		page.emit('hidden')
		page.emit('visible')
		page.emit('online')
		page.emit('pagehide')
		await vi.advanceTimersByTimeAsync(60_000)
		assert.equal(fakeApi.saveDraft.mock.calls.length, 1)
		const wal = readJson(storage, KEYS.wal) as { answers: object; pending: string[] }
		assert.deepEqual(wal.answers, { [Q1]: 'a', [Q2]: 'b' })
		assert.deepEqual(wal.pending, [Q1, Q2])
		assert.equal(lifecycle.getSnapshot().saveIndicator, 'device-only')
	})

	test('D-13: 400 — без повторов, вопрос остаётся в WAL pending, индикатор saved', async () => {
		const fakeApi = fakeAttemptApi([sessionOf('s1')])
		fakeApi.queueSave(response(400))
		const { lifecycle, storage } = await activeLifecycle(fakeApi)
		lifecycle.answer(Q1, 'a')
		await vi.advanceTimersByTimeAsync(600)
		await vi.advanceTimersByTimeAsync(60_000)
		assert.equal(fakeApi.saveDraft.mock.calls.length, 1)
		assert.deepEqual((readJson(storage, KEYS.wal) as { pending: string[] }).pending, [Q1])
		assert.equal(lifecycle.getSnapshot().saveIndicator, 'saved')
	})
})

describe('немедленная отправка', () => {
	test('online и возврат вкладки после сбоя повторяют сразу', async () => {
		const fakeApi = fakeAttemptApi([sessionOf('s1')])
		fakeApi.setSaveDefault(NETWORK)
		const { lifecycle, page } = await activeLifecycle(fakeApi)
		lifecycle.answer(Q1, 'a')
		await vi.advanceTimersByTimeAsync(600)
		assert.equal(fakeApi.saveDraft.mock.calls.length, 1)
		page.emit('online')
		await settle()
		assert.equal(fakeApi.saveDraft.mock.calls.length, 2)
		page.emit('hidden')
		await settle()
		assert.equal(fakeApi.saveDraft.mock.calls.length, 3)
		assert.equal(lifecycle.getSnapshot().saveIndicator, 'offline')
		fakeApi.setSaveDefault(OK)
		page.emit('visible')
		await settle()
		assert.equal(fakeApi.saveDraft.mock.calls.length, 5)
		assert.equal(lifecycle.getSnapshot().saveIndicator, 'saved')
	})

	test('pagehide — все неподтверждённые сразу с keepalive true', async () => {
		const { lifecycle, page, fakeApi } = await activeLifecycle()
		lifecycle.answer(Q1, 'a')
		lifecycle.answer(Q2, 'b')
		page.emit('pagehide')
		assert.deepEqual(
			fakeApi.saveDraft.mock.calls.map((call) => [call[2], call[3]]),
			[
				[{ questionId: Q1, value: 'a' }, { keepalive: true }],
				[{ questionId: Q2, value: 'b' }, { keepalive: true }],
				[{ telemetry: { [Q1]: { timeSpentMs: 0, focusLossCount: 0, visitCount: 1 } } }, { keepalive: true }],
			]
		)
	})

	test('navigate при неподтверждённом ответе отправляет его без ожидания дебаунса и пишет позицию', async () => {
		const { lifecycle, fakeApi, storage } = await activeLifecycle()
		lifecycle.answer(Q1, 'a')
		lifecycle.navigate(Q2)
		await settle()
		assert.deepEqual(fakeApi.saveDraft.mock.calls[0], [
			TEST_ID,
			's1',
			{ questionId: Q1, value: 'a' },
			{ keepalive: false },
		])
		assert.equal(lifecycle.getSnapshot().currentQuestionId, Q2)
		assert.equal((readJson(storage, KEYS.wal) as { position: string }).position, Q2)
	})

	test('скрытие вкладки отправляет неподтверждённое без ожидания дебаунса', async () => {
		const { lifecycle, fakeApi, page } = await activeLifecycle()
		lifecycle.answer(Q1, 'a')
		page.emit('hidden')
		await settle()
		assert.deepEqual(fakeApi.savedBodies(), [
			{ questionId: Q1, value: 'a' },
			{ telemetry: { [Q1]: { timeSpentMs: 0, focusLossCount: 1, visitCount: 1 } } },
		])
	})
})

describe('индикатор сохранения', () => {
	test('ответ подтверждён за 900 мс — saved всё время', async () => {
		const fakeApi = fakeAttemptApi([sessionOf('s1')])
		const reply = deferred<typeof OK>()
		fakeApi.queueSave(reply)
		const { lifecycle } = await activeLifecycle(fakeApi)
		const seen = new Set<string | null>()
		lifecycle.subscribe(() => seen.add(lifecycle.getSnapshot().saveIndicator))
		lifecycle.answer(Q1, 'a')
		assert.equal(lifecycle.getSnapshot().saveIndicator, 'saved')
		await vi.advanceTimersByTimeAsync(900)
		assert.equal(lifecycle.getSnapshot().saveIndicator, 'saved')
		reply.resolve(OK)
		await settle()
		await vi.advanceTimersByTimeAsync(5000)
		assert.equal(lifecycle.getSnapshot().saveIndicator, 'saved')
		assert.deepEqual([...seen], ['saved'])
	})

	test('подтверждение задержано — saving ровно с 1500 мс после ответа', async () => {
		const fakeApi = fakeAttemptApi([sessionOf('s1')])
		const reply = deferred<typeof OK>()
		fakeApi.queueSave(reply)
		const { lifecycle } = await activeLifecycle(fakeApi)
		const listener = vi.fn()
		lifecycle.subscribe(listener)
		lifecycle.answer(Q1, 'a')
		await vi.advanceTimersByTimeAsync(1499)
		assert.equal(lifecycle.getSnapshot().saveIndicator, 'saved')
		const calls = listener.mock.calls.length
		await vi.advanceTimersByTimeAsync(1)
		assert.ok(listener.mock.calls.length > calls)
		assert.equal(lifecycle.getSnapshot().saveIndicator, 'saving')
		reply.resolve(OK)
		await settle()
		assert.equal(lifecycle.getSnapshot().saveIndicator, 'saved')
	})

	test('первый сбой — offline сразу, успешный повтор — saved сразу', async () => {
		const fakeApi = fakeAttemptApi([sessionOf('s1')])
		fakeApi.queueSave(NETWORK)
		const { lifecycle } = await activeLifecycle(fakeApi)
		lifecycle.answer(Q1, 'a')
		await vi.advanceTimersByTimeAsync(600)
		assert.equal(lifecycle.getSnapshot().saveIndicator, 'offline')
		await vi.advanceTimersByTimeAsync(999)
		assert.equal(lifecycle.getSnapshot().saveIndicator, 'offline')
		await vi.advanceTimersByTimeAsync(1)
		assert.equal(lifecycle.getSnapshot().saveIndicator, 'saved')
	})

	test('вне фазы active индикатора нет', async () => {
		const { lifecycle } = setupLifecycle({ timeLimitMinutes: 30 })
		lifecycle.init()
		await settle()
		assert.equal(lifecycle.getSnapshot().phase, 'awaitingStart')
		assert.equal(lifecycle.getSnapshot().saveIndicator, null)
	})

	test('ревью C-04: без сессии ответ даёт offline и не отправляется, без ответов — saved', async () => {
		const fakeApi = fakeAttemptApi([new Error('network')])
		const { lifecycle } = await activeLifecycle(fakeApi)
		assert.equal(lifecycle.getSnapshot().phase, 'active')
		assert.equal(lifecycle.getSnapshot().saveIndicator, 'saved')
		lifecycle.answer(Q1, 'a')
		assert.equal(lifecycle.getSnapshot().saveIndicator, 'offline')
		await vi.advanceTimersByTimeAsync(10_000)
		assert.equal(fakeApi.saveDraft.mock.calls.length, 0)
	})
})

describe('ревью C-01: navigate вне фазы active', () => {
	test('403 на /start: navigate меняет только currentQuestionId, WAL и сеть не трогаются', async () => {
		const storage = memoryStorage({
			[KEYS.session]: cachedSession('s1'),
			[KEYS.wal]: walRecord({ answers: { [Q1]: 'a' }, pending: [Q1], position: Q1 }),
		})
		const fakeApi = fakeAttemptApi([requestError(403)])
		const { lifecycle } = setupLifecycle({ storage, api: fakeApi })
		lifecycle.init()
		await settle()
		assert.equal(lifecycle.getSnapshot().phase, 'blocked')
		assert.equal(lifecycle.getSnapshot().saveIndicator, null)
		const before = storage.data.get(KEYS.wal)
		lifecycle.navigate(Q2)
		await vi.advanceTimersByTimeAsync(10_000)
		assert.equal(lifecycle.getSnapshot().currentQuestionId, Q2)
		assert.equal(storage.data.get(KEYS.wal), before)
		assert.equal(fakeApi.saveDraft.mock.calls.length, 0)
	})
})

import { ATTEMPT_GRACE_PERIOD_MINUTES, SUBMIT_ERROR_CODES } from '@bio-exam/exam-core'

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test, vi } from 'vitest'

import { storedClientAttemptId } from '../client-attempt-id'
import {
	ATTEMPT_ID,
	attemptViewOf,
	deferred,
	fakeAttemptApi,
	KEYS,
	memoryStorage,
	presentKeys,
	Q1,
	Q2,
	Q3,
	readJson,
	requestError,
	seededStorage,
	sessionOf,
	settle,
	setupLifecycle,
	START,
} from './testing'

const LIMIT = 10
const BEYOND_GRACE = START + (LIMIT + ATTEMPT_GRACE_PERIOD_MINUTES + 30) * 60_000
const WITHIN_GRACE = START + (LIMIT + ATTEMPT_GRACE_PERIOD_MINUTES) * 60_000 - 1000

beforeEach(() => {
	vi.useFakeTimers()
	vi.setSystemTime(START)
})

afterEach(() => {
	vi.useRealTimers()
})

function noticeKinds(onNotice: { mock: { calls: unknown[][] } }): string[] {
	return onNotice.mock.calls.map((call) => (call[0] as { kind: string }).kind)
}

function resubmitStorage(input: { frozen?: boolean } = {}) {
	return seededStorage({
		session: { sessionId: 's1' },
		clientAttempt: { sessionId: 's1', clientAttemptId: 'c1' },
		wal: { sessionId: 's1', answers: { [Q1]: 'a' }, pending: [] },
		frozen: input.frozen,
	})
}

describe('восстановление: сначала submit с сохранённым clientAttemptId', () => {
	test('200: submit с c1 и ответами WAL до любого /start, фаза submitted, уведомление, ключи удалены', async () => {
		const storage = resubmitStorage()
		const fakeApi = fakeAttemptApi([sessionOf('s1')])
		const view = attemptViewOf()
		const pendingSubmit = deferred<typeof view | Error>()
		fakeApi.queueSubmit(pendingSubmit)
		const { lifecycle, onNotice } = setupLifecycle({ storage, api: fakeApi, timeLimitMinutes: LIMIT })
		lifecycle.init()
		await settle()
		assert.equal(lifecycle.getSnapshot().phase, 'submitting')
		assert.equal(fakeApi.start.mock.calls.length, 0)
		assert.deepEqual(fakeApi.submitRequests(), [
			{ sessionId: 's1', clientAttemptId: 'c1', answers: { [Q1]: 'a' }, telemetry: {} },
		])
		pendingSubmit.resolve(view)
		await settle()
		assert.equal(lifecycle.getSnapshot().phase, 'submitted')
		assert.deepEqual(lifecycle.getSnapshot().result, view)
		assert.deepEqual(onNotice.mock.calls.at(-1)?.[0], { kind: 'submitted', result: view })
		assert.deepEqual(presentKeys(storage), [])
		assert.equal(fakeApi.start.mock.calls.length, 0)
	})

	test('422 TIME_EXPIRED: blocked time-expired, /start не вызывался', async () => {
		const storage = resubmitStorage()
		const fakeApi = fakeAttemptApi([sessionOf('s1')])
		fakeApi.queueSubmit(requestError(422, SUBMIT_ERROR_CODES.timeExpired))
		const { lifecycle } = setupLifecycle({ storage, api: fakeApi, timeLimitMinutes: LIMIT })
		lifecycle.init()
		await settle()
		assert.equal(lifecycle.getSnapshot().phase, 'blocked')
		assert.equal(lifecycle.getSnapshot().blockReason, 'time-expired')
		assert.equal(fakeApi.start.mock.calls.length, 0)
		assert.deepEqual(presentKeys(storage), [])
	})

	test('409: already-submitted с id попытки', async () => {
		const storage = resubmitStorage()
		const fakeApi = fakeAttemptApi([sessionOf('s1')])
		fakeApi.queueSubmit(requestError(409, SUBMIT_ERROR_CODES.alreadySubmitted, ATTEMPT_ID))
		const { lifecycle } = setupLifecycle({ storage, api: fakeApi, timeLimitMinutes: LIMIT })
		lifecycle.init()
		await settle()
		assert.equal(lifecycle.getSnapshot().blockReason, 'already-submitted')
		assert.equal(lifecycle.getSnapshot().alreadySubmittedAttemptId, ATTEMPT_ID)
		assert.equal(fakeApi.start.mock.calls.length, 0)
		assert.deepEqual(presentKeys(storage), [])
	})

	test('403: submit-not-assigned, ключи на месте', async () => {
		const storage = resubmitStorage()
		const fakeApi = fakeAttemptApi([sessionOf('s1')])
		fakeApi.queueSubmit(requestError(403))
		const { lifecycle } = setupLifecycle({ storage, api: fakeApi, timeLimitMinutes: LIMIT })
		lifecycle.init()
		await settle()
		assert.equal(lifecycle.getSnapshot().phase, 'blocked')
		assert.equal(lifecycle.getSnapshot().blockReason, 'submit-not-assigned')
		assert.equal(fakeApi.start.mock.calls.length, 0)
		assert.deepEqual(presentKeys(storage), ['session', 'wal', 'clientAttemptId'])
	})

	test('404: not-found, WAL с sessionId null и всеми ответами в pending', async () => {
		const storage = resubmitStorage()
		const fakeApi = fakeAttemptApi([sessionOf('s1')])
		fakeApi.queueSubmit(requestError(404))
		const { lifecycle } = setupLifecycle({ storage, api: fakeApi, timeLimitMinutes: LIMIT })
		lifecycle.init()
		await settle()
		assert.equal(lifecycle.getSnapshot().blockReason, 'not-found')
		assert.equal(fakeApi.start.mock.calls.length, 0)
		assert.deepEqual(presentKeys(storage), ['wal'])
		const wal = readJson(storage, KEYS.wal) as { sessionId: string | null; answers: object; pending: string[] }
		assert.equal(wal.sessionId, null)
		assert.deepEqual(wal.answers, { [Q1]: 'a' })
		assert.deepEqual(wal.pending, [Q1])
	})

	for (const [label, failure] of [
		['503', () => requestError(503)],
		['сбой сети', () => new TypeError('Failed to fetch')],
		['400', () => requestError(400)],
	] as const) {
		test(`${label}: обычный путь /start s1, фаза active с ответами, следующий submit с тем же c1`, async () => {
			const storage = resubmitStorage()
			const fakeApi = fakeAttemptApi([sessionOf('s1', undefined, { answers: { [Q1]: 'a' } })])
			fakeApi.queueSubmit(failure())
			const { lifecycle, onNotice } = setupLifecycle({ storage, api: fakeApi, timeLimitMinutes: LIMIT })
			lifecycle.init()
			await settle()
			assert.equal(fakeApi.start.mock.calls.length, 1)
			assert.equal(lifecycle.getSnapshot().phase, 'active')
			assert.equal(lifecycle.getSnapshot().blockReason, null)
			assert.deepEqual(lifecycle.getSnapshot().answers, { [Q1]: 'a' })
			assert.deepEqual(noticeKinds(onNotice), ['session-restored'])
			assert.equal(lifecycle.getSnapshot().submitFailed, true)
			assert.equal(storedClientAttemptId(storage, KEYS.clientAttemptId, 's1'), 'c1')
			fakeApi.queueSubmit(attemptViewOf())
			await lifecycle.submit()
			assert.deepEqual(
				fakeApi.submitRequests().map((request) => request.clientAttemptId),
				['c1', 'c1']
			)
			assert.equal(lifecycle.getSnapshot().phase, 'submitted')
		})
	}

	test('решение пользователя 2026-10-04: ручная отправка упала сетью, ответ после неё не снимает c1, перезагрузка досылает оба ответа', async () => {
		const storage = memoryStorage()
		const fakeApi = fakeAttemptApi([sessionOf('s1')])
		const first = setupLifecycle({ storage, api: fakeApi, createId: () => 'c1' })
		first.lifecycle.init()
		await settle()
		first.lifecycle.answer(Q1, 'a')
		fakeApi.queueSubmit(new TypeError('Failed to fetch'))
		await first.lifecycle.submit()
		assert.equal(first.lifecycle.getSnapshot().submitFailed, true)
		first.lifecycle.answer(Q2, 'b')
		assert.equal(storedClientAttemptId(storage, KEYS.clientAttemptId, 's1'), 'c1')
		vi.clearAllTimers()

		const startsBefore = fakeApi.start.mock.calls.length
		const view = attemptViewOf()
		fakeApi.queueSubmit(view)
		const second = setupLifecycle({ storage, api: fakeApi, createId: () => 'other' })
		second.lifecycle.init()
		await settle()
		assert.equal(fakeApi.start.mock.calls.length, startsBefore)
		assert.deepEqual(fakeApi.submitRequests()[1], {
			sessionId: 's1',
			clientAttemptId: 'c1',
			answers: { [Q1]: 'a', [Q2]: 'b' },
			telemetry: { [Q1]: { timeSpentMs: 0, focusLossCount: 0, visitCount: 1 } },
		})
		assert.equal(second.lifecycle.getSnapshot().phase, 'submitted')
		assert.deepEqual(presentKeys(storage), [])
	})
})

describe('восстановление без clientAttemptId: часы клиента только открывают «Начать тест?»', () => {
	function abandonedStorage(input: { frozen?: boolean } = {}) {
		return seededStorage({
			session: { sessionId: 's1' },
			wal: { sessionId: 's1', answers: { [Q1]: 'a' }, pending: [Q1] },
			frozen: input.frozen,
		})
	}

	test('брошенная просроченная s1: awaitingStart без /start и submit, локального 422 нет; confirmStart → s1 → черновик s1 и session-restored', async () => {
		vi.setSystemTime(BEYOND_GRACE)
		const storage = abandonedStorage()
		const fakeApi = fakeAttemptApi([sessionOf('s1', undefined, { answers: { [Q2]: 'server' } })])
		const { lifecycle, onNotice } = setupLifecycle({ storage, api: fakeApi, timeLimitMinutes: LIMIT })
		lifecycle.init()
		await settle()
		assert.equal(lifecycle.getSnapshot().phase, 'awaitingStart')
		assert.equal(lifecycle.getSnapshot().blockReason, null)
		assert.equal(fakeApi.start.mock.calls.length, 0)
		assert.equal(fakeApi.submit.mock.calls.length, 0)
		assert.deepEqual(noticeKinds(onNotice), [])
		await lifecycle.confirmStart()
		assert.equal(fakeApi.start.mock.calls.length, 1)
		assert.equal(lifecycle.getSnapshot().phase, 'active')
		assert.deepEqual(lifecycle.getSnapshot().answers, { [Q1]: 'a', [Q2]: 'server' })
		assert.deepEqual(noticeKinds(onNotice), ['session-restored'])
	})

	test('брошенная просроченная s1: confirmStart → s2 → черновик s2, WAL s1 удалён, уведомлений нет', async () => {
		vi.setSystemTime(BEYOND_GRACE)
		const storage = abandonedStorage()
		const fakeApi = fakeAttemptApi([sessionOf('s2', undefined, { answers: { [Q3]: 'fresh' } })])
		const { lifecycle, onNotice } = setupLifecycle({ storage, api: fakeApi, timeLimitMinutes: LIMIT })
		lifecycle.init()
		await settle()
		await lifecycle.confirmStart()
		assert.equal(lifecycle.getSnapshot().phase, 'active')
		assert.deepEqual(lifecycle.getSnapshot().answers, { [Q3]: 'fresh' })
		const wal = readJson(storage, KEYS.wal) as { sessionId: string; answers: object }
		assert.equal(wal.sessionId, 's2')
		assert.deepEqual(wal.answers, { [Q3]: 'fresh' })
		assert.deepEqual(readJson(storage, KEYS.session), { sessionId: 's2', startedAt: sessionOf('s2').startedAt })
		assert.deepEqual(noticeKinds(onNotice), [])
	})

	test('часы в пределах лимита и льготы: /start при init, s1 → session-restored и автосдача по истёкшему лимиту', async () => {
		vi.setSystemTime(WITHIN_GRACE)
		const storage = abandonedStorage()
		const fakeApi = fakeAttemptApi([sessionOf('s1')])
		const pendingSubmit = deferred<ReturnType<typeof attemptViewOf> | Error>()
		fakeApi.queueSubmit(pendingSubmit)
		const { lifecycle, onNotice } = setupLifecycle({ storage, api: fakeApi, timeLimitMinutes: LIMIT })
		lifecycle.init()
		await settle()
		await vi.advanceTimersByTimeAsync(1000)
		assert.equal(fakeApi.start.mock.calls.length, 1)
		assert.equal(lifecycle.getSnapshot().phase, 'autoSubmitting')
		assert.equal(fakeApi.submit.mock.calls.length, 1)
		assert.equal(fakeApi.submitRequests()[0]?.sessionId, 's1')
		assert.deepEqual(noticeKinds(onNotice), ['session-restored'])
	})

	test('часы в пределах лимита и льготы: /start вернул s2 → session-replaced, ответы из черновика s2', async () => {
		vi.setSystemTime(WITHIN_GRACE)
		const storage = abandonedStorage()
		const fakeApi = fakeAttemptApi([
			sessionOf('s2', new Date(WITHIN_GRACE).toISOString(), { answers: { [Q2]: 'other' } }),
		])
		const { lifecycle, onNotice } = setupLifecycle({ storage, api: fakeApi, timeLimitMinutes: LIMIT })
		lifecycle.init()
		await settle()
		await vi.advanceTimersByTimeAsync(1000)
		assert.equal(lifecycle.getSnapshot().phase, 'active')
		assert.equal(fakeApi.submit.mock.calls.length, 0)
		assert.deepEqual(lifecycle.getSnapshot().answers, { [Q2]: 'other' })
		assert.deepEqual(noticeKinds(onNotice), ['session-replaced'])
	})

	test('frozenKey, часы в пределах: /start вернул s1 → autoSubmitting и submit без действий пользователя, 200 → submitted', async () => {
		vi.setSystemTime(WITHIN_GRACE)
		const storage = abandonedStorage({ frozen: true })
		const fakeApi = fakeAttemptApi([sessionOf('s1')])
		const view = attemptViewOf()
		const pendingSubmit = deferred<typeof view | Error>()
		fakeApi.queueSubmit(pendingSubmit)
		const { lifecycle } = setupLifecycle({ storage, api: fakeApi, timeLimitMinutes: LIMIT })
		lifecycle.init()
		await settle()
		assert.equal(lifecycle.getSnapshot().phase, 'autoSubmitting')
		assert.equal(lifecycle.getSnapshot().interactionDisabled, true)
		assert.equal(fakeApi.submit.mock.calls.length, 1)
		assert.equal(fakeApi.submitRequests()[0]?.sessionId, 's1')
		assert.deepEqual(fakeApi.submitRequests()[0]?.answers, { [Q1]: 'a' })
		pendingSubmit.resolve(view)
		await settle()
		assert.deepEqual(presentKeys(storage), [])
		await vi.advanceTimersByTimeAsync(1500)
		assert.equal(lifecycle.getSnapshot().phase, 'submitted')
		assert.deepEqual(lifecycle.getSnapshot().result, view)
	})

	test('ревью P-04: frozenKey, часы в пределах, /start вернул s2 → frozenKey удалён, active с черновиком s2, submit не вызван', async () => {
		vi.setSystemTime(WITHIN_GRACE)
		const storage = abandonedStorage({ frozen: true })
		const fakeApi = fakeAttemptApi([
			sessionOf('s2', new Date(WITHIN_GRACE).toISOString(), { answers: { [Q2]: 'other' } }),
		])
		const { lifecycle } = setupLifecycle({ storage, api: fakeApi, timeLimitMinutes: LIMIT })
		lifecycle.init()
		await settle()
		await vi.advanceTimersByTimeAsync(2000)
		assert.equal(lifecycle.getSnapshot().phase, 'active')
		assert.deepEqual(lifecycle.getSnapshot().answers, { [Q2]: 'other' })
		assert.equal(storage.data.has(KEYS.frozen), false)
		assert.equal(fakeApi.submit.mock.calls.length, 0)
	})

	test('frozenKey, часы за лимитом и льготой: frozenKey удалён, awaitingStart, /start не вызван', async () => {
		vi.setSystemTime(BEYOND_GRACE)
		const storage = abandonedStorage({ frozen: true })
		const fakeApi = fakeAttemptApi([sessionOf('s1')])
		const { lifecycle } = setupLifecycle({ storage, api: fakeApi, timeLimitMinutes: LIMIT })
		lifecycle.init()
		await settle()
		assert.equal(lifecycle.getSnapshot().phase, 'awaitingStart')
		assert.equal(storage.data.has(KEYS.frozen), false)
		assert.equal(fakeApi.start.mock.calls.length, 0)
		assert.equal(fakeApi.submit.mock.calls.length, 0)
	})

	test('frozenKey и сохранённый clientAttemptId: повтор submit в фазе autoSubmitting, даже за лимитом по часам клиента', async () => {
		vi.setSystemTime(BEYOND_GRACE)
		const storage = resubmitStorage({ frozen: true })
		const fakeApi = fakeAttemptApi([sessionOf('s1')])
		const view = attemptViewOf()
		const pendingSubmit = deferred<typeof view | Error>()
		fakeApi.queueSubmit(pendingSubmit)
		const { lifecycle } = setupLifecycle({ storage, api: fakeApi, timeLimitMinutes: LIMIT })
		lifecycle.init()
		await settle()
		assert.equal(lifecycle.getSnapshot().phase, 'autoSubmitting')
		assert.equal(fakeApi.start.mock.calls.length, 0)
		assert.equal(fakeApi.submitRequests()[0]?.clientAttemptId, 'c1')
		pendingSubmit.resolve(view)
		await vi.advanceTimersByTimeAsync(1500)
		assert.equal(lifecycle.getSnapshot().phase, 'submitted')
	})

	test('frozenKey и сохранённый clientAttemptId, повтор упал с 500: frozenKey удалён, обычный путь /start', async () => {
		const storage = resubmitStorage({ frozen: true })
		const fakeApi = fakeAttemptApi([sessionOf('s1')])
		fakeApi.queueSubmit(requestError(500))
		const { lifecycle } = setupLifecycle({ storage, api: fakeApi, timeLimitMinutes: LIMIT })
		lifecycle.init()
		await settle()
		assert.equal(storage.data.has(KEYS.frozen), false)
		assert.equal(fakeApi.start.mock.calls.length, 1)
		assert.equal(lifecycle.getSnapshot().phase, 'active')
		assert.equal(lifecycle.getSnapshot().submitFailed, true)
		assert.equal(storedClientAttemptId(storage, KEYS.clientAttemptId, 's1'), 'c1')
	})

	test('CR-01: frozenKey, повтор упал с 500, /start вернул другую s2 → active без плашки сбоя отправки', async () => {
		const storage = resubmitStorage({ frozen: true })
		const fakeApi = fakeAttemptApi([sessionOf('s2')])
		fakeApi.queueSubmit(requestError(500))
		const { lifecycle, onNotice } = setupLifecycle({ storage, api: fakeApi, timeLimitMinutes: LIMIT })
		lifecycle.init()
		await settle()
		assert.equal(fakeApi.start.mock.calls.length, 1)
		assert.equal(lifecycle.getSnapshot().phase, 'active')
		assert.equal(lifecycle.getSnapshot().submitFailed, false)
		assert.deepEqual(noticeKinds(onNotice), ['session-replaced'])
	})

	test('CR-01: frozenKey, повтор упал сетью, /start тоже упал сетью → active с кэшированной s1 и плашкой сбоя отправки', async () => {
		const storage = resubmitStorage({ frozen: true })
		const fakeApi = fakeAttemptApi([new TypeError('Failed to fetch')])
		fakeApi.queueSubmit(new TypeError('Failed to fetch'))
		const { lifecycle } = setupLifecycle({ storage, api: fakeApi, timeLimitMinutes: LIMIT })
		lifecycle.init()
		await settle()
		assert.equal(fakeApi.start.mock.calls.length, 1)
		assert.equal(lifecycle.getSnapshot().phase, 'active')
		assert.equal(lifecycle.getSnapshot().submitFailed, true)
	})
})

describe('CR-05: «полное время» только при новой сессии', () => {
	async function afterTimeExpiredRetake() {
		const fakeApi = fakeAttemptApi([sessionOf('s1')])
		const setup = setupLifecycle({ api: fakeApi, timeLimitMinutes: LIMIT })
		setup.lifecycle.init()
		await setup.lifecycle.confirmStart()
		setup.lifecycle.answer(Q1, 'a')
		fakeApi.queueSubmit(requestError(422, SUBMIT_ERROR_CODES.timeExpired))
		await setup.lifecycle.submit()
		setup.lifecycle.retake()
		setup.onNotice.mockClear()
		return { ...setup, fakeApi }
	}

	test('после 422 и retake: /start вернул ту же s1 → ответы и позиция из черновика s1, session-restored', async () => {
		const { lifecycle, fakeApi, onNotice } = await afterTimeExpiredRetake()
		assert.equal(lifecycle.getSnapshot().phase, 'awaitingStart')
		fakeApi.queueStart(sessionOf('s1', undefined, { answers: { [Q1]: 'a' }, lastQuestionId: Q2 }))
		await lifecycle.confirmStart()
		assert.equal(lifecycle.getSnapshot().phase, 'active')
		assert.deepEqual(lifecycle.getSnapshot().answers, { [Q1]: 'a' })
		assert.equal(lifecycle.getSnapshot().currentQuestionId, Q2)
		assert.deepEqual(noticeKinds(onNotice), ['session-restored'])
	})

	test('после 422 и retake: /start вернул новую s2 → чистый проход без уведомлений', async () => {
		const { lifecycle, fakeApi, onNotice, storage } = await afterTimeExpiredRetake()
		fakeApi.queueStart(sessionOf('s2'))
		await lifecycle.confirmStart()
		assert.equal(lifecycle.getSnapshot().phase, 'active')
		assert.deepEqual(lifecycle.getSnapshot().answers, {})
		assert.equal(lifecycle.getSnapshot().currentQuestionId, Q1)
		assert.deepEqual(noticeKinds(onNotice), [])
		assert.equal((readJson(storage, KEYS.session) as { sessionId: string }).sessionId, 's2')
	})

	test('тест без лимита: retake после 422, /start вернул ту же s1 → черновик s1 и session-restored', async () => {
		const fakeApi = fakeAttemptApi([sessionOf('s1')])
		const { lifecycle, onNotice } = setupLifecycle({ api: fakeApi })
		lifecycle.init()
		await settle()
		lifecycle.answer(Q1, 'a')
		fakeApi.queueSubmit(requestError(422, SUBMIT_ERROR_CODES.timeExpired))
		await lifecycle.submit()
		onNotice.mockClear()
		fakeApi.queueStart(sessionOf('s1', undefined, { answers: { [Q1]: 'a' } }))
		lifecycle.retake()
		await settle()
		assert.equal(lifecycle.getSnapshot().phase, 'active')
		assert.deepEqual(lifecycle.getSnapshot().answers, { [Q1]: 'a' })
		assert.deepEqual(noticeKinds(onNotice), ['session-restored'])
	})
})

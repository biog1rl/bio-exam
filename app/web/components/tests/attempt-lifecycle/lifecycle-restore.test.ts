import { ATTEMPT_GRACE_PERIOD_MINUTES, SUBMIT_ERROR_CODES } from '@bio-exam/exam-core'
import type { AttemptView, SessionFate } from '@bio-exam/exam-core'

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
	STARTED_AT,
	TEST_ID,
	textResult,
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

	test.each(
		[
			{
				name: '422 TIME_EXPIRED: blocked time-expired, /start не вызывался, WAL остаётся до «Начать заново»',
				failure: () => requestError(422, SUBMIT_ERROR_CODES.timeExpired),
				blockReason: 'time-expired',
				attemptId: undefined as string | undefined,
				keys: ['wal'] as string[],
				detachedWal: false,
			},
			{
				name: '409: already-submitted с id попытки',
				failure: () => requestError(409, SUBMIT_ERROR_CODES.alreadySubmitted, ATTEMPT_ID),
				blockReason: 'already-submitted',
				attemptId: ATTEMPT_ID as string | undefined,
				keys: [] as string[],
				detachedWal: false,
			},
			{
				name: '403: submit-not-assigned, ключи на месте',
				failure: () => requestError(403),
				blockReason: 'submit-not-assigned',
				attemptId: undefined as string | undefined,
				keys: ['session', 'wal', 'clientAttemptId'],
				detachedWal: false,
			},
			{
				name: '404: not-found, WAL с sessionId null и всеми ответами в pending',
				failure: () => requestError(404),
				blockReason: 'not-found',
				attemptId: undefined as string | undefined,
				keys: ['wal'],
				detachedWal: true,
			},
		].map((row): [string, typeof row] => [row.name, row])
	)('%s', async (_name, { failure, blockReason, attemptId, keys, detachedWal }) => {
		const storage = resubmitStorage()
		const fakeApi = fakeAttemptApi([sessionOf('s1')])
		fakeApi.queueSubmit(failure())
		const { lifecycle } = setupLifecycle({ storage, api: fakeApi, timeLimitMinutes: LIMIT })
		lifecycle.init()
		await settle()
		assert.equal(lifecycle.getSnapshot().phase, 'blocked')
		assert.equal(lifecycle.getSnapshot().blockReason, blockReason)
		if (attemptId !== undefined) assert.equal(lifecycle.getSnapshot().alreadySubmittedAttemptId, attemptId)
		assert.equal(fakeApi.start.mock.calls.length, 0)
		assert.deepEqual(presentKeys(storage), keys)
		if (detachedWal) {
			const wal = readJson(storage, KEYS.wal) as { sessionId: string | null; answers: object; pending: string[] }
			assert.equal(wal.sessionId, null)
			assert.deepEqual(wal.answers, { [Q1]: 'a' })
			assert.deepEqual(wal.pending, [Q1])
		}
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

describe('TIME-06: судьба сессии до /start', () => {
	const IN_TIME = START + 60_000

	function serverNow(): string {
		return new Date(Date.now()).toISOString()
	}

	function submittedFate(submitSource: 'deadline' | 'client', attempt: AttemptView = attemptViewOf()): SessionFate {
		return {
			state: 'submitted',
			attemptId: ATTEMPT_ID,
			submitSource,
			uploadClosesAt: null,
			serverNow: serverNow(),
			attempt,
		}
	}

	function openFate(now: string = serverNow()): SessionFate {
		return { state: 'open', sessionId: 's1', startedAt: STARTED_AT, serverNow: now }
	}

	function expiredFate(): SessionFate {
		return { state: 'expired', serverNow: serverNow() }
	}

	function cachedStorage(answers: Record<string, unknown> = { [Q1]: 'набрано' }, pending?: string[]) {
		return seededStorage({ session: { sessionId: 's1' }, wal: { sessionId: 's1', answers, pending } })
	}

	test('трассер: submitted + deadline, текст WAL совпал с попыткой → «Ответ принят» без /start, ключей нет', async () => {
		vi.setSystemTime(WITHIN_GRACE)
		const storage = cachedStorage()
		const view = attemptViewOf(ATTEMPT_ID, { results: [textResult(Q1, 'набрано')] })
		const fakeApi = fakeAttemptApi([sessionOf('s2')], { fates: [submittedFate('deadline', view)] })
		const { lifecycle, onNotice } = setupLifecycle({
			storage,
			api: fakeApi,
			timeLimitMinutes: LIMIT,
			textQuestionIds: [Q1],
		})
		lifecycle.init()
		await settle()
		const snapshot = lifecycle.getSnapshot()
		assert.equal(snapshot.phase, 'submitted')
		assert.equal(snapshot.acceptedAutomatically, true)
		assert.deepEqual(snapshot.result, view)
		assert.equal(snapshot.unsent, null)
		assert.deepEqual(fakeApi.readSession.mock.calls, [[TEST_ID, 's1']])
		assert.equal(fakeApi.start.mock.calls.length, 0)
		assert.equal(fakeApi.submit.mock.calls.length, 0)
		assert.deepEqual(presentKeys(storage), [])
		assert.deepEqual(noticeKinds(onNotice), ['submitted'])
	})

	test('submitted + deadline, текст WAL расходится с попыткой → пометка в снимке и запись unsent', async () => {
		vi.setSystemTime(WITHIN_GRACE)
		const storage = cachedStorage({ [Q1]: 'набрано полностью' })
		const view = attemptViewOf(ATTEMPT_ID, { results: [textResult(Q1, 'наб')] })
		const fakeApi = fakeAttemptApi([sessionOf('s2')], { fates: [submittedFate('deadline', view)] })
		const { lifecycle } = setupLifecycle({ storage, api: fakeApi, timeLimitMinutes: LIMIT, textQuestionIds: [Q1] })
		lifecycle.init()
		await settle()
		const entries = [{ questionId: Q1, number: 1, text: 'набрано полностью' }]
		assert.equal(lifecycle.getSnapshot().phase, 'submitted')
		assert.deepEqual(lifecycle.getSnapshot().unsent, { certain: true, entries })
		assert.deepEqual(presentKeys(storage), ['unsent'])
		assert.deepEqual(readJson(storage, KEYS.unsent), {
			v: 1,
			testId: TEST_ID,
			attemptId: ATTEMPT_ID,
			certain: true,
			entries,
		})
		assert.equal(fakeApi.start.mock.calls.length, 0)
	})

	test('после «Ответ принят» перезагрузка: «Начать тест?» с пометкой из test-unsent-, старт нового прохождения её стирает', async () => {
		vi.setSystemTime(IN_TIME)
		const entries = [{ questionId: Q1, number: 1, text: 'набрано полностью' }]
		const record = { v: 1, testId: TEST_ID, attemptId: ATTEMPT_ID, certain: true, entries }
		const storage = memoryStorage({ [KEYS.unsent]: JSON.stringify(record) })
		const fakeApi = fakeAttemptApi([sessionOf('s2', new Date(IN_TIME).toISOString())])
		const { lifecycle } = setupLifecycle({ storage, api: fakeApi, timeLimitMinutes: LIMIT, textQuestionIds: [Q1] })
		lifecycle.init()
		await settle()
		assert.equal(lifecycle.getSnapshot().phase, 'awaitingStart')
		assert.deepEqual(lifecycle.getSnapshot().unsent, { certain: true, entries })
		assert.deepEqual(readJson(storage, KEYS.unsent), record)

		await lifecycle.confirmStart()
		await settle()
		assert.equal(lifecycle.getSnapshot().phase, 'active')
		assert.equal(lifecycle.getSnapshot().unsent, null)
		assert.equal(storage.data.has(KEYS.unsent), false)
	})

	test("submitted + 'client' → диалог «Попытка уже сдана», /start не вызван", async () => {
		vi.setSystemTime(IN_TIME)
		const storage = cachedStorage()
		const fakeApi = fakeAttemptApi([sessionOf('s2')], { fates: [submittedFate('client')] })
		const { lifecycle } = setupLifecycle({ storage, api: fakeApi, timeLimitMinutes: LIMIT, textQuestionIds: [Q1] })
		lifecycle.init()
		await settle()
		assert.equal(lifecycle.getSnapshot().phase, 'blocked')
		assert.equal(lifecycle.getSnapshot().blockReason, 'already-submitted')
		assert.equal(lifecycle.getSnapshot().alreadySubmittedAttemptId, ATTEMPT_ID)
		assert.equal(lifecycle.getSnapshot().acceptedAutomatically, false)
		assert.equal(fakeApi.start.mock.calls.length, 0)
		assert.deepEqual(presentKeys(storage), [])
	})

	test("'open' → /start с той же s1, фаза active, session-restored", async () => {
		vi.setSystemTime(IN_TIME)
		const storage = cachedStorage({ [Q1]: 'a' }, [])
		const fakeApi = fakeAttemptApi([sessionOf('s1', undefined, { answers: { [Q1]: 'a' } })], { fates: [openFate()] })
		const { lifecycle, onNotice } = setupLifecycle({ storage, api: fakeApi, timeLimitMinutes: LIMIT })
		lifecycle.init()
		await settle()
		assert.equal(fakeApi.readSession.mock.calls.length, 1)
		assert.equal(fakeApi.start.mock.calls.length, 1)
		assert.equal(lifecycle.getSnapshot().phase, 'active')
		assert.deepEqual(lifecycle.getSnapshot().answers, { [Q1]: 'a' })
		assert.deepEqual(readJson(storage, KEYS.session), { sessionId: 's1', startedAt: STARTED_AT })
		assert.deepEqual(noticeKinds(onNotice), ['session-restored'])
	})

	test.each([
		{ name: 'без textQuestionIds', textQuestionIds: undefined as string[] | undefined, answers: { [Q1]: 'набрано' } },
		{ name: 'в WAL только ответ выбора', textQuestionIds: [Q1], answers: { [Q2]: 'b' } as Record<string, unknown> },
	])("'expired', $name → «Начать тест?» без /start, confirmStart → /start", async ({ textQuestionIds, answers }) => {
		vi.setSystemTime(BEYOND_GRACE)
		const storage = cachedStorage(answers)
		const fakeApi = fakeAttemptApi([sessionOf('s2')], { fates: [expiredFate()] })
		const { lifecycle } = setupLifecycle({ storage, api: fakeApi, timeLimitMinutes: LIMIT, textQuestionIds })
		lifecycle.init()
		await settle()
		assert.equal(lifecycle.getSnapshot().phase, 'awaitingStart')
		assert.equal(lifecycle.getSnapshot().blockReason, null)
		assert.equal(lifecycle.getSnapshot().unsent, null)
		assert.deepEqual(lifecycle.getSnapshot().answers, {})
		assert.equal(fakeApi.start.mock.calls.length, 0)
		await lifecycle.confirmStart()
		assert.equal(fakeApi.start.mock.calls.length, 1)
		assert.equal(lifecycle.getSnapshot().phase, 'active')
	})

	test.each(
		[
			{ failure: () => new TypeError('Failed to fetch'), label: 'сбой сети' },
			{ failure: () => requestError(404), label: '404' },
			{ failure: () => requestError(503), label: '503' },
			{ failure: () => new Error('malformed'), label: 'невалидное тело' },
		].flatMap((row) => [
			{ ...row, clock: 'в пределах льготы', now: IN_TIME, phase: 'active', starts: 1 },
			{ ...row, clock: 'за льготой', now: BEYOND_GRACE, phase: 'awaitingStart', starts: 0 },
		])
	)('чтение судьбы: $label, часы $clock → прежний путь', async ({ failure, now, phase, starts }) => {
		vi.setSystemTime(now)
		const storage = cachedStorage({ [Q2]: 'b' })
		const fakeApi = fakeAttemptApi([sessionOf('s1')], { fates: [failure()] })
		const { lifecycle } = setupLifecycle({ storage, api: fakeApi, timeLimitMinutes: LIMIT, textQuestionIds: [Q1] })
		lifecycle.init()
		await settle()
		assert.equal(fakeApi.readSession.mock.calls.length, 1)
		assert.equal(fakeApi.start.mock.calls.length, starts)
		assert.equal(lifecycle.getSnapshot().phase, phase)
		assert.equal(lifecycle.getSnapshot().blockReason, null)
	})

	test('403 чтения судьбы → blocked start-not-assigned, /start не вызван', async () => {
		vi.setSystemTime(IN_TIME)
		const storage = cachedStorage()
		const fakeApi = fakeAttemptApi([sessionOf('s1')], { fates: [requestError(403)] })
		const { lifecycle } = setupLifecycle({ storage, api: fakeApi, timeLimitMinutes: LIMIT, textQuestionIds: [Q1] })
		lifecycle.init()
		await settle()
		assert.equal(lifecycle.getSnapshot().phase, 'blocked')
		assert.equal(lifecycle.getSnapshot().blockReason, 'start-not-assigned')
		assert.equal(fakeApi.start.mock.calls.length, 0)
	})

	test('тест без лимита с кэшем сессии: readSession не вызван, /start как раньше', async () => {
		const storage = cachedStorage({ [Q1]: 'a' }, [])
		const fakeApi = fakeAttemptApi([sessionOf('s1')], { fates: [openFate()] })
		const { lifecycle } = setupLifecycle({ storage, api: fakeApi })
		lifecycle.init()
		await settle()
		assert.equal(fakeApi.readSession.mock.calls.length, 0)
		assert.equal(fakeApi.start.mock.calls.length, 1)
		assert.equal(lifecycle.getSnapshot().phase, 'active')
	})

	test('сохранённый clientAttemptId: первым идёт submit, readSession не вызван', async () => {
		vi.setSystemTime(IN_TIME)
		const storage = resubmitStorage()
		const fakeApi = fakeAttemptApi([sessionOf('s1')], { fates: [submittedFate('deadline')] })
		const view = attemptViewOf()
		fakeApi.queueSubmit(view)
		const { lifecycle } = setupLifecycle({ storage, api: fakeApi, timeLimitMinutes: LIMIT })
		lifecycle.init()
		await settle()
		assert.equal(fakeApi.submit.mock.calls.length, 1)
		assert.equal(fakeApi.readSession.mock.calls.length, 0)
		assert.equal(fakeApi.start.mock.calls.length, 0)
		assert.equal(lifecycle.getSnapshot().phase, 'submitted')
	})

	test('serverNow судьбы на 5 минут раньше часов устройства → secondsLeft по серверу', async () => {
		vi.setSystemTime(START + 5 * 60_000)
		const storage = cachedStorage({ [Q1]: 'a' }, [])
		const fakeApi = fakeAttemptApi([sessionOf('s1')], { fates: [openFate(STARTED_AT)] })
		const { lifecycle } = setupLifecycle({ storage, api: fakeApi, timeLimitMinutes: LIMIT })
		lifecycle.init()
		await settle()
		assert.equal(lifecycle.getSnapshot().phase, 'active')
		assert.equal(lifecycle.getSnapshot().secondsLeft, LIMIT * 60)
	})
})

describe('R2: судьба expired, запасной путь и замена сессии не стирают текст WAL молча', () => {
	const IN_TIME = START + 60_000
	const TYPED = [{ questionId: Q1, number: 1, text: 'набрано' }]

	function expiredFate(): SessionFate {
		return { state: 'expired', serverNow: new Date(Date.now()).toISOString() }
	}

	function openFate(): SessionFate {
		return { state: 'open', sessionId: 's1', startedAt: STARTED_AT, serverNow: new Date(Date.now()).toISOString() }
	}

	function typedStorage() {
		return seededStorage({ session: { sessionId: 's1' }, wal: { sessionId: 's1', answers: { [Q1]: 'набрано' } } })
	}

	test("'expired' с текстом в WAL → диалог «Время вышло» с пометкой, WAL до «Начать заново», без /start", async () => {
		vi.setSystemTime(BEYOND_GRACE)
		const storage = typedStorage()
		const fakeApi = fakeAttemptApi([sessionOf('s2')], { fates: [expiredFate()] })
		const { lifecycle } = setupLifecycle({ storage, api: fakeApi, timeLimitMinutes: LIMIT, textQuestionIds: [Q1] })
		lifecycle.init()
		await settle()
		assert.equal(lifecycle.getSnapshot().phase, 'blocked')
		assert.equal(lifecycle.getSnapshot().blockReason, 'time-expired')
		assert.deepEqual(lifecycle.getSnapshot().unsent, { certain: true, entries: TYPED })
		assert.deepEqual(presentKeys(storage), ['wal'])
		assert.equal(fakeApi.start.mock.calls.length, 0)
		lifecycle.retake()
		assert.deepEqual(presentKeys(storage), [])
		assert.equal(lifecycle.getSnapshot().phase, 'awaitingStart')
		assert.equal(lifecycle.getSnapshot().unsent, null)
		assert.equal(fakeApi.start.mock.calls.length, 0)
	})

	test.each([
		{ name: 'сбой сети чтения', fates: [new TypeError('Failed to fetch')] as (SessionFate | Error)[] | undefined },
		{ name: 'без readSession', fates: undefined },
	])('$name, часы за льготой, текст в WAL → «Время вышло» с пометкой «могла», без /start', async ({ fates }) => {
		vi.setSystemTime(BEYOND_GRACE)
		const storage = typedStorage()
		const fakeApi = fakeAttemptApi([sessionOf('s2')], { fates })
		const { lifecycle } = setupLifecycle({ storage, api: fakeApi, timeLimitMinutes: LIMIT, textQuestionIds: [Q1] })
		lifecycle.init()
		await settle()
		assert.equal(lifecycle.getSnapshot().phase, 'blocked')
		assert.equal(lifecycle.getSnapshot().blockReason, 'time-expired')
		assert.deepEqual(lifecycle.getSnapshot().unsent, { certain: false, entries: TYPED })
		assert.deepEqual(presentKeys(storage), ['wal'])
		assert.equal(fakeApi.start.mock.calls.length, 0)
	})

	async function replacedSession() {
		vi.setSystemTime(IN_TIME)
		const storage = seededStorage({
			session: { sessionId: 's1' },
			wal: { sessionId: 's1', answers: { [Q1]: 'не дошло', [Q3]: 'дошло' }, pending: [Q1] },
		})
		const fakeApi = fakeAttemptApi([sessionOf('s2', new Date(IN_TIME).toISOString())], { fates: [openFate()] })
		const setup = setupLifecycle({ storage, api: fakeApi, timeLimitMinutes: LIMIT, textQuestionIds: [Q1, Q3] })
		setup.lifecycle.init()
		await settle()
		return { ...setup, fakeApi }
	}

	const CARRIED = [{ questionId: Q1, number: 1, text: 'не дошло' }]

	test('замена сессии: pending-текст s1 переносится в test-unsent- до удаления WAL', async () => {
		const { lifecycle, storage, onNotice } = await replacedSession()
		assert.equal(lifecycle.getSnapshot().phase, 'active')
		assert.deepEqual(noticeKinds(onNotice), ['session-replaced'])
		assert.ok(KEYS.unsent.startsWith('test-unsent-'))
		assert.deepEqual(readJson(storage, KEYS.unsent), {
			v: 1,
			testId: TEST_ID,
			attemptId: null,
			certain: false,
			entries: CARRIED,
		})
		assert.deepEqual(lifecycle.getSnapshot().unsent, { certain: false, entries: CARRIED })
		assert.equal((readJson(storage, KEYS.wal) as { sessionId: string }).sessionId, 's2')
	})

	test('после переноса: ручная сдача s2 → 200, пометка «могла» остаётся в снимке, ключ стёрт; retake обнуляет', async () => {
		const { lifecycle, storage, fakeApi } = await replacedSession()
		fakeApi.queueSubmit(attemptViewOf())
		await lifecycle.submit()
		assert.equal(lifecycle.getSnapshot().phase, 'submitted')
		assert.deepEqual(lifecycle.getSnapshot().unsent, { certain: false, entries: CARRIED })
		assert.equal(storage.data.has(KEYS.unsent), false)
		lifecycle.retake()
		assert.equal(lifecycle.getSnapshot().unsent, null)
	})

	test('после переноса: 409 deadline с пустой своей сверкой оставляет перенесённую пометку и запись', async () => {
		const { lifecycle, storage, fakeApi } = await replacedSession()
		fakeApi.queueSubmit(
			requestError(409, SUBMIT_ERROR_CODES.alreadySubmitted, ATTEMPT_ID, {
				submitSource: 'deadline',
				attempt: attemptViewOf(),
			})
		)
		await lifecycle.submit()
		assert.equal(lifecycle.getSnapshot().phase, 'submitted')
		assert.deepEqual(lifecycle.getSnapshot().unsent, { certain: false, entries: CARRIED })
		assert.equal((readJson(storage, KEYS.unsent) as { attemptId: string | null }).attemptId, null)
	})

	test('WAL чужой сессии без кэша: «Начать тест?» → /start s2 → pending-текст s1 в test-unsent-', async () => {
		vi.setSystemTime(IN_TIME)
		const storage = seededStorage({ wal: { sessionId: 's1', answers: { [Q1]: 'набрано' }, pending: [Q1] } })
		const fakeApi = fakeAttemptApi([sessionOf('s2', new Date(IN_TIME).toISOString())], { fates: [openFate()] })
		const { lifecycle } = setupLifecycle({ storage, api: fakeApi, timeLimitMinutes: LIMIT, textQuestionIds: [Q1] })
		lifecycle.init()
		await settle()
		assert.equal(lifecycle.getSnapshot().phase, 'awaitingStart')
		await lifecycle.confirmStart()
		assert.equal(lifecycle.getSnapshot().phase, 'active')
		assert.equal(fakeApi.readSession.mock.calls.length, 0)
		assert.deepEqual(readJson(storage, KEYS.unsent), {
			v: 1,
			testId: TEST_ID,
			attemptId: null,
			certain: false,
			entries: TYPED,
		})
		assert.deepEqual(lifecycle.getSnapshot().unsent, { certain: false, entries: TYPED })
		assert.equal((readJson(storage, KEYS.wal) as { sessionId: string }).sessionId, 's2')
	})
})

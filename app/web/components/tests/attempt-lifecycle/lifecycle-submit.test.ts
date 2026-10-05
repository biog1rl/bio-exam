import { SUBMIT_ERROR_CODES } from '@bio-exam/exam-core'

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test, vi } from 'vitest'

import {
	ATTEMPT_ID,
	attemptViewOf,
	deferred,
	fakeAttemptApi,
	KEYS,
	memoryStorage,
	OK,
	presentKeys,
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
	TEST_ID,
} from './testing'

async function activeWithAnswer(input: Parameters<typeof setupLifecycle>[0] = {}) {
	const setup = setupLifecycle(input)
	setup.lifecycle.init()
	await settle()
	setup.lifecycle.answer(Q1, 'a')
	return setup
}

beforeEach(() => {
	vi.useFakeTimers()
	vi.setSystemTime(START)
})

afterEach(() => {
	vi.useRealTimers()
})

describe('отправка через модуль', () => {
	test('трассер: answer → submit → 200: фаза submitted, результат, уведомление, ключи удалены', async () => {
		const { lifecycle, storage, fakeApi, onNotice } = setupLifecycle()
		const view = attemptViewOf()
		const pendingSubmit = deferred<typeof view | Error>()
		fakeApi.queueSubmit(pendingSubmit)
		lifecycle.init()
		await settle()
		lifecycle.answer(Q1, 'a')
		const submitting = lifecycle.submit()
		await settle()
		assert.equal(lifecycle.getSnapshot().phase, 'submitting')
		assert.equal(lifecycle.getSnapshot().interactionDisabled, true)
		assert.equal(fakeApi.submit.mock.calls.length, 1)
		assert.equal(fakeApi.submit.mock.calls[0]?.[0], TEST_ID)
		assert.deepEqual(fakeApi.submitRequests()[0], {
			sessionId: 's1',
			clientAttemptId: 'client-1',
			answers: { [Q1]: 'a' },
			telemetry: { [Q1]: { timeSpentMs: 0, focusLossCount: 0, visitCount: 1 } },
		})
		pendingSubmit.resolve(view)
		await submitting
		const snapshot = lifecycle.getSnapshot()
		assert.equal(snapshot.phase, 'submitted')
		assert.deepEqual(snapshot.result, view)
		assert.equal(snapshot.interactionDisabled, true)
		assert.equal(snapshot.saveIndicator, null)
		assert.deepEqual(onNotice.mock.calls.at(-1)?.[0], { kind: 'submitted', result: view })
		assert.deepEqual(presentKeys(storage), [])
	})

	test('PATCH, начатый до отправки и разрешённый после 200, не меняет снимок и не пишет WAL; answer после сдачи игнорируется', async () => {
		const { lifecycle, storage, fakeApi } = setupLifecycle()
		const patch = deferred<typeof OK>()
		fakeApi.queueSave(patch)
		fakeApi.queueSubmit(attemptViewOf())
		lifecycle.init()
		await settle()
		lifecycle.answer(Q1, 'a')
		await vi.advanceTimersByTimeAsync(600)
		assert.equal(fakeApi.saveDraft.mock.calls.length, 1)
		await lifecycle.submit()
		const before = lifecycle.getSnapshot()
		assert.equal(before.phase, 'submitted')
		patch.resolve(OK)
		await settle()
		assert.deepEqual(lifecycle.getSnapshot(), before)
		assert.equal(storage.data.has(KEYS.wal), false)
		lifecycle.answer(Q2, 'b')
		assert.deepEqual(lifecycle.getSnapshot().answers, { [Q1]: 'a' })
		assert.equal(storage.data.has(KEYS.wal), false)
		await vi.advanceTimersByTimeAsync(10_000)
		assert.equal(fakeApi.saveDraft.mock.calls.length, 1)
	})

	test('ревью C-01: после 200 navigate меняет только вопрос, WAL не создаётся, saveDraft не вызывается', async () => {
		const { lifecycle, storage, fakeApi } = setupLifecycle()
		fakeApi.queueSubmit(attemptViewOf())
		lifecycle.init()
		await settle()
		lifecycle.answer(Q1, 'a')
		await lifecycle.submit()
		lifecycle.navigate(Q2)
		await vi.advanceTimersByTimeAsync(10_000)
		assert.equal(lifecycle.getSnapshot().currentQuestionId, Q2)
		assert.equal(storage.data.has(KEYS.wal), false)
		assert.equal(fakeApi.saveDraft.mock.calls.length, 0)
	})

	test('CR-01(а): автосдача 200 — ключи удалены до паузы, showTimeUp 1500 мс, затем submitted', async () => {
		const { lifecycle, storage, fakeApi, onNotice } = setupLifecycle()
		const view = attemptViewOf()
		const pendingSubmit = deferred<typeof view | Error>()
		fakeApi.queueSubmit(pendingSubmit)
		lifecycle.init()
		await settle()
		lifecycle.answer(Q1, 'a')
		void lifecycle.submit({ auto: true })
		await settle()
		assert.equal(lifecycle.getSnapshot().phase, 'autoSubmitting')
		assert.equal(lifecycle.getSnapshot().interactionDisabled, true)
		assert.equal(storage.data.get(KEYS.frozen), '1')
		pendingSubmit.resolve(view)
		await settle()
		assert.deepEqual(presentKeys(storage), [])
		assert.equal(lifecycle.getSnapshot().showTimeUp, true)
		assert.equal(lifecycle.getSnapshot().phase, 'autoSubmitting')
		assert.equal(lifecycle.getSnapshot().result, null)
		await vi.advanceTimersByTimeAsync(1499)
		assert.equal(lifecycle.getSnapshot().showTimeUp, true)
		await vi.advanceTimersByTimeAsync(1)
		assert.equal(lifecycle.getSnapshot().showTimeUp, false)
		assert.equal(lifecycle.getSnapshot().phase, 'submitted')
		assert.deepEqual(lifecycle.getSnapshot().result, view)
		assert.deepEqual(onNotice.mock.calls.at(-1)?.[0], { kind: 'submitted', result: view })
	})

	test('отправка без сессии: сначала /start s2, sessionKey s2, затем submit с s2 и новым clientAttemptId', async () => {
		const fakeApi = fakeAttemptApi([new Error('network')])
		const { lifecycle, storage } = setupLifecycle({ api: fakeApi })
		lifecycle.init()
		await settle()
		assert.equal(lifecycle.getSnapshot().phase, 'active')
		lifecycle.answer(Q1, 'a')
		assert.equal(fakeApi.saveDraft.mock.calls.length, 0)
		fakeApi.queueStart(sessionOf('s2', '2026-10-04T10:01:00.000Z', { answers: { [Q1]: 'server', [Q2]: 'server' } }))
		const view = attemptViewOf()
		const pendingSubmit = deferred<typeof view | Error>()
		fakeApi.queueSubmit(pendingSubmit)
		const submitting = lifecycle.submit()
		await settle()
		assert.equal(fakeApi.start.mock.calls.length, 2)
		assert.deepEqual(readJson(storage, KEYS.session), { sessionId: 's2', startedAt: '2026-10-04T10:01:00.000Z' })
		assert.deepEqual(readJson(storage, KEYS.clientAttemptId), { sessionId: 's2', clientAttemptId: 'client-1' })
		assert.deepEqual(fakeApi.submitRequests()[0], {
			sessionId: 's2',
			clientAttemptId: 'client-1',
			answers: { [Q1]: 'a', [Q2]: 'server' },
			telemetry: { [Q1]: { timeSpentMs: 0, focusLossCount: 0, visitCount: 1 } },
		})
		assert.equal(lifecycle.getSnapshot().phase, 'submitting')
		pendingSubmit.resolve(view)
		await submitting
		assert.equal(lifecycle.getSnapshot().phase, 'submitted')
		assert.deepEqual(presentKeys(storage), [])
	})

	test('CR-04: отправка без сессии, /start вернул черновик той же сессии с другого устройства → тело submit с ответами обоих, локальный побеждает', async () => {
		const fakeApi = fakeAttemptApi([new TypeError('Failed to fetch')])
		const { lifecycle, storage, onNotice } = setupLifecycle({ api: fakeApi })
		lifecycle.init()
		await settle()
		assert.equal(lifecycle.getSnapshot().phase, 'active')
		lifecycle.answer(Q1, 'local')
		lifecycle.answer(Q3, 'only-local')
		fakeApi.queueStart(
			sessionOf('s1', undefined, {
				answers: { [Q1]: 'server', [Q2]: 'from-laptop' },
				telemetry: { [Q2]: { timeSpentMs: 5000, focusLossCount: 1, visitCount: 2 } },
			})
		)
		const pendingSubmit = deferred<ReturnType<typeof attemptViewOf> | Error>()
		fakeApi.queueSubmit(pendingSubmit)
		const submitting = lifecycle.submit()
		await settle()
		assert.deepEqual(fakeApi.submitRequests()[0], {
			sessionId: 's1',
			clientAttemptId: 'client-1',
			answers: { [Q1]: 'local', [Q2]: 'from-laptop', [Q3]: 'only-local' },
			telemetry: {
				[Q1]: { timeSpentMs: 0, focusLossCount: 0, visitCount: 1 },
				[Q2]: { timeSpentMs: 5000, focusLossCount: 1, visitCount: 2 },
			},
		})
		const wal = readJson(storage, KEYS.wal) as { sessionId: string; answers: object; pending: string[] }
		assert.equal(wal.sessionId, 's1')
		assert.deepEqual(wal.answers, { [Q1]: 'local', [Q2]: 'from-laptop', [Q3]: 'only-local' })
		assert.deepEqual([...wal.pending].sort(), [Q1, Q3].sort())
		assert.equal(lifecycle.getSnapshot().currentQuestionId, Q1)
		assert.deepEqual(onNotice.mock.calls, [])
		pendingSubmit.resolve(attemptViewOf())
		await submitting
		assert.equal(lifecycle.getSnapshot().phase, 'submitted')
	})

	test('submit вне фазы active ничего не делает', async () => {
		const { lifecycle, fakeApi } = setupLifecycle({ timeLimitMinutes: 10 })
		lifecycle.init()
		await lifecycle.submit()
		assert.equal(lifecycle.getSnapshot().phase, 'awaitingStart')
		assert.equal(fakeApi.submit.mock.calls.length, 0)
		assert.equal(fakeApi.start.mock.calls.length, 0)
	})
})

describe('строки таблицы «Поведение» фазы 5', () => {
	test('403 на отправку: blocked submit-not-assigned, ввод выключен, ни один ключ не удалён', async () => {
		const { lifecycle, storage, fakeApi } = await activeWithAnswer()
		fakeApi.queueSubmit(requestError(403))
		await lifecycle.submit()
		const snapshot = lifecycle.getSnapshot()
		assert.equal(snapshot.phase, 'blocked')
		assert.equal(snapshot.blockReason, 'submit-not-assigned')
		assert.equal(snapshot.submitFailed, false)
		assert.equal(snapshot.interactionDisabled, true)
		assert.deepEqual(snapshot.answers, { [Q1]: 'a' })
		assert.deepEqual(presentKeys(storage), ['session', 'wal', 'clientAttemptId'])
		assert.deepEqual(readJson(storage, KEYS.wal), {
			v: 2,
			sessionId: 's1',
			answers: { [Q1]: 'a' },
			pending: [Q1],
			position: Q1,
			telemetry: { [Q1]: { timeSpentMs: 0, focusLossCount: 0, visitCount: 1 } },
			telemetryPending: true,
		})
	})

	test('403 на /start перед отправкой: blocked start-not-assigned, session и clientAttemptId удалены, WAL с sessionId null', async () => {
		const fakeApi = fakeAttemptApi([new Error('network')])
		const { lifecycle, storage } = await activeWithAnswer({ api: fakeApi })
		storage.setItem(KEYS.clientAttemptId, JSON.stringify({ sessionId: 's0', clientAttemptId: 'old' }))
		fakeApi.queueStart(requestError(403))
		await lifecycle.submit()
		const snapshot = lifecycle.getSnapshot()
		assert.equal(snapshot.phase, 'blocked')
		assert.equal(snapshot.blockReason, 'start-not-assigned')
		assert.equal(snapshot.interactionDisabled, true)
		assert.equal(fakeApi.submit.mock.calls.length, 0)
		assert.deepEqual(presentKeys(storage), ['wal'])
		const wal = readJson(storage, KEYS.wal) as { sessionId: string | null; answers: object; pending: string[] }
		assert.equal(wal.sessionId, null)
		assert.deepEqual(wal.answers, { [Q1]: 'a' })
		assert.deepEqual(wal.pending, [Q1])
	})

	test.each(
		[
			{
				name: '409 ATTEMPT_ALREADY_SUBMITTED с attemptId: blocked already-submitted, id попытки, удалены все четыре ключа',
				attemptId: ATTEMPT_ID as string | undefined,
				expectedId: ATTEMPT_ID as string | null,
			},
			{
				name: '409 ATTEMPT_ALREADY_SUBMITTED без attemptId: alreadySubmittedAttemptId null',
				attemptId: undefined as string | undefined,
				expectedId: null as string | null,
			},
		].map((row): [string, typeof row] => [row.name, row])
	)('%s', async (_name, { attemptId, expectedId }) => {
		const { lifecycle, storage, fakeApi } = await activeWithAnswer()
		fakeApi.queueSubmit(requestError(409, SUBMIT_ERROR_CODES.alreadySubmitted, attemptId))
		await lifecycle.submit()
		const snapshot = lifecycle.getSnapshot()
		assert.equal(snapshot.phase, 'blocked')
		assert.equal(snapshot.blockReason, 'already-submitted')
		assert.equal(snapshot.alreadySubmittedAttemptId, expectedId)
		assert.equal(snapshot.interactionDisabled, true)
		assert.deepEqual(presentKeys(storage), [])
	})

	test('422 TIME_EXPIRED на ручную отправку: blocked time-expired, удалены все четыре ключа, retake без лимита — новый /start', async () => {
		const { lifecycle, storage, fakeApi } = await activeWithAnswer()
		fakeApi.queueSubmit(requestError(422, 'TIME_EXPIRED'))
		await lifecycle.submit()
		assert.equal(lifecycle.getSnapshot().phase, 'blocked')
		assert.equal(lifecycle.getSnapshot().blockReason, 'time-expired')
		assert.equal(lifecycle.getSnapshot().interactionDisabled, true)
		assert.deepEqual(presentKeys(storage), [])
		fakeApi.queueStart(sessionOf('s2'))
		lifecycle.retake()
		assert.equal(lifecycle.getSnapshot().phase, 'starting')
		await settle()
		assert.equal(fakeApi.start.mock.calls.length, 2)
		assert.equal(lifecycle.getSnapshot().phase, 'active')
		assert.equal(lifecycle.getSnapshot().blockReason, null)
		assert.deepEqual(lifecycle.getSnapshot().answers, {})
		assert.deepEqual(readJson(storage, KEYS.session), { sessionId: 's2', startedAt: sessionOf('s2').startedAt })
	})

	test('422 TIME_EXPIRED на автосдачу теста с лимитом: blocked time-expired, ключи удалены, retake — awaitingStart', async () => {
		const fakeApi = fakeAttemptApi([sessionOf('s1')])
		const { lifecycle, storage } = setupLifecycle({ api: fakeApi, timeLimitMinutes: 10 })
		lifecycle.init()
		await lifecycle.confirmStart()
		lifecycle.answer(Q1, 'a')
		fakeApi.queueSubmit(requestError(422, SUBMIT_ERROR_CODES.timeExpired))
		await lifecycle.submit({ auto: true })
		assert.equal(lifecycle.getSnapshot().phase, 'blocked')
		assert.equal(lifecycle.getSnapshot().blockReason, 'time-expired')
		assert.equal(lifecycle.getSnapshot().showTimeUp, false)
		assert.deepEqual(presentKeys(storage), [])
		lifecycle.retake()
		await settle()
		assert.equal(lifecycle.getSnapshot().phase, 'awaitingStart')
		assert.equal(fakeApi.start.mock.calls.length, 1)
	})

	test('404 на отправку: blocked not-found, удалены session и clientAttemptId, WAL без сессии; новый модуль досылает ответы в s3', async () => {
		const storage = memoryStorage()
		const fakeApi = fakeAttemptApi([sessionOf('s1', undefined, { answers: { [Q2]: 'server' } })])
		const { lifecycle } = setupLifecycle({ storage, api: fakeApi })
		lifecycle.init()
		await settle()
		lifecycle.answer(Q1, 'a')
		await vi.advanceTimersByTimeAsync(600)
		fakeApi.queueSubmit(requestError(404))
		await lifecycle.submit()
		const snapshot = lifecycle.getSnapshot()
		assert.equal(snapshot.phase, 'blocked')
		assert.equal(snapshot.blockReason, 'not-found')
		assert.equal(snapshot.interactionDisabled, true)
		assert.deepEqual(presentKeys(storage), ['wal'])
		const wal = readJson(storage, KEYS.wal) as { sessionId: string | null; answers: object; pending: string[] }
		assert.equal(wal.sessionId, null)
		assert.deepEqual(wal.answers, { [Q1]: 'a', [Q2]: 'server' })
		assert.deepEqual([...wal.pending].sort(), [Q1, Q2].sort())
		lifecycle.dispose()

		fakeApi.queueStart(sessionOf('s3'))
		const saveCalls = fakeApi.saveDraft.mock.calls.length
		const next = setupLifecycle({ storage, api: fakeApi })
		next.lifecycle.init()
		await settle()
		assert.equal(next.lifecycle.getSnapshot().phase, 'active')
		assert.deepEqual(next.lifecycle.getSnapshot().answers, { [Q1]: 'a', [Q2]: 'server' })
		await vi.advanceTimersByTimeAsync(600)
		const sent = fakeApi.saveDraft.mock.calls.slice(saveCalls)
		assert.deepEqual(
			sent.map((call) => call[1]),
			['s3', 's3', 's3']
		)
		assert.deepEqual(
			sent.map((call) => call[2]).filter((body) => 'telemetry' in body),
			[{ telemetry: { [Q1]: { timeSpentMs: 600, focusLossCount: 0, visitCount: 1 } } }]
		)
		const bodies = sent
			.map((call) => call[2])
			.filter((body): body is { questionId: string; value: string } => 'questionId' in body)
		bodies.sort((left, right) => left.questionId.localeCompare(right.questionId))
		assert.deepEqual(bodies, [
			{ questionId: Q1, value: 'a' },
			{ questionId: Q2, value: 'server' },
		])
	})

	for (const [label, failure] of [
		['400', () => requestError(400)],
		['500', () => requestError(500)],
		['сбой сети', () => new TypeError('Failed to fetch')],
	] as const) {
		test(`${label} на отправку: active, submitFailed, ввод включён, ключи не тронуты; повтор с тем же clientAttemptId`, async () => {
			const { lifecycle, storage, fakeApi } = await activeWithAnswer()
			fakeApi.queueSubmit(failure())
			await lifecycle.submit()
			const snapshot = lifecycle.getSnapshot()
			assert.equal(snapshot.phase, 'active')
			assert.equal(snapshot.blockReason, null)
			assert.equal(snapshot.submitFailed, true)
			assert.equal(snapshot.interactionDisabled, false)
			assert.deepEqual(presentKeys(storage), ['session', 'wal', 'clientAttemptId'])
			const retry = deferred<ReturnType<typeof attemptViewOf> | Error>()
			fakeApi.queueSubmit(retry)
			const second = lifecycle.submit()
			await settle()
			assert.equal(lifecycle.getSnapshot().submitFailed, false)
			assert.equal(lifecycle.getSnapshot().phase, 'submitting')
			retry.resolve(attemptViewOf())
			await second
			const requests = fakeApi.submitRequests()
			assert.equal(requests.length, 2)
			assert.equal(requests[0]?.clientAttemptId, 'client-1')
			assert.equal(requests[1]?.clientAttemptId, 'client-1')
			assert.equal(lifecycle.getSnapshot().phase, 'submitted')
		})
	}

	test('неудачный /start перед отправкой не по 403: active, submitFailed, ключи не тронуты, повтор снова вызывает /start', async () => {
		const fakeApi = fakeAttemptApi([new Error('network')])
		const { lifecycle, storage } = await activeWithAnswer({ api: fakeApi })
		const walBefore = storage.data.get(KEYS.wal)
		fakeApi.queueStart(requestError(500))
		await lifecycle.submit()
		assert.equal(lifecycle.getSnapshot().phase, 'active')
		assert.equal(lifecycle.getSnapshot().submitFailed, true)
		assert.equal(lifecycle.getSnapshot().interactionDisabled, false)
		assert.equal(fakeApi.submit.mock.calls.length, 0)
		assert.deepEqual(presentKeys(storage), ['wal'])
		assert.equal(storage.data.get(KEYS.wal), walBefore)
		fakeApi.queueStart(sessionOf('s2'))
		fakeApi.queueSubmit(attemptViewOf())
		await lifecycle.submit()
		assert.equal(fakeApi.start.mock.calls.length, 3)
		assert.equal(fakeApi.submitRequests()[0]?.sessionId, 's2')
		assert.equal(lifecycle.getSnapshot().phase, 'submitted')
	})

	test('автосдача упала с 500: frozenKey удалён, фаза active, submitFailed', async () => {
		const { lifecycle, storage, fakeApi } = await activeWithAnswer({ timeLimitMinutes: null })
		fakeApi.queueSubmit(requestError(500))
		await lifecycle.submit({ auto: true })
		assert.equal(lifecycle.getSnapshot().phase, 'active')
		assert.equal(lifecycle.getSnapshot().submitFailed, true)
		assert.equal(lifecycle.getSnapshot().showTimeUp, false)
		assert.equal(storage.data.has(KEYS.frozen), false)
		assert.deepEqual(presentKeys(storage), ['session', 'wal', 'clientAttemptId'])
	})

	test('автосдача упала с 403: frozenKey удалён, blocked submit-not-assigned', async () => {
		const { lifecycle, storage, fakeApi } = await activeWithAnswer()
		fakeApi.queueSubmit(requestError(403))
		await lifecycle.submit({ auto: true })
		assert.equal(lifecycle.getSnapshot().blockReason, 'submit-not-assigned')
		assert.equal(storage.data.has(KEYS.frozen), false)
	})

	test('«Начать» не удалось не по 403: уведомление start-failed и снова awaitingStart; 403 — blocked start-not-assigned', async () => {
		const fakeApi = fakeAttemptApi([requestError(500)])
		const { lifecycle, onNotice } = setupLifecycle({ api: fakeApi, timeLimitMinutes: 10 })
		lifecycle.init()
		await lifecycle.confirmStart()
		assert.equal(lifecycle.getSnapshot().phase, 'awaitingStart')
		assert.deepEqual(onNotice.mock.calls.at(-1)?.[0], { kind: 'start-failed' })
		fakeApi.queueStart(requestError(403))
		await lifecycle.confirmStart()
		assert.equal(lifecycle.getSnapshot().phase, 'blocked')
		assert.equal(lifecycle.getSnapshot().blockReason, 'start-not-assigned')
	})

	for (const status of [403, 404]) {
		test(`PATCH черновика получил ${status}: без плашки, индикатор device-only`, async () => {
			const { lifecycle, fakeApi } = await activeWithAnswer()
			fakeApi.queueSave(response(status))
			await vi.advanceTimersByTimeAsync(600)
			const snapshot = lifecycle.getSnapshot()
			assert.equal(snapshot.phase, 'active')
			assert.equal(snapshot.blockReason, null)
			assert.equal(snapshot.submitFailed, false)
			assert.equal(snapshot.saveIndicator, 'device-only')
		})
	}
})

describe('retake: один сброс', () => {
	test('D-26 п. 4: retake после submitted равен новому модулю на пустом хранилище, ключи удалены', async () => {
		const fakeApi = fakeAttemptApi([sessionOf('s1')])
		const { lifecycle, storage } = setupLifecycle({ api: fakeApi, timeLimitMinutes: 10 })
		lifecycle.init()
		await lifecycle.confirmStart()
		lifecycle.answer(Q1, 'a')
		lifecycle.navigate(Q3)
		fakeApi.queueSubmit(attemptViewOf())
		await lifecycle.submit()
		assert.equal(lifecycle.getSnapshot().phase, 'submitted')
		storage.setItem(KEYS.frozen, '1')
		lifecycle.retake()
		const fresh = setupLifecycle({ storage: memoryStorage(), timeLimitMinutes: 10 })
		fresh.lifecycle.init()
		assert.deepEqual(lifecycle.getSnapshot(), fresh.lifecycle.getSnapshot())
		assert.equal(lifecycle.getSnapshot().phase, 'awaitingStart')
		assert.deepEqual(presentKeys(storage), [])
		await vi.advanceTimersByTimeAsync(10_000)
		assert.equal(fakeApi.start.mock.calls.length, 1)
	})

	test('retake после 422: очередь s1 отброшена, поздние ответы s1 игнорируются, saveDraft с s1 больше не вызывается', async () => {
		const fakeApi = fakeAttemptApi([sessionOf('s1')])
		const { lifecycle, storage } = setupLifecycle({ api: fakeApi })
		lifecycle.init()
		await settle()
		const inFlight = deferred<typeof OK>()
		fakeApi.queueSave(inFlight)
		lifecycle.answer(Q1, 'a')
		await vi.advanceTimersByTimeAsync(600)
		lifecycle.answer(Q2, 'b')
		assert.equal(fakeApi.saveDraft.mock.calls.length, 1)
		fakeApi.queueSubmit(requestError(422, SUBMIT_ERROR_CODES.timeExpired))
		await lifecycle.submit()
		const start = deferred<ReturnType<typeof sessionOf>>()
		fakeApi.start.mockImplementationOnce(() => start.promise)
		lifecycle.retake()
		const afterReset = lifecycle.getSnapshot()
		assert.deepEqual(afterReset.answers, {})
		assert.equal(afterReset.phase, 'starting')
		inFlight.resolve(OK)
		await settle()
		assert.deepEqual(lifecycle.getSnapshot(), afterReset)
		assert.equal(storage.data.has(KEYS.wal), false)
		start.resolve(sessionOf('s2'))
		await settle()
		assert.equal(lifecycle.getSnapshot().phase, 'active')
		assert.deepEqual(lifecycle.getSnapshot().answers, {})
		await vi.advanceTimersByTimeAsync(30_000)
		const sessionIds = fakeApi.saveDraft.mock.calls.slice(1).map((call) => call[1])
		assert.deepEqual(sessionIds, [])
		lifecycle.answer(Q3, 'c')
		await vi.advanceTimersByTimeAsync(600)
		assert.deepEqual(
			fakeApi.saveDraft.mock.calls.slice(1).map((call) => [call[1], call[2]]),
			[['s2', { questionId: Q3, value: 'c' }]]
		)
	})

	test('retake во время паузы автосдачи: пауза снята, результат прежней отправки не показывается', async () => {
		const { lifecycle, fakeApi } = await activeWithAnswer()
		fakeApi.queueSubmit(attemptViewOf())
		void lifecycle.submit({ auto: true })
		await settle()
		assert.equal(lifecycle.getSnapshot().showTimeUp, true)
		fakeApi.queueStart(sessionOf('s2'))
		lifecycle.retake()
		await vi.advanceTimersByTimeAsync(2000)
		const snapshot = lifecycle.getSnapshot()
		assert.equal(snapshot.showTimeUp, false)
		assert.equal(snapshot.result, null)
		assert.equal(snapshot.phase, 'active')
	})

	test('retake теста без лимита: сбой /start даёт уведомление retake-start-failed', async () => {
		const { lifecycle, fakeApi, onNotice } = await activeWithAnswer()
		fakeApi.queueSubmit(attemptViewOf())
		await lifecycle.submit()
		fakeApi.start.mockRejectedValueOnce(new TypeError('Failed to fetch'))
		lifecycle.retake()
		await settle()
		assert.equal(lifecycle.getSnapshot().phase, 'active')
		assert.deepEqual(onNotice.mock.calls.at(-1)?.[0], { kind: 'retake-start-failed' })
	})
})

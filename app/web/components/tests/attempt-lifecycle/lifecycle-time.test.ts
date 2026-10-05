import { ATTEMPT_GRACE_PERIOD_MINUTES, SUBMIT_ERROR_CODES } from '@bio-exam/exam-core'

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test, vi } from 'vitest'

import {
	attemptViewOf,
	deferred,
	fakeAttemptApi,
	KEYS,
	Q1,
	Q2,
	readJson,
	requestError,
	seededStorage,
	sessionOf,
	settle,
	setupLifecycle,
	START,
	walTelemetry,
	walTelemetryPending,
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

function entry(timeSpentMs: number, focusLossCount: number, visitCount: number) {
	return { timeSpentMs, focusLossCount, visitCount }
}

describe('телеметрия и видимость вкладки', () => {
	test('D-26 п. 5: вкладка скрыта 60 с — время вопроса без этих 60 с, focusLossCount + 1, возврат без визита', async () => {
		const { lifecycle, page, storage } = setupLifecycle()
		lifecycle.init()
		await settle()
		assert.equal(lifecycle.getSnapshot().phase, 'active')
		await vi.advanceTimersByTimeAsync(10_000)
		page.emit('hidden')
		await vi.advanceTimersByTimeAsync(60_000)
		page.emit('visible')
		await vi.advanceTimersByTimeAsync(5_000)
		lifecycle.navigate(Q2)
		assert.deepEqual(walTelemetry(storage), {
			[Q1]: entry(15_000, 1, 1),
			[Q2]: entry(0, 0, 1),
		})
	})

	test('скрытие вкладки в active: { telemetry } уходит сразу, без дебаунса', async () => {
		const { lifecycle, page, fakeApi } = setupLifecycle()
		lifecycle.init()
		await settle()
		await vi.advanceTimersByTimeAsync(1_000)
		const before = fakeApi.saveDraft.mock.calls.length
		page.emit('hidden')
		await settle()
		assert.equal(fakeApi.saveDraft.mock.calls.length, before + 1)
		assert.deepEqual(fakeApi.savedBodies().at(-1), { telemetry: { [Q1]: entry(1_000, 1, 1) } })
	})

	test('скрытие вкладки в awaitingStart телеметрию не меняет и ничего не отправляет', async () => {
		const { lifecycle, page, fakeApi, storage } = setupLifecycle({ timeLimitMinutes: 10 })
		lifecycle.init()
		assert.equal(lifecycle.getSnapshot().phase, 'awaitingStart')
		page.emit('hidden')
		await vi.advanceTimersByTimeAsync(10_000)
		page.emit('visible')
		await vi.advanceTimersByTimeAsync(10_000)
		assert.equal(fakeApi.saveDraft.mock.calls.length, 0)
		assert.equal(readJson(storage, KEYS.wal), undefined)
	})

	test('каждое изменение телеметрии сразу в WAL с telemetryPending true, подтверждение снимает признак', async () => {
		const { lifecycle, storage, fakeApi } = setupLifecycle()
		lifecycle.init()
		await settle()
		assert.deepEqual(walTelemetry(storage), { [Q1]: entry(0, 0, 1) })
		assert.equal(walTelemetryPending(storage), true)
		await vi.advanceTimersByTimeAsync(2_600)
		assert.equal(fakeApi.saveDraft.mock.calls.length, 0)
		lifecycle.navigate(Q2)
		assert.deepEqual(walTelemetry(storage), { [Q1]: entry(2_600, 0, 1), [Q2]: entry(0, 0, 1) })
		assert.equal(walTelemetryPending(storage), true)
		await settle()
		assert.deepEqual(fakeApi.savedBodies(), [{ telemetry: { [Q1]: entry(2_600, 0, 1), [Q2]: entry(0, 0, 1) } }])
		assert.equal(walTelemetryPending(storage), false)
	})

	test('восстановление: WAL 4000 и черновик сервера 9000 → 9000, время копится от него', async () => {
		const storage = seededStorage({
			session: { sessionId: 's1' },
			wal: {
				sessionId: 's1',
				answers: {},
				telemetry: { [Q1]: entry(4_000, 0, 1) },
				telemetryPending: true,
			},
		})
		const fakeApi = fakeAttemptApi([sessionOf('s1', undefined, { telemetry: { [Q1]: entry(9_000, 1, 2) } })])
		const { lifecycle } = setupLifecycle({ storage, api: fakeApi })
		lifecycle.init()
		await settle()
		assert.equal(lifecycle.getSnapshot().phase, 'active')
		assert.deepEqual(walTelemetry(storage), { [Q1]: entry(9_000, 1, 3) })
		await vi.advanceTimersByTimeAsync(5_000)
		lifecycle.navigate(Q2)
		assert.deepEqual(walTelemetry(storage), { [Q1]: entry(14_000, 1, 3), [Q2]: entry(0, 0, 1) })
	})
})

async function activeWithLimit(input: { api?: ReturnType<typeof fakeAttemptApi> } = {}) {
	const setup = setupLifecycle({ timeLimitMinutes: LIMIT, api: input.api })
	setup.lifecycle.init()
	await setup.lifecycle.confirmStart()
	return setup
}

function minuteNotices(onNotice: { mock: { calls: unknown[][] } }): number {
	return onNotice.mock.calls.filter((call) => (call[0] as { kind: string }).kind === 'one-minute-left').length
}

describe('таймер экзамена, предупреждение и автосдача', () => {
	test('лимит 10 мин: 600 сразу, 599 через секунду, при скрытой вкладке тики продолжаются', async () => {
		const { lifecycle, page } = await activeWithLimit()
		assert.equal(lifecycle.getSnapshot().phase, 'active')
		assert.equal(lifecycle.getSnapshot().secondsLeft, 600)
		await vi.advanceTimersByTimeAsync(1_000)
		assert.equal(lifecycle.getSnapshot().secondsLeft, 599)
		page.emit('hidden')
		await vi.advanceTimersByTimeAsync(5_000)
		assert.equal(lifecycle.getSnapshot().secondsLeft, 594)
	})

	test('тик на 61 с, следующий на 58 с: one-minute-left ровно один раз', async () => {
		const { lifecycle, onNotice } = await activeWithLimit()
		await vi.advanceTimersByTimeAsync(539_000)
		assert.equal(lifecycle.getSnapshot().secondsLeft, 61)
		assert.equal(minuteNotices(onNotice), 0)
		vi.setSystemTime(Date.now() + 2_000)
		await vi.advanceTimersByTimeAsync(1_000)
		assert.equal(lifecycle.getSnapshot().secondsLeft, 58)
		assert.equal(minuteNotices(onNotice), 1)
		await vi.advanceTimersByTimeAsync(20_000)
		assert.equal(minuteNotices(onNotice), 1)
	})

	test('D-26 п. 6: вкладка скрыта при 30 с, время сдвинуто на 90 с — автосдача один раз, autoSubmitting, frozenKey', async () => {
		const { lifecycle, page, fakeApi, storage } = await activeWithLimit()
		const view = attemptViewOf()
		const pendingSubmit = deferred<typeof view | Error>()
		fakeApi.queueSubmit(pendingSubmit)
		await vi.advanceTimersByTimeAsync(570_000)
		assert.equal(lifecycle.getSnapshot().secondsLeft, 30)
		page.emit('hidden')
		vi.setSystemTime(Date.now() + 89_000)
		await vi.advanceTimersByTimeAsync(1_000)
		assert.equal(fakeApi.submit.mock.calls.length, 1)
		assert.equal(lifecycle.getSnapshot().phase, 'autoSubmitting')
		assert.equal(lifecycle.getSnapshot().secondsLeft, 0)
		assert.equal(storage.data.get(KEYS.frozen), '1')
		await vi.advanceTimersByTimeAsync(5_000)
		assert.equal(fakeApi.submit.mock.calls.length, 1)
		pendingSubmit.resolve(view)
		await vi.advanceTimersByTimeAsync(1_500)
		assert.equal(lifecycle.getSnapshot().phase, 'submitted')
		await vi.advanceTimersByTimeAsync(5_000)
		assert.equal(fakeApi.submit.mock.calls.length, 1)
	})

	for (const [label, reply, phase] of [
		['200 → submitted', () => attemptViewOf(), 'submitted'],
		['422 → time-expired', () => requestError(422, SUBMIT_ERROR_CODES.timeExpired), 'blocked'],
	] as const) {
		test(`восстановление после дедлайна в пределах льготы: первый тик — автосдача, ${label}`, async () => {
			vi.setSystemTime(DEADLINE + 60_000)
			const storage = seededStorage({ session: { sessionId: 's1' } })
			const fakeApi = fakeAttemptApi([sessionOf('s1')])
			fakeApi.queueSubmit(reply())
			const { lifecycle } = setupLifecycle({ storage, api: fakeApi, timeLimitMinutes: LIMIT })
			lifecycle.init()
			await settle()
			assert.equal(fakeApi.submit.mock.calls.length, 1)
			await vi.advanceTimersByTimeAsync(1_500)
			assert.equal(lifecycle.getSnapshot().phase, phase)
			if (phase === 'blocked') assert.equal(lifecycle.getSnapshot().blockReason, 'time-expired')
			assert.equal(fakeApi.submit.mock.calls.length, 1)
		})
	}

	test('confirmStart после брошенной просроченной сессии, /start вернул ту же s1: первый тик — автосдача', async () => {
		vi.setSystemTime(DEADLINE + (ATTEMPT_GRACE_PERIOD_MINUTES + 1) * 60_000)
		const storage = seededStorage({ session: { sessionId: 's1' } })
		const fakeApi = fakeAttemptApi([sessionOf('s1')])
		fakeApi.queueSubmit(requestError(422, SUBMIT_ERROR_CODES.timeExpired))
		const { lifecycle } = setupLifecycle({ storage, api: fakeApi, timeLimitMinutes: LIMIT })
		lifecycle.init()
		assert.equal(lifecycle.getSnapshot().phase, 'awaitingStart')
		await lifecycle.confirmStart()
		await settle()
		assert.equal(fakeApi.submit.mock.calls.length, 1)
		assert.equal(lifecycle.getSnapshot().phase, 'blocked')
		assert.equal(lifecycle.getSnapshot().blockReason, 'time-expired')
	})

	test('тест без лимита: secondsLeft null, тиков нет', async () => {
		const { lifecycle, onNotice } = setupLifecycle()
		lifecycle.init()
		await settle()
		assert.equal(lifecycle.getSnapshot().secondsLeft, null)
		assert.equal(vi.getTimerCount(), 0)
		await vi.advanceTimersByTimeAsync(3_600_000)
		assert.equal(lifecycle.getSnapshot().secondsLeft, null)
		assert.equal(minuteNotices(onNotice), 0)
	})
})

describe('сброс, dispose и отправка закрывают отрезок времени', () => {
	test('D-05: после 422 и retake — awaitingStart, secondsLeft null, WAL удалён; новая сессия считает заново, предупреждение и автосдача срабатывают снова', async () => {
		const { lifecycle, fakeApi, storage, onNotice } = await activeWithLimit()
		await vi.advanceTimersByTimeAsync(3_000)
		lifecycle.navigate(Q2)
		assert.deepEqual(walTelemetry(storage), { [Q1]: entry(3_000, 0, 1), [Q2]: entry(0, 0, 1) })
		await vi.advanceTimersByTimeAsync(567_000)
		assert.equal(minuteNotices(onNotice), 1)
		fakeApi.queueSubmit(requestError(422, SUBMIT_ERROR_CODES.timeExpired))
		await lifecycle.submit()
		assert.equal(lifecycle.getSnapshot().blockReason, 'time-expired')
		lifecycle.retake()
		const reset = lifecycle.getSnapshot()
		assert.equal(reset.phase, 'awaitingStart')
		assert.equal(reset.secondsLeft, null)
		assert.equal(storage.data.has(KEYS.wal), false)
		await vi.advanceTimersByTimeAsync(5_000)
		assert.equal(storage.data.has(KEYS.wal), false)

		const restartedAt = Date.now()
		fakeApi.queueStart(sessionOf('s2', new Date(restartedAt).toISOString()))
		await lifecycle.confirmStart()
		assert.equal(lifecycle.getSnapshot().phase, 'active')
		assert.equal(lifecycle.getSnapshot().currentQuestionId, Q1)
		assert.equal(lifecycle.getSnapshot().secondsLeft, 600)
		assert.deepEqual(walTelemetry(storage), { [Q1]: entry(0, 0, 1) })
		await vi.advanceTimersByTimeAsync(2_000)
		lifecycle.navigate(Q2)
		assert.deepEqual(walTelemetry(storage), { [Q1]: entry(2_000, 0, 1), [Q2]: entry(0, 0, 1) })
		fakeApi.queueSubmit(attemptViewOf())
		await vi.advanceTimersByTimeAsync(540_000)
		assert.equal(minuteNotices(onNotice), 2)
		await vi.advanceTimersByTimeAsync(58_000)
		assert.equal(fakeApi.submit.mock.calls.length, 2)
		assert.equal(fakeApi.submitRequests()[1]?.sessionId, 's2')
		await vi.advanceTimersByTimeAsync(1_500)
		assert.equal(lifecycle.getSnapshot().phase, 'submitted')
	})

	test('dispose в active теста с лимитом: таймеров не остаётся, WAL хранит время до dispose', async () => {
		const { lifecycle, storage } = await activeWithLimit()
		await vi.advanceTimersByTimeAsync(7_000)
		lifecycle.dispose()
		assert.equal(vi.getTimerCount(), 0)
		assert.deepEqual(walTelemetry(storage), { [Q1]: entry(7_000, 0, 1) })
		await settle()
		assert.equal(vi.getTimerCount(), 0)
	})

	test('submit закрывает текущий отрезок: тело содержит время вопроса до отправки', async () => {
		const { lifecycle, fakeApi } = setupLifecycle()
		fakeApi.queueSubmit(attemptViewOf())
		lifecycle.init()
		await settle()
		await vi.advanceTimersByTimeAsync(4_000)
		await lifecycle.submit()
		assert.deepEqual(fakeApi.submitRequests()[0]?.telemetry, { [Q1]: entry(4_000, 0, 1) })
		assert.equal(lifecycle.getSnapshot().phase, 'submitted')
	})
})

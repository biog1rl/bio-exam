import assert from 'node:assert/strict'
import { afterEach, beforeEach, test, vi } from 'vitest'

import type { RefreshOutcome } from './client'
import { createKeepAlive, REFRESH_RETRY_MS, type KeepAliveDocument } from './keep-alive'

const START = Date.parse('2026-10-04T10:00:00.000Z')
const MINUTE = 60_000

function iso(ms: number): string {
	return new Date(ms).toISOString()
}

function fakeDocument(initial: 'visible' | 'hidden' = 'visible') {
	const listeners = new Set<() => void>()
	const doc: KeepAliveDocument & { visibilityState: string } = {
		visibilityState: initial,
		addEventListener: (_type, listener) => {
			listeners.add(listener)
		},
		removeEventListener: (_type, listener) => {
			listeners.delete(listener)
		},
	}
	return {
		doc,
		listenerCount: () => listeners.size,
		setVisibility(state: 'visible' | 'hidden') {
			doc.visibilityState = state
			for (const listener of [...listeners]) listener()
		},
	}
}

type Step = RefreshOutcome | Error

function setup(steps: Step[], visibility: 'visible' | 'hidden' = 'visible') {
	const page = fakeDocument(visibility)
	const queue = [...steps]
	const refresh = vi.fn(async (): Promise<RefreshOutcome> => {
		const next = queue.shift()
		if (!next) throw new Error('unexpected refresh')
		if (next instanceof Error) throw next
		return next
	})
	const onRefreshed = vi.fn()
	const onSessionEnded = vi.fn()
	const keepAlive = createKeepAlive({
		refresh,
		onRefreshed,
		onSessionEnded,
		doc: page.doc,
		now: () => Date.now(),
		setTimer: (callback, ms) => setTimeout(callback, ms),
		clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
	})
	return { page, refresh, onRefreshed, onSessionEnded, keepAlive }
}

beforeEach(() => {
	vi.useFakeTimers()
	vi.setSystemTime(START)
})

afterEach(() => {
	vi.useRealTimers()
})

test('REFRESH_RETRY_MS равен 30 с', () => {
	assert.equal(REFRESH_RETRY_MS, 30_000)
})

test('видимая вкладка: refresh через 14 мин при сроке 15 мин, не раньше', async () => {
	const { refresh, keepAlive } = setup([{ kind: 'ok', accessExpiresAt: iso(START + 29 * MINUTE) }])
	keepAlive.update(iso(START + 15 * MINUTE))
	await vi.advanceTimersByTimeAsync(14 * MINUTE - 1)
	assert.equal(refresh.mock.calls.length, 0)
	await vi.advanceTimersByTimeAsync(1)
	assert.equal(refresh.mock.calls.length, 1)
	keepAlive.stop()
})

test('вкладка скрыта к моменту таймера: refresh нет; возврат после истечения: refresh сразу один раз', async () => {
	const { page, refresh, keepAlive } = setup([{ kind: 'ok', accessExpiresAt: iso(START + 40 * MINUTE) }])
	keepAlive.update(iso(START + 15 * MINUTE))
	page.setVisibility('hidden')
	await vi.advanceTimersByTimeAsync(16 * MINUTE)
	assert.equal(refresh.mock.calls.length, 0)
	page.setVisibility('visible')
	await vi.advanceTimersByTimeAsync(0)
	assert.equal(refresh.mock.calls.length, 1)
	page.setVisibility('hidden')
	page.setVisibility('visible')
	await vi.advanceTimersByTimeAsync(0)
	assert.equal(refresh.mock.calls.length, 1)
	keepAlive.stop()
})

test('возврат на вкладку до порога: refresh нет, таймер остаётся', async () => {
	const { page, refresh, keepAlive } = setup([{ kind: 'ok', accessExpiresAt: iso(START + 40 * MINUTE) }])
	keepAlive.update(iso(START + 15 * MINUTE))
	await vi.advanceTimersByTimeAsync(5 * MINUTE)
	page.setVisibility('hidden')
	page.setVisibility('visible')
	await vi.advanceTimersByTimeAsync(0)
	assert.equal(refresh.mock.calls.length, 0)
	await vi.advanceTimersByTimeAsync(9 * MINUTE)
	assert.equal(refresh.mock.calls.length, 1)
	keepAlive.stop()
})

test('исход ok: onRefreshed с новым сроком, следующий таймер по новому сроку', async () => {
	const second = START + 14 * MINUTE + 15 * MINUTE
	const { refresh, onRefreshed, onSessionEnded, keepAlive } = setup([
		{ kind: 'ok', accessExpiresAt: iso(second) },
		{ kind: 'ok', accessExpiresAt: iso(second + 15 * MINUTE) },
	])
	keepAlive.update(iso(START + 15 * MINUTE))
	await vi.advanceTimersByTimeAsync(14 * MINUTE)
	assert.equal(refresh.mock.calls.length, 1)
	assert.deepEqual(onRefreshed.mock.calls, [[iso(second)]])
	await vi.advanceTimersByTimeAsync(14 * MINUTE - 1)
	assert.equal(refresh.mock.calls.length, 1)
	await vi.advanceTimersByTimeAsync(1)
	assert.equal(refresh.mock.calls.length, 2)
	assert.equal(onSessionEnded.mock.calls.length, 0)
	keepAlive.stop()
})

test('исход rejected (401): onSessionEnded один раз, новых таймеров нет', async () => {
	const { refresh, onRefreshed, onSessionEnded, keepAlive } = setup([{ kind: 'rejected' }])
	keepAlive.update(iso(START + 15 * MINUTE))
	await vi.advanceTimersByTimeAsync(14 * MINUTE)
	assert.equal(refresh.mock.calls.length, 1)
	assert.equal(onSessionEnded.mock.calls.length, 1)
	assert.equal(onRefreshed.mock.calls.length, 0)
	assert.equal(vi.getTimerCount(), 0)
	await vi.advanceTimersByTimeAsync(60 * MINUTE)
	assert.equal(refresh.mock.calls.length, 1)
	assert.equal(onSessionEnded.mock.calls.length, 1)
	keepAlive.stop()
})

test('исход unavailable (500): без onSessionEnded и onRefreshed, повторы через 30 с, после ok — по новому сроку', async () => {
	const renewed = START + 14 * MINUTE + 2 * REFRESH_RETRY_MS + 15 * MINUTE
	const { refresh, onRefreshed, onSessionEnded, keepAlive } = setup([
		{ kind: 'unavailable' },
		{ kind: 'unavailable' },
		{ kind: 'ok', accessExpiresAt: iso(renewed) },
		{ kind: 'ok', accessExpiresAt: iso(renewed + 15 * MINUTE) },
	])
	keepAlive.update(iso(START + 15 * MINUTE))
	await vi.advanceTimersByTimeAsync(14 * MINUTE)
	assert.equal(refresh.mock.calls.length, 1)
	assert.equal(onSessionEnded.mock.calls.length, 0)
	assert.equal(onRefreshed.mock.calls.length, 0)
	await vi.advanceTimersByTimeAsync(REFRESH_RETRY_MS - 1)
	assert.equal(refresh.mock.calls.length, 1)
	await vi.advanceTimersByTimeAsync(1)
	assert.equal(refresh.mock.calls.length, 2)
	assert.equal(onSessionEnded.mock.calls.length, 0)
	await vi.advanceTimersByTimeAsync(REFRESH_RETRY_MS)
	assert.equal(refresh.mock.calls.length, 3)
	assert.deepEqual(onRefreshed.mock.calls, [[iso(renewed)]])
	await vi.advanceTimersByTimeAsync(14 * MINUTE - 1)
	assert.equal(refresh.mock.calls.length, 3)
	await vi.advanceTimersByTimeAsync(1)
	assert.equal(refresh.mock.calls.length, 4)
	assert.equal(onSessionEnded.mock.calls.length, 0)
	keepAlive.stop()
})

test('refresh бросает (сбой сети): как unavailable, без onSessionEnded, повтор через 30 с', async () => {
	const { refresh, onRefreshed, onSessionEnded, keepAlive } = setup([
		new TypeError('Failed to fetch'),
		{ kind: 'ok', accessExpiresAt: iso(START + 40 * MINUTE) },
	])
	keepAlive.update(iso(START + 15 * MINUTE))
	await vi.advanceTimersByTimeAsync(14 * MINUTE)
	assert.equal(refresh.mock.calls.length, 1)
	assert.equal(onSessionEnded.mock.calls.length, 0)
	assert.equal(onRefreshed.mock.calls.length, 0)
	await vi.advanceTimersByTimeAsync(REFRESH_RETRY_MS)
	assert.equal(refresh.mock.calls.length, 2)
	assert.equal(onRefreshed.mock.calls.length, 1)
	assert.equal(onSessionEnded.mock.calls.length, 0)
	keepAlive.stop()
})

test('вкладка скрыта к моменту повтора после unavailable: refresh нет; возврат: refresh сразу один раз', async () => {
	const { page, refresh, onSessionEnded, keepAlive } = setup([
		{ kind: 'unavailable' },
		{ kind: 'ok', accessExpiresAt: iso(START + 40 * MINUTE) },
	])
	keepAlive.update(iso(START + 15 * MINUTE))
	await vi.advanceTimersByTimeAsync(14 * MINUTE)
	assert.equal(refresh.mock.calls.length, 1)
	page.setVisibility('hidden')
	await vi.advanceTimersByTimeAsync(5 * REFRESH_RETRY_MS)
	assert.equal(refresh.mock.calls.length, 1)
	page.setVisibility('visible')
	await vi.advanceTimersByTimeAsync(0)
	assert.equal(refresh.mock.calls.length, 2)
	page.setVisibility('hidden')
	page.setVisibility('visible')
	await vi.advanceTimersByTimeAsync(0)
	assert.equal(refresh.mock.calls.length, 2)
	assert.equal(onSessionEnded.mock.calls.length, 0)
	keepAlive.stop()
})

test('возврат на вкладку во время идущего refresh не запускает второй', async () => {
	const page = fakeDocument()
	let resolve: (outcome: RefreshOutcome) => void = () => undefined
	const refresh = vi.fn(
		() =>
			new Promise<RefreshOutcome>((done) => {
				resolve = done
			})
	)
	const keepAlive = createKeepAlive({ refresh, onRefreshed: vi.fn(), onSessionEnded: vi.fn(), doc: page.doc })
	keepAlive.update(iso(START + 15 * MINUTE))
	await vi.advanceTimersByTimeAsync(14 * MINUTE)
	assert.equal(refresh.mock.calls.length, 1)
	page.setVisibility('hidden')
	page.setVisibility('visible')
	await vi.advanceTimersByTimeAsync(0)
	assert.equal(refresh.mock.calls.length, 1)
	resolve({ kind: 'ok', accessExpiresAt: iso(START + 40 * MINUTE) })
	await vi.advanceTimersByTimeAsync(0)
	assert.equal(refresh.mock.calls.length, 1)
	keepAlive.stop()
})

test('stop(): таймер снят, подписка на visibilitychange снята', async () => {
	const { page, refresh, keepAlive } = setup([])
	assert.equal(page.listenerCount(), 1)
	keepAlive.update(iso(START + 15 * MINUTE))
	keepAlive.stop()
	assert.equal(page.listenerCount(), 0)
	assert.equal(vi.getTimerCount(), 0)
	await vi.advanceTimersByTimeAsync(60 * MINUTE)
	page.setVisibility('visible')
	assert.equal(refresh.mock.calls.length, 0)
})

test('update(null) снимает таймер', async () => {
	const { page, refresh, keepAlive } = setup([])
	keepAlive.update(iso(START + 15 * MINUTE))
	keepAlive.update(null)
	assert.equal(vi.getTimerCount(), 0)
	await vi.advanceTimersByTimeAsync(60 * MINUTE)
	page.setVisibility('hidden')
	page.setVisibility('visible')
	await vi.advanceTimersByTimeAsync(0)
	assert.equal(refresh.mock.calls.length, 0)
	keepAlive.stop()
})

test('повторный update с тем же сроком не добавляет таймеров и refresh', async () => {
	const { refresh, keepAlive } = setup([{ kind: 'ok', accessExpiresAt: iso(START + 40 * MINUTE) }])
	keepAlive.update(iso(START + 15 * MINUTE))
	keepAlive.update(iso(START + 15 * MINUTE))
	assert.equal(vi.getTimerCount(), 1)
	await vi.advanceTimersByTimeAsync(14 * MINUTE)
	assert.equal(refresh.mock.calls.length, 1)
	keepAlive.stop()
})

test('срок уже прошёл: refresh сразу, если вкладка видима', async () => {
	const { refresh, keepAlive } = setup([{ kind: 'ok', accessExpiresAt: iso(START + 15 * MINUTE) }])
	keepAlive.update(iso(START - MINUTE))
	await vi.advanceTimersByTimeAsync(0)
	assert.equal(refresh.mock.calls.length, 1)
	keepAlive.stop()
})

test('TTL 60 с: после ok следующий refresh не раньше чем через 30 с, в том числе после update()', async () => {
	const { refresh, onRefreshed, keepAlive } = setup([
		{ kind: 'ok', accessExpiresAt: iso(START + MINUTE) },
		{ kind: 'ok', accessExpiresAt: iso(START + REFRESH_RETRY_MS + MINUTE) },
	])
	keepAlive.update(iso(START - MINUTE))
	await vi.advanceTimersByTimeAsync(0)
	assert.equal(refresh.mock.calls.length, 1)
	assert.deepEqual(onRefreshed.mock.calls, [[iso(START + MINUTE)]])
	keepAlive.update(iso(START + MINUTE))
	await vi.advanceTimersByTimeAsync(REFRESH_RETRY_MS - 1)
	assert.equal(refresh.mock.calls.length, 1)
	await vi.advanceTimersByTimeAsync(1)
	assert.equal(refresh.mock.calls.length, 2)
	keepAlive.stop()
})

test('часы клиента спешат: срок после ok уже в прошлом, следующий refresh не раньше чем через 30 с', async () => {
	const { refresh, keepAlive } = setup([
		{ kind: 'ok', accessExpiresAt: iso(START - 5 * MINUTE) },
		{ kind: 'ok', accessExpiresAt: iso(START + 40 * MINUTE) },
	])
	keepAlive.update(iso(START - MINUTE))
	await vi.advanceTimersByTimeAsync(0)
	assert.equal(refresh.mock.calls.length, 1)
	keepAlive.update(iso(START - 5 * MINUTE))
	await vi.advanceTimersByTimeAsync(REFRESH_RETRY_MS - 1)
	assert.equal(refresh.mock.calls.length, 1)
	await vi.advanceTimersByTimeAsync(1)
	assert.equal(refresh.mock.calls.length, 2)
	keepAlive.stop()
})

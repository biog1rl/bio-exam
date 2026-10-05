import assert from 'node:assert/strict'
import { afterEach, beforeEach, test, vi } from 'vitest'

import { createSaveQueue, type SaveOutcome, type SaveQueueOptions } from './save-queue'

const START = Date.parse('2026-10-04T10:00:00.000Z')

type Deferred = { promise: Promise<SaveOutcome>; resolve: (outcome: SaveOutcome) => void }
type Step = SaveOutcome | Error | Deferred

function deferred(): Deferred {
	let resolve!: (outcome: SaveOutcome) => void
	const promise = new Promise<SaveOutcome>((r) => {
		resolve = r
	})
	return { promise, resolve }
}

function isDeferred(step: Step): step is Deferred {
	return typeof step === 'object' && step !== null && 'promise' in step
}

type Call = { key: string; value: string; keepalive: boolean; at: number }

function setup(steps: Step[] = [], extra: Partial<SaveQueueOptions<string>> = {}) {
	const queueSteps = [...steps]
	const calls: Call[] = []
	const send = vi.fn(async (key: string, value: string, options: { keepalive: boolean }): Promise<SaveOutcome> => {
		calls.push({ key, value, keepalive: options.keepalive, at: Date.now() })
		const next = queueSteps.shift()
		if (next === undefined) return { kind: 'ok' }
		if (next instanceof Error) throw next
		if (isDeferred(next)) return next.promise
		return next
	})
	const onChange = vi.fn()
	const queue = createSaveQueue<string>({
		send,
		debounceMs: 600,
		maxWaitMs: 5000,
		clock: {
			now: () => Date.now(),
			setTimer: (callback, ms) => setTimeout(callback, ms),
			clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
		},
		onChange,
		...extra,
	})
	return { queue, send, calls, onChange }
}

function settle() {
	return vi.advanceTimersByTimeAsync(0)
}

beforeEach(() => {
	vi.useFakeTimers()
	vi.setSystemTime(START)
})

afterEach(() => {
	vi.useRealTimers()
})

test('дебаунс: до 599 мс отправки нет, на 600 мс одна отправка последнего значения', async () => {
	const { queue, calls } = setup()
	queue.set('q1', 'a')
	await vi.advanceTimersByTimeAsync(599)
	assert.equal(calls.length, 0)
	await vi.advanceTimersByTimeAsync(1)
	assert.deepEqual(
		calls.map(({ key, value, keepalive }) => [key, value, keepalive]),
		[['q1', 'a', false]]
	)
	assert.deepEqual(queue.getState().pending, [])
	queue.dispose()
})

test('наибольшее ожидание: непрерывный ввод уходит не позже 5000 мс от первого изменения', async () => {
	const { queue, calls } = setup()
	const sets: Array<{ at: number; value: string }> = []
	for (let index = 0; index * 300 <= 6000; index += 1) {
		const value = `v${index}`
		queue.set('q1', value)
		sets.push({ at: Date.now(), value })
		await vi.advanceTimersByTimeAsync(300)
	}
	assert.ok(calls.length >= 1)
	const first = calls[0]!
	assert.ok(first.at - START <= 5000)
	const latest = sets.filter((set) => set.at <= first.at).at(-1)!
	assert.equal(first.value, latest.value)
	queue.dispose()
})

test('ключи уходят по одному: второй только после исхода первого', async () => {
	const gate = deferred()
	const { queue, calls } = setup([gate])
	queue.set('q1', 'a')
	queue.set('q2', 'b')
	await vi.advanceTimersByTimeAsync(600)
	assert.deepEqual(
		calls.map((call) => call.key),
		['q1']
	)
	assert.equal(queue.getState().inFlight, 'q1')
	await vi.advanceTimersByTimeAsync(5000)
	assert.equal(calls.length, 1)
	gate.resolve({ kind: 'ok' })
	await settle()
	assert.deepEqual(
		calls.map((call) => call.key),
		['q1', 'q2']
	)
	assert.deepEqual(queue.getState().pending, [])
	assert.equal(queue.getState().inFlight, null)
	queue.dispose()
})

test('версия значения: подтверждение старой версии не снимает ключ, затем уходит новое значение', async () => {
	const gate = deferred()
	const { queue, calls } = setup([gate])
	queue.set('q1', 'a')
	await vi.advanceTimersByTimeAsync(600)
	assert.equal(calls[0]?.value, 'a')
	queue.set('q1', 'b')
	gate.resolve({ kind: 'ok' })
	await settle()
	assert.deepEqual(queue.getState().pending, ['q1'])
	await vi.advanceTimersByTimeAsync(600)
	assert.deepEqual(
		calls.map((call) => call.value),
		['a', 'b']
	)
	assert.deepEqual(queue.getState().pending, [])
	queue.dispose()
})

test('повторы с паузами 1, 2, 5, 10, 30, 30 с; после успеха счётчик и failure сбрасываются', async () => {
	const retry: SaveOutcome = { kind: 'retry' }
	const { queue, calls } = setup([retry, retry, retry, retry, retry, retry, { kind: 'ok' }, retry])
	queue.set('q1', 'a')
	await vi.advanceTimersByTimeAsync(600)
	assert.equal(calls.length, 1)
	assert.deepEqual(queue.getState().failure, { kind: 'retrying', attempt: 1 })
	const delays = [1000, 2000, 5000, 10000, 30000, 30000]
	for (const [index, delay] of delays.entries()) {
		await vi.advanceTimersByTimeAsync(delay - 1)
		assert.equal(calls.length, index + 1)
		await vi.advanceTimersByTimeAsync(1)
		assert.equal(calls.length, index + 2)
		if (index < delays.length - 1) {
			assert.deepEqual(queue.getState().failure, { kind: 'retrying', attempt: index + 2 })
		}
	}
	assert.equal(queue.getState().failure, null)
	assert.deepEqual(queue.getState().pending, [])
	assert.equal(vi.getTimerCount(), 0)
	queue.set('q1', 'b')
	await vi.advanceTimersByTimeAsync(600)
	assert.deepEqual(queue.getState().failure, { kind: 'retrying', attempt: 1 })
	await vi.advanceTimersByTimeAsync(999)
	assert.equal(calls.length, 8)
	await vi.advanceTimersByTimeAsync(1)
	assert.equal(calls.length, 9)
	queue.dispose()
})

test('изменение во время паузы повтора уходит по дебаунсу, таймер повтора снимается', async () => {
	const { queue, calls } = setup([{ kind: 'retry' }], { retryDelaysMs: [5000] })
	queue.set('q1', 'a')
	await vi.advanceTimersByTimeAsync(600)
	assert.equal(calls.length, 1)
	await vi.advanceTimersByTimeAsync(100)
	queue.set('q1', 'b')
	await vi.advanceTimersByTimeAsync(599)
	assert.equal(calls.length, 1)
	await vi.advanceTimersByTimeAsync(1)
	assert.deepEqual(
		calls.map((call) => call.value),
		['a', 'b']
	)
	assert.equal(queue.getState().failure, null)
	assert.equal(vi.getTimerCount(), 0)
	await vi.advanceTimersByTimeAsync(10000)
	assert.equal(calls.length, 2)
	queue.dispose()
})

test('retryNow отправляет неподтверждённое сразу', async () => {
	const { queue, calls } = setup([{ kind: 'retry' }])
	queue.set('q1', 'a')
	await vi.advanceTimersByTimeAsync(600)
	assert.equal(calls.length, 1)
	queue.retryNow()
	await settle()
	assert.equal(calls.length, 2)
	assert.equal(queue.getState().failure, null)
	assert.deepEqual(queue.getState().pending, [])
	assert.equal(vi.getTimerCount(), 0)
	queue.dispose()
})

test('stop останавливает отправку всех ключей до resume; set копит значения; retryNow не снимает stopped', async () => {
	const { queue, calls } = setup([{ kind: 'stop', status: 403 }])
	queue.set('q1', 'a')
	queue.set('q2', 'b')
	await vi.advanceTimersByTimeAsync(600)
	assert.equal(calls.length, 1)
	assert.deepEqual(queue.getState().failure, { kind: 'stopped', status: 403 })
	assert.deepEqual(queue.getState().pending, ['q1', 'q2'])
	await vi.advanceTimersByTimeAsync(60000)
	assert.equal(calls.length, 1)
	queue.set('q3', 'c')
	await vi.advanceTimersByTimeAsync(60000)
	assert.equal(calls.length, 1)
	assert.deepEqual(queue.getState().pending, ['q1', 'q2', 'q3'])
	queue.retryNow()
	await settle()
	assert.equal(calls.length, 1)
	assert.deepEqual(queue.getState().failure, { kind: 'stopped', status: 403 })
	assert.equal(vi.getTimerCount(), 0)
	queue.resume()
	assert.equal(queue.getState().failure, null)
	await settle()
	assert.deepEqual(
		calls.map((call) => call.key),
		['q1', 'q1', 'q2', 'q3']
	)
	assert.deepEqual(queue.getState().pending, [])
	queue.dispose()
})

test('reject: ключ в rejected, не в pending, без повторов; новое значение возвращает его в pending', async () => {
	const { queue, calls } = setup([{ kind: 'reject', status: 400 }])
	queue.set('q1', 'a')
	await vi.advanceTimersByTimeAsync(600)
	assert.deepEqual(queue.getState().rejected, ['q1'])
	assert.deepEqual(queue.getState().pending, [])
	assert.equal(queue.getState().failure, null)
	await vi.advanceTimersByTimeAsync(60000)
	assert.equal(calls.length, 1)
	queue.set('q1', 'b')
	assert.deepEqual(queue.getState().rejected, [])
	assert.deepEqual(queue.getState().pending, ['q1'])
	await vi.advanceTimersByTimeAsync(600)
	assert.equal(calls.length, 2)
	assert.deepEqual(queue.getState().pending, [])
	queue.dispose()
})

test.each(
	(
		[
			{ name: 'исключение send', fail: () => Promise.reject(new TypeError('Failed to fetch')) },
			{
				name: 'синхронное исключение send',
				fail: () => {
					throw new Error('boom')
				},
			},
		] as { name: string; fail: () => Promise<SaveOutcome> }[]
	).map((row): [string, { name: string; fail: () => Promise<SaveOutcome> }] => [row.name, row])
)('%s приравнено к retry', async (_name, { fail }) => {
	let count = 0
	const { queue } = setup([], {
		send: () => {
			count += 1
			if (count === 1) return fail()
			return Promise.resolve({ kind: 'ok' })
		},
	})
	queue.set('q1', 'a')
	await vi.advanceTimersByTimeAsync(600)
	assert.deepEqual(queue.getState().failure, { kind: 'retrying', attempt: 1 })
	assert.deepEqual(queue.getState().pending, ['q1'])
	await vi.advanceTimersByTimeAsync(1000)
	assert.equal(count, 2)
	assert.equal(queue.getState().failure, null)
	assert.deepEqual(queue.getState().pending, [])
	queue.dispose()
})

test('flush снимает дебаунс и разрешается ok после подтверждения всех ключей', async () => {
	const { queue, calls } = setup()
	queue.set('q1', 'a')
	queue.set('q2', 'b')
	let result: unknown = null
	void queue.flush().then((value) => {
		result = value
	})
	await settle()
	assert.deepEqual(
		calls.map((call) => call.key),
		['q1', 'q2']
	)
	assert.deepEqual(result, { ok: true })
	assert.equal(vi.getTimerCount(), 0)
	queue.dispose()
})

test('flush при пустой очереди разрешается ok сразу', async () => {
	const { queue, calls } = setup()
	assert.deepEqual(await queue.flush(), { ok: true })
	assert.equal(calls.length, 0)
	queue.dispose()
})

test('flush ждёт запись последней версии в полёте и не шлёт дубль; второй flush присоединяется', async () => {
	const gate = deferred()
	const { queue, calls } = setup([gate])
	queue.set('q1', 'a')
	await vi.advanceTimersByTimeAsync(600)
	let first: unknown = null
	let second: unknown = null
	void queue.flush().then((value) => {
		first = value
	})
	void queue.flush().then((value) => {
		second = value
	})
	await settle()
	assert.equal(calls.length, 1)
	assert.equal(first, null)
	gate.resolve({ kind: 'ok' })
	await settle()
	assert.deepEqual(first, { ok: true })
	assert.deepEqual(second, { ok: true })
	assert.equal(calls.length, 1)
	queue.dispose()
})

test.each(
	(
		[
			{
				name: 'flush при неудаче разрешается ok false без ожидания повторов',
				outcome: { kind: 'retry' },
				failure: { kind: 'retrying', attempt: 1 },
			},
			{ name: 'flush при reject разрешается ok false с исходом', outcome: { kind: 'reject', status: 400 } },
		] as { name: string; outcome: SaveOutcome; failure?: unknown }[]
	).map((row): [string, { name: string; outcome: SaveOutcome; failure?: unknown }] => [row.name, row])
)('%s', async (_name, { outcome, failure }) => {
	const { queue, calls } = setup([outcome])
	queue.set('q1', 'a')
	let result: unknown = null
	void queue.flush().then((value) => {
		result = value
	})
	await settle()
	assert.equal(calls.length, 1)
	assert.deepEqual(result, { ok: false, outcome })
	if (failure !== undefined) assert.deepEqual(queue.getState().failure, failure)
	queue.dispose()
})

test('flush при stopped разрешается сразу ok false со статусом', async () => {
	const { queue, calls } = setup([{ kind: 'stop', status: 404 }])
	queue.set('q1', 'a')
	await vi.advanceTimersByTimeAsync(600)
	queue.set('q2', 'b')
	assert.deepEqual(await queue.flush(), { ok: false, outcome: { kind: 'stop', status: 404 } })
	assert.equal(calls.length, 1)
	queue.dispose()
})

test('drain с keepalive сразу шлёт все pending, включая ключ последней версии в полёте', async () => {
	const gate = deferred()
	const { queue, calls } = setup([gate, deferred(), deferred()])
	queue.set('q1', 'a')
	await vi.advanceTimersByTimeAsync(600)
	queue.set('q2', 'b')
	queue.drain({ keepalive: true })
	assert.deepEqual(
		calls.map(({ key, value, keepalive }) => [key, value, keepalive]),
		[
			['q1', 'a', false],
			['q1', 'a', true],
			['q2', 'b', true],
		]
	)
	assert.equal(vi.getTimerCount(), 0)
	queue.dispose()
})

test('drain без keepalive не дублирует запись в полёте', async () => {
	const gate = deferred()
	const { queue, calls } = setup([gate])
	queue.set('q1', 'a')
	await vi.advanceTimersByTimeAsync(600)
	queue.set('q2', 'b')
	queue.drain({ keepalive: false })
	assert.deepEqual(
		calls.map(({ key, value, keepalive }) => [key, value, keepalive]),
		[
			['q1', 'a', false],
			['q2', 'b', false],
		]
	)
	await settle()
	assert.deepEqual(queue.getState().pending, ['q1'])
	gate.resolve({ kind: 'ok' })
	await settle()
	assert.deepEqual(queue.getState().pending, [])
	assert.equal(calls.length, 2)
	queue.dispose()
})

test('discard: pending пуст, таймеров нет, поздний ответ не меняет состояние и не вызывает onChange', async () => {
	const gate = deferred()
	const { queue, calls, onChange } = setup([gate])
	queue.set('q1', 'a')
	await vi.advanceTimersByTimeAsync(600)
	queue.set('q2', 'b')
	queue.discard()
	const state = queue.getState()
	assert.deepEqual(state.pending, [])
	assert.equal(state.inFlight, null)
	assert.equal(state.oldestPendingSince, null)
	assert.equal(vi.getTimerCount(), 0)
	const changes = onChange.mock.calls.length
	gate.resolve({ kind: 'retry' })
	await settle()
	assert.equal(onChange.mock.calls.length, changes)
	assert.equal(queue.getState(), state)
	assert.equal(vi.getTimerCount(), 0)
	queue.set('q3', 'c')
	await vi.advanceTimersByTimeAsync(600)
	assert.deepEqual(
		calls.map((call) => call.key),
		['q1', 'q3']
	)
	assert.deepEqual(queue.getState().pending, [])
	queue.dispose()
})

test('close снимает таймеры и pending и разрешается после исхода записи в полёте', async () => {
	const gate = deferred()
	const { queue, calls } = setup([gate])
	queue.set('q1', 'a')
	await vi.advanceTimersByTimeAsync(600)
	queue.set('q2', 'b')
	let closed = false
	void queue.close().then(() => {
		closed = true
	})
	assert.deepEqual(queue.getState().pending, [])
	assert.equal(vi.getTimerCount(), 0)
	await settle()
	assert.equal(closed, false)
	gate.resolve({ kind: 'retry' })
	await settle()
	assert.equal(closed, true)
	assert.equal(vi.getTimerCount(), 0)
	queue.set('q3', 'c')
	await vi.advanceTimersByTimeAsync(60000)
	assert.equal(calls.length, 1)
	queue.dispose()
})

test('close без записи в полёте разрешается сразу', async () => {
	const { queue, calls } = setup()
	queue.set('q1', 'a')
	await queue.close()
	assert.equal(calls.length, 0)
	assert.equal(vi.getTimerCount(), 0)
	queue.dispose()
})

test('dispose: таймеров нет, send больше не вызывается', async () => {
	const { queue, calls } = setup([{ kind: 'retry' }])
	queue.set('q1', 'a')
	await vi.advanceTimersByTimeAsync(600)
	queue.set('q2', 'b')
	queue.dispose()
	assert.equal(vi.getTimerCount(), 0)
	queue.set('q3', 'c')
	queue.retryNow()
	queue.resume()
	queue.drain({ keepalive: true })
	await vi.advanceTimersByTimeAsync(60000)
	assert.equal(calls.length, 1)
	assert.equal(vi.getTimerCount(), 0)
})

test('oldestPendingSince: время первого неподтверждённого изменения, null при пустом pending', async () => {
	const gate = deferred()
	const { queue } = setup([gate])
	assert.equal(queue.getState().oldestPendingSince, null)
	queue.set('q1', 'a')
	assert.equal(queue.getState().oldestPendingSince, START)
	await vi.advanceTimersByTimeAsync(100)
	queue.set('q1', 'a2')
	queue.set('q2', 'b')
	assert.equal(queue.getState().oldestPendingSince, START)
	await vi.advanceTimersByTimeAsync(600)
	assert.equal(queue.getState().inFlight, 'q1')
	await vi.advanceTimersByTimeAsync(50)
	queue.set('q1', 'a3')
	gate.resolve({ kind: 'ok' })
	await settle()
	assert.deepEqual(queue.getState().pending, ['q1'])
	assert.equal(queue.getState().oldestPendingSince, START + 750)
	await vi.advanceTimersByTimeAsync(5000)
	assert.deepEqual(queue.getState().pending, [])
	assert.equal(queue.getState().oldestPendingSince, null)
	queue.dispose()
})

test('onChange вызывается при каждой смене состояния', async () => {
	const gate = deferred()
	const { queue, onChange } = setup([gate])
	queue.set('q1', 'a')
	const afterSet = onChange.mock.calls.length
	assert.ok(afterSet >= 1)
	await vi.advanceTimersByTimeAsync(600)
	const afterSend = onChange.mock.calls.length
	assert.ok(afterSend > afterSet)
	assert.equal(queue.getState().inFlight, 'q1')
	gate.resolve({ kind: 'ok' })
	await settle()
	assert.ok(onChange.mock.calls.length > afterSend)
	assert.equal(queue.getState().inFlight, null)
	queue.dispose()
})

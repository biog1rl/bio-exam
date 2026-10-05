import assert from 'node:assert/strict'
import { afterEach, beforeEach, test, vi } from 'vitest'

import { createDebounced, type DebounceTimers } from './debounced'

const START = Date.parse('2026-10-05T10:00:00.000Z')

const timers: DebounceTimers = {
	setTimer: (callback, ms) => setTimeout(callback, ms),
	clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
	now: () => Date.now(),
}

function recorder() {
	const calls: Array<[number, number]> = []
	const fn = (value: number) => {
		calls.push([Date.now() - START, value])
	}
	return { calls, fn }
}

function callEvery(debounced: (value: number) => void, stepMs: number, count: number): void {
	for (let value = 0; value < count; value++) {
		if (value > 0) vi.advanceTimersByTime(stepMs)
		debounced(value)
	}
}

beforeEach(() => {
	vi.useFakeTimers()
	vi.setSystemTime(START)
})

afterEach(() => {
	vi.useRealTimers()
})

test('серия вызовов за ms даёт один вызов с последними аргументами', () => {
	const { calls, fn } = recorder()
	const debounced = createDebounced(fn, 50, { timers })
	debounced(1)
	vi.advanceTimersByTime(10)
	debounced(2)
	vi.advanceTimersByTime(10)
	debounced(3)
	vi.advanceTimersByTime(49)
	assert.deepEqual(calls, [])
	vi.advanceTimersByTime(1)
	assert.deepEqual(calls, [[70, 3]])
	vi.advanceTimersByTime(500)
	assert.deepEqual(calls, [[70, 3]])
})

test('maxWait ограничивает задержку при непрерывных вызовах, как lodash debounce', () => {
	const { calls, fn } = recorder()
	const debounced = createDebounced(fn, 50, { maxWait: 100, timers })
	callEvery(debounced, 10, 31)
	vi.advanceTimersByTime(1000)
	assert.deepEqual(calls, [
		[100, 9],
		[200, 19],
		[300, 29],
		[350, 30],
	])
})

test('без maxWait непрерывные вызовы откладывают вызов до паузы', () => {
	const { calls, fn } = recorder()
	const debounced = createDebounced(fn, 50, { timers })
	callEvery(debounced, 10, 31)
	vi.advanceTimersByTime(1000)
	assert.deepEqual(calls, [[350, 30]])
})

test('maxWait меньше ms поднимается до ms, как lodash debounce', () => {
	const { calls, fn } = recorder()
	const debounced = createDebounced(fn, 50, { maxWait: 0, timers })
	callEvery(debounced, 10, 31)
	vi.advanceTimersByTime(1000)
	assert.deepEqual(calls, [
		[50, 4],
		[100, 9],
		[150, 14],
		[200, 19],
		[250, 24],
		[300, 29],
		[350, 30],
	])
})

test('две серии с паузой дают два вызова', () => {
	const calls: Array<[number, string]> = []
	const debounced = createDebounced(
		(value: string) => {
			calls.push([Date.now() - START, value])
		},
		50,
		{ maxWait: 1000, timers }
	)
	debounced('a')
	vi.advanceTimersByTime(20)
	debounced('b')
	vi.advanceTimersByTime(180)
	debounced('c')
	vi.advanceTimersByTime(1000)
	assert.deepEqual(calls, [
		[70, 'b'],
		[250, 'c'],
	])
})

test('cancel отменяет ожидающий вызов, после отмены функция снова работает', () => {
	const { calls, fn } = recorder()
	const debounced = createDebounced(fn, 50, { maxWait: 100, timers })
	debounced(1)
	vi.advanceTimersByTime(30)
	debounced.cancel()
	vi.advanceTimersByTime(500)
	assert.deepEqual(calls, [])
	assert.equal(vi.getTimerCount(), 0)
	debounced(2)
	vi.advanceTimersByTime(50)
	assert.deepEqual(calls, [[580, 2]])
})

test('flush вызывает ожидающий вызов немедленно и только один раз', () => {
	const { calls, fn } = recorder()
	const debounced = createDebounced(fn, 50, { timers })
	debounced.flush()
	assert.deepEqual(calls, [])
	debounced(1)
	vi.advanceTimersByTime(10)
	debounced(2)
	debounced.flush()
	assert.deepEqual(calls, [[10, 2]])
	vi.advanceTimersByTime(500)
	assert.deepEqual(calls, [[10, 2]])
})

test('шов таймеров: без timers используются setTimeout и Date.now', () => {
	const { calls, fn } = recorder()
	const debounced = createDebounced(fn, 50)
	debounced(7)
	assert.equal(vi.getTimerCount(), 1)
	vi.advanceTimersByTime(50)
	assert.deepEqual(calls, [[50, 7]])
})

test('шов таймеров: вызовы идут только через переданные setTimer, clearTimer и now', () => {
	let clock = 0
	const scheduled = new Map<number, { at: number; callback: () => void }>()
	let nextId = 0
	const cleared: number[] = []
	const manual: DebounceTimers = {
		setTimer: (callback, ms) => {
			nextId++
			scheduled.set(nextId, { at: clock + ms, callback })
			return nextId
		},
		clearTimer: (handle) => {
			cleared.push(handle as number)
			scheduled.delete(handle as number)
		},
		now: () => clock,
	}
	const calls: number[] = []
	const debounced = createDebounced((value: number) => calls.push(value), 50, { timers: manual })
	debounced(1)
	assert.equal(scheduled.size, 1)
	assert.equal(vi.getTimerCount(), 0)
	clock = 50
	for (const [id, timer] of [...scheduled]) {
		scheduled.delete(id)
		if (timer.at <= clock) timer.callback()
	}
	assert.deepEqual(calls, [1])
	debounced(2)
	debounced.cancel()
	assert.deepEqual(cleared, [2])
	assert.equal(scheduled.size, 0)
})

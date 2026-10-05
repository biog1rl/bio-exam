import assert from 'node:assert/strict'
import { afterEach, beforeEach, test, vi } from 'vitest'

import { createHarness } from '@/test-support/fake-react'

import { useDebounce } from './use-debounce'

vi.mock('react', async (importOriginal) =>
	(await import('@/test-support/fake-react')).mockReact(await importOriginal<Record<string, unknown>>())
)

beforeEach(() => {
	vi.useFakeTimers()
})

afterEach(() => {
	vi.useRealTimers()
	vi.unstubAllGlobals()
})

function spyFns() {
	const calls: string[] = []
	return {
		calls,
		first: (value: string) => calls.push(`first:${value}`),
		second: (value: string) => calls.push(`second:${value}`),
	}
}

test('при рендере ref колбэка не меняется, меняется только при коммите эффектов', () => {
	const harness = createHarness()
	const { calls, first, second } = spyFns()
	const debounced = harness.render(() => useDebounce(first, 50))
	const again = harness.renderPhase(() => useDebounce(second, 50))
	assert.equal(again, debounced)
	debounced('render')
	vi.advanceTimersByTime(50)
	assert.deepEqual(calls, ['first:render'])
	harness.commit()
	debounced('commit')
	vi.advanceTimersByTime(50)
	assert.deepEqual(calls, ['first:render', 'second:commit'])
})

test('на сервере ref пишется в useEffect, в браузере — в useLayoutEffect', async () => {
	const server = createHarness()
	server.render(() => useDebounce(() => {}, 50))
	assert.deepEqual(
		server.effects().map((effect) => effect.kind),
		['passive', 'passive']
	)
	assert.equal(server.effects()[0].deps, undefined)

	vi.resetModules()
	vi.stubGlobal('window', {})
	const { useDebounce: clientUseDebounce } = await import('./use-debounce')
	assert.notEqual(clientUseDebounce, useDebounce)
	const client = createHarness()
	const { calls, first, second } = spyFns()
	const debounced = client.render(() => clientUseDebounce(first, 50))
	assert.deepEqual(
		client.effects().map((effect) => effect.kind),
		['layout', 'passive']
	)
	client.renderPhase(() => clientUseDebounce(second, 50))
	debounced('render')
	vi.advanceTimersByTime(50)
	client.commit()
	debounced('commit')
	vi.advanceTimersByTime(50)
	assert.deepEqual(calls, ['first:render', 'second:commit'])
})

test('с теми же ms и maxWait функция та же, со сменой ms — новая, а ожидающий вызов старой отменён', () => {
	const harness = createHarness()
	const { calls, first } = spyFns()
	const debounced = harness.render(() => useDebounce(first, 50, 1000))
	assert.equal(
		harness.render(() => useDebounce(first, 50, 1000)),
		debounced
	)
	debounced('old')
	const cancel = vi.spyOn(debounced, 'cancel')
	const changed = harness.render(() => useDebounce(first, 100, 1000))
	assert.notEqual(changed, debounced)
	assert.equal(cancel.mock.calls.length, 1)
	vi.advanceTimersByTime(1000)
	assert.deepEqual(calls, [])
	changed('new')
	vi.advanceTimersByTime(100)
	assert.deepEqual(calls, ['first:new'])
	assert.notEqual(
		harness.render(() => useDebounce(first, 100, 2000)),
		changed
	)
})

test('размонтирование отменяет ожидающий вызов', () => {
	const harness = createHarness()
	const { calls, first } = spyFns()
	const debounced = harness.render(() => useDebounce(first, 50))
	debounced('pending')
	harness.unmount()
	vi.advanceTimersByTime(1000)
	assert.deepEqual(calls, [])
	assert.equal(vi.getTimerCount(), 0)
})

test('StrictMode: эффект, очистка, эффект — отмена ровно одна, функция работает дальше', () => {
	const harness = createHarness()
	const { calls, first } = spyFns()
	const debounced = harness.render(() => useDebounce(first, 50))
	debounced('before')
	const cancel = vi.spyOn(debounced, 'cancel')
	harness.strictRemount()
	assert.equal(cancel.mock.calls.length, 1)
	vi.advanceTimersByTime(1000)
	assert.deepEqual(calls, [])
	assert.equal(
		harness.render(() => useDebounce(first, 50)),
		debounced
	)
	debounced('after')
	vi.advanceTimersByTime(49)
	assert.deepEqual(calls, [])
	vi.advanceTimersByTime(1)
	assert.deepEqual(calls, ['first:after'])
})

test('без maxWait потолок равен ms, как у прежнего lodash debounce с { maxWait: undefined }', () => {
	const harness = createHarness()
	const values: number[] = []
	const debounced = harness.render(() => useDebounce((value: number) => values.push(value), 50))
	for (let value = 0; value < 11; value++) {
		if (value > 0) vi.advanceTimersByTime(10)
		debounced(value)
	}
	vi.advanceTimersByTime(1000)
	assert.deepEqual(values, [4, 9, 10])
})

import assert from 'node:assert/strict'
import { test } from 'vitest'

import { createBeforeUnloadGuard, type BeforeUnloadWindow } from './before-unload'

function fakeWindow() {
	const listeners = new Map<string, Set<(event: Event) => void>>()
	const win: BeforeUnloadWindow = {
		addEventListener: (type, listener) => {
			const set = listeners.get(type) ?? new Set()
			set.add(listener)
			listeners.set(type, set)
		},
		removeEventListener: (type, listener) => {
			listeners.get(type)?.delete(listener)
		},
	}
	return {
		win,
		count: (type: string) => listeners.get(type)?.size ?? 0,
		listeners: (type: string) => [...(listeners.get(type) ?? [])],
	}
}

test('начально 0 слушателей; setActive(true) дважды → 1; setActive(false) → 0', () => {
	const page = fakeWindow()
	const guard = createBeforeUnloadGuard(page.win)
	assert.equal(page.count('beforeunload'), 0)
	guard.setActive(true)
	guard.setActive(true)
	assert.equal(page.count('beforeunload'), 1)
	guard.setActive(false)
	assert.equal(page.count('beforeunload'), 0)
	guard.setActive(false)
	assert.equal(page.count('beforeunload'), 0)
})

test('слушатель вызывает preventDefault и ставит returnValue пустой строкой', () => {
	const page = fakeWindow()
	const guard = createBeforeUnloadGuard(page.win)
	guard.setActive(true)
	let prevented = false
	const event = {
		returnValue: undefined as unknown,
		preventDefault() {
			prevented = true
		},
	}
	const [listener] = page.listeners('beforeunload')
	assert.ok(listener)
	listener(event as unknown as Event)
	assert.equal(prevented, true)
	assert.equal(event.returnValue, '')
})

test('dispose снимает слушатель, после dispose setActive ничего не подключает', () => {
	const page = fakeWindow()
	const guard = createBeforeUnloadGuard(page.win)
	guard.setActive(true)
	guard.dispose()
	assert.equal(page.count('beforeunload'), 0)
	guard.setActive(true)
	assert.equal(page.count('beforeunload'), 0)
})

test('две охраны на одном окне держат свои слушатели независимо', () => {
	const page = fakeWindow()
	const first = createBeforeUnloadGuard(page.win)
	const second = createBeforeUnloadGuard(page.win)
	first.setActive(true)
	second.setActive(true)
	assert.equal(page.count('beforeunload'), 2)
	first.dispose()
	assert.equal(page.count('beforeunload'), 1)
	second.setActive(false)
	assert.equal(page.count('beforeunload'), 0)
})

import assert from 'node:assert/strict'
import { afterEach, test, vi } from 'vitest'

import { prefersReducedMotion } from './reduced-motion'

afterEach(() => {
	vi.unstubAllGlobals()
})

function fakeMatchMedia(matches: boolean) {
	const queries: string[] = []
	const matchMedia = (query: string) => {
		queries.push(query)
		return { matches }
	}
	return { queries, matchMedia }
}

test('при matches true для запроса reduce возвращает true', () => {
	const { queries, matchMedia } = fakeMatchMedia(true)
	assert.equal(prefersReducedMotion(matchMedia), true)
	assert.deepEqual(queries, ['(prefers-reduced-motion: reduce)'])
})

test('при matches false возвращает false', () => {
	const { queries, matchMedia } = fakeMatchMedia(false)
	assert.equal(prefersReducedMotion(matchMedia), false)
	assert.deepEqual(queries, ['(prefers-reduced-motion: reduce)'])
})

test('без matchMedia в среде node возвращает false', () => {
	assert.equal(typeof (globalThis as { matchMedia?: unknown }).matchMedia, 'undefined')
	assert.equal(prefersReducedMotion(), false)
})

test('без аргумента берёт globalThis.matchMedia в момент вызова', () => {
	const { queries, matchMedia } = fakeMatchMedia(true)
	vi.stubGlobal('matchMedia', matchMedia)
	assert.equal(prefersReducedMotion(), true)
	assert.deepEqual(queries, ['(prefers-reduced-motion: reduce)'])
})

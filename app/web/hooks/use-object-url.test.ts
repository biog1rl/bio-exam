import assert from 'node:assert/strict'
import { afterEach, beforeEach, test, vi } from 'vitest'

import { createHarness } from '@/test-support/fake-react'

import { useObjectUrl } from './use-object-url'

vi.mock('react', async (importOriginal) =>
	(await import('@/test-support/fake-react')).mockReact(await importOriginal<Record<string, unknown>>())
)

let created: string[] = []
let revoked: string[] = []

beforeEach(() => {
	created = []
	revoked = []
	let counter = 0
	vi.stubGlobal('URL', {
		createObjectURL: () => {
			counter += 1
			const url = `blob:test/${counter}`
			created.push(url)
			return url
		},
		revokeObjectURL: (url: string) => {
			revoked.push(url)
		},
	})
})

afterEach(() => {
	vi.unstubAllGlobals()
})

const fileA = new Blob(['a'])
const fileB = new Blob(['b'])

test('при рендере ссылка не создаётся, создаётся в эффекте', () => {
	const harness = createHarness()
	const first = harness.renderPhase(() => useObjectUrl(fileA))
	assert.equal(first, null)
	assert.deepEqual(created, [])
	harness.commit()
	assert.deepEqual(created, ['blob:test/1'])
	assert.equal(
		harness.renderPhase(() => useObjectUrl(fileA)),
		'blob:test/1'
	)
})

test('без файла ссылки нет и ничего не создаётся', () => {
	const harness = createHarness()
	assert.equal(
		harness.render(() => useObjectUrl(null)),
		null
	)
	harness.commit()
	assert.equal(
		harness.renderPhase(() => useObjectUrl(null)),
		null
	)
	assert.deepEqual(created, [])
	assert.deepEqual(revoked, [])
})

test('при смене файла прежняя ссылка освобождается', () => {
	const harness = createHarness()
	harness.render(() => useObjectUrl(fileA))
	harness.render(() => useObjectUrl(fileB))
	assert.deepEqual(created, ['blob:test/1', 'blob:test/2'])
	assert.deepEqual(revoked, ['blob:test/1'])
	assert.equal(
		harness.renderPhase(() => useObjectUrl(fileB)),
		'blob:test/2'
	)
})

test('при сбросе файла ссылка освобождается и значение становится null', () => {
	const harness = createHarness()
	harness.render(() => useObjectUrl(fileA))
	harness.render(() => useObjectUrl(null))
	assert.deepEqual(revoked, ['blob:test/1'])
	assert.equal(
		harness.renderPhase(() => useObjectUrl(null)),
		null
	)
})

test('при размонтировании последняя ссылка освобождается', () => {
	const harness = createHarness()
	harness.render(() => useObjectUrl(fileA))
	harness.unmount()
	assert.deepEqual(revoked, ['blob:test/1'])
})

test('строгий перемонтаж освобождает старую ссылку и отдаёт новую', () => {
	const harness = createHarness()
	harness.render(() => useObjectUrl(fileA))
	harness.strictRemount()
	assert.deepEqual(created, ['blob:test/1', 'blob:test/2'])
	assert.deepEqual(revoked, ['blob:test/1'])
	assert.equal(
		harness.renderPhase(() => useObjectUrl(fileA)),
		'blob:test/2'
	)
	harness.unmount()
	assert.deepEqual(revoked, ['blob:test/1', 'blob:test/2'])
})

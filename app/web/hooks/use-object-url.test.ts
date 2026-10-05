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

test.each(
	(
		[
			{
				name: 'при смене файла прежняя ссылка освобождается',
				next: fileB,
				created: ['blob:test/1', 'blob:test/2'],
				value: 'blob:test/2',
			},
			{
				name: 'при сбросе файла ссылка освобождается и значение становится null',
				next: null,
				created: ['blob:test/1'],
				value: null,
			},
			{ name: 'при размонтировании последняя ссылка освобождается', next: 'unmount', created: ['blob:test/1'] },
		] as { name: string; next: Blob | null | 'unmount'; created: string[]; value?: string | null }[]
	).map((row): [string, { name: string; next: Blob | null | 'unmount'; created: string[]; value?: string | null }] => [
		row.name,
		row,
	])
)('%s', (_name, { next, created: expectedCreated, value }) => {
	const harness = createHarness()
	harness.render(() => useObjectUrl(fileA))
	if (next === 'unmount') harness.unmount()
	else harness.render(() => useObjectUrl(next))
	assert.deepEqual(created, expectedCreated)
	assert.deepEqual(revoked, ['blob:test/1'])
	if (next !== 'unmount') {
		assert.equal(
			harness.renderPhase(() => useObjectUrl(next)),
			value
		)
	}
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

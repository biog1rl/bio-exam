import { createClient } from '@supabase/supabase-js'

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, test } from 'vitest'

import {
	createSupabaseStorageFake,
	fakeSupabaseClient,
	type SupabaseStorageFake,
} from '../../test-support/supabase-storage-fake.js'
import { createLocalAdapter } from './adapters/local.js'
import { createMemoryAdapter } from './adapters/memory.js'
import { createSupabaseAdapter } from './adapters/supabase.js'
import { createStorage, storageUrl, type StorageModule } from './index.js'
import type { StorageAdapter } from './port.js'

type AdapterSpy = { counts: Map<string, number>; total(): number; count(method: string): number }

type ContractContext = {
	adapter: StorageAdapter
	parentDir: string | null
	fake: SupabaseStorageFake | null
	cleanup(): void
}

type ContractFactory = { name: 'local' | 'supabase-fake' | 'memory'; make(): ContractContext }

function errorNamed(name: string): (error: unknown) => boolean {
	return (error) => error instanceof Error && error.name === name
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

function snapshot(dir: string): string[] {
	const result: string[] = []
	const walk = (current: string, prefix: string) => {
		for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
			const rel = prefix ? `${prefix}/${entry.name}` : entry.name
			if (entry.isDirectory()) {
				result.push(`${rel}/`)
				walk(path.join(current, entry.name), rel)
			} else {
				result.push(`${rel}:${fs.readFileSync(path.join(current, entry.name)).toString('hex')}`)
			}
		}
	}
	walk(dir, '')
	return result.sort()
}

function spyOn(adapter: StorageAdapter): { adapter: StorageAdapter; spy: AdapterSpy } {
	const counts = new Map<string, number>()
	const proxy = new Proxy(adapter, {
		get(target, property, receiver) {
			const value = Reflect.get(target, property, receiver)
			if (typeof value !== 'function') return value
			return (...args: unknown[]) => {
				const name = String(property)
				counts.set(name, (counts.get(name) ?? 0) + 1)
				return Reflect.apply(value, target, args)
			}
		},
	})
	return {
		adapter: proxy,
		spy: {
			counts,
			total: () => [...counts.values()].reduce((sum, value) => sum + value, 0),
			count: (method) => counts.get(method) ?? 0,
		},
	}
}

const factories: ContractFactory[] = [
	{
		name: 'local',
		make() {
			const base = fs.mkdtempSync(path.join(os.tmpdir(), 'bio-exam-contract-'))
			const root = path.join(base, 'data')
			fs.mkdirSync(root, { recursive: true })
			fs.mkdirSync(path.join(base, 'outside'), { recursive: true })
			fs.writeFileSync(path.join(base, 'outside', 'secret.md'), 'secret')
			return {
				adapter: createLocalAdapter({ root }),
				parentDir: base,
				fake: null,
				cleanup: () => fs.rmSync(base, { recursive: true, force: true }),
			}
		},
	},
	{
		name: 'supabase-fake',
		make() {
			const fake = createSupabaseStorageFake()
			const client = fakeSupabaseClient(fake, createClient)
			return {
				adapter: createSupabaseAdapter({ client, bucket: 'main', retries: 2, baseDelayMs: 1 }),
				parentDir: null,
				fake,
				cleanup: () => {},
			}
		},
	},
	{
		name: 'memory',
		make() {
			return { adapter: createMemoryAdapter(), parentDir: null, fake: null, cleanup: () => {} }
		},
	},
]

const hostileKeys: Array<{ name: string; key: string }> = [
	{ name: 'parent segment', key: '../x' },
	{ name: 'parent segment inside a namespace', key: 'images/../topics/x' },
	{ name: 'encoded slash after a parent segment', key: 'images/..%2fx' },
	{ name: 'encoded parent segment', key: 'images/%2e%2e/x' },
	{ name: 'double encoded parent segment', key: 'images/%252e%252e/x' },
	{ name: 'absolute posix path', key: '/images/x' },
	{ name: 'leading backslash', key: '\\images\\x' },
	{ name: 'backslash separator', key: 'images\\x' },
	{ name: 'windows drive letter', key: 'C:/x' },
	{ name: 'NUL byte', key: 'images/a\u0000b' },
	{ name: 'empty segment', key: 'images//x' },
	{ name: 'dot segment', key: 'images/./x' },
	{ name: 'bucket name as a prefix', key: 'main/images/x' },
	{ name: 'storage API path', key: 'storage/v1/object/public/main/images/x' },
	{
		name: 'Supabase URL as a key',
		key: 'https://fake-project.supabase.test/storage/v1/object/public/main/images/x',
	},
	{ name: 'encoded slash and query hiding the extension', key: 'topics/T/S%2Fanswer_keys.json?/assets/x.png' },
	{ name: 'encoded slash and fragment hiding the extension', key: 'topics/T/S%2Fanswer_keys.json#/assets/x.png' },
	{ name: 'raw query in a key', key: 'images/foo?.png' },
	{ name: 'raw fragment in a key', key: 'images/foo#.png' },
	{ name: 'encoded query in a key', key: 'images/foo%3F.png' },
	{ name: 'encoded slash', key: 'topics/T/S%2Fanswer_keys.json' },
	{ name: 'lowercase encoded slash', key: 'topics/T/S%2fanswer_keys.json' },
	{ name: 'encoded backslash', key: 'topics/T/S%5Canswer_keys.json' },
	{ name: 'lowercase encoded backslash', key: 'topics/T/S%5canswer_keys.json' },
	{ name: 'double encoded slash', key: 'topics/T/S%252Fanswer_keys.json?/assets/x.png' },
]

describe.each(factories)('storage contract: $name', (factory) => {
	let context: ContractContext
	let storage: StorageModule
	let spy: AdapterSpy

	beforeEach(() => {
		context = factory.make()
		const spied = spyOn(context.adapter)
		spy = spied.spy
		storage = createStorage(spied.adapter)
	})

	afterEach(() => {
		context.cleanup()
	})

	test('writes and reads text', async () => {
		const key = 'topics/t/s/questions/q/prompt.md'
		await storage.write(key, 'Текст промпта', { contentType: 'text/markdown' })
		assert.equal(await storage.readText(key), 'Текст промпта')
		assert.equal(await storage.exists(key), true)
	})

	test('writes and reads a buffer with its content type', async () => {
		const bytes = Buffer.from([0, 1, 2, 250, 251, 252])
		await storage.write('images/pic.webp', bytes, { contentType: 'image/webp' })
		const result = await storage.read('images/pic.webp')
		assert.ok(result)
		assert.deepEqual(result.data, bytes)
		assert.equal(result.contentType, 'image/webp')
	})

	test('upsert true overwrites an existing object', async () => {
		const key = 'topics/t/s/settings.json'
		await storage.write(key, '{"a":1}', { contentType: 'application/json' })
		await storage.write(key, '{"a":2}', { contentType: 'application/json', upsert: true })
		assert.equal(await storage.readText(key), '{"a":2}')
	})

	test('upsert false over an existing object is a StorageConflictError and keeps the object', async () => {
		const key = 'images/taken.webp'
		await storage.write(key, Buffer.from('first'), { contentType: 'image/webp' })
		await assert.rejects(
			() => storage.write(key, Buffer.from('second'), { contentType: 'image/webp', upsert: false }),
			errorNamed('StorageConflictError')
		)
		assert.equal(await storage.readText(key), 'first')
	})

	test('a missing object reads as null and does not exist', async () => {
		const key = 'topics/none/prompt.md'
		assert.equal(await storage.read(key), null)
		assert.equal(await storage.readText(key), null)
		assert.equal(await storage.exists(key), false)
	})

	test('a missing object is null after exactly one request, without retries', async () => {
		const key = 'topics/none/questions/q/prompt.md'
		assert.equal(await storage.readText(key), null)
		assert.equal(spy.count('read'), 1)
		assert.equal(spy.total(), 1)
		if (context.fake) {
			assert.deepEqual(context.fake.calls, [{ method: 'GET', path: `/object/main/${key}` }])
		}
	})

	test('removing a missing object is not an error', async () => {
		await storage.remove(['topics/none/a.md'])
		await storage.remove([])
	})

	test('remove deletes the listed objects and keeps the rest', async () => {
		await storage.write('topics/d/a.md', 'A', { contentType: 'text/markdown' })
		await storage.write('topics/d/b.md', 'B', { contentType: 'text/markdown' })
		await storage.remove(['topics/d/a.md', 'topics/d/none.md'])
		assert.equal(await storage.exists('topics/d/a.md'), false)
		assert.equal(await storage.readText('topics/d/b.md'), 'B')
	})

	test('copy overwrites an existing destination and keeps the source', async () => {
		await storage.write('topics/c/from.md', 'new content', { contentType: 'text/markdown' })
		await storage.write('topics/c/to.md', 'stale content', { contentType: 'text/markdown' })
		await storage.copy('topics/c/from.md', 'topics/c/to.md')
		assert.equal(await storage.readText('topics/c/to.md'), 'new content')
		assert.equal(await storage.readText('topics/c/from.md'), 'new content')
	})

	test('copy into a new destination creates it', async () => {
		await storage.write('topics/c/a/f.md', 'f', { contentType: 'text/markdown' })
		await storage.copy('topics/c/a/f.md', 'topics/c/b/deep/f.md')
		assert.equal(await storage.readText('topics/c/b/deep/f.md'), 'f')
	})

	test('copy without a source is a StorageNotFoundError', async () => {
		await assert.rejects(
			() => storage.copy('topics/c/missing.md', 'topics/c/target.md'),
			errorNamed('StorageNotFoundError')
		)
		assert.equal(await storage.exists('topics/c/target.md'), false)
	})

	test('list of a directory with 150 objects returns all of them without recursion', { timeout: 20_000 }, async () => {
		const prefix = 'topics/t/s/questions/q'
		for (let i = 0; i < 150; i++) {
			await storage.write(`${prefix}/f-${String(i).padStart(3, '0')}.md`, `body ${i}`, {
				contentType: 'text/markdown',
			})
		}
		await storage.write(`${prefix}/nested/inner.md`, 'inner', { contentType: 'text/markdown' })
		const objects = await storage.list(prefix, { recursive: false })
		assert.equal(objects.length, 150)
		assert.equal(new Set(objects.map((object) => object.key)).size, 150)
		assert.ok(objects.every((object) => /^topics\/t\/s\/questions\/q\/f-\d{3}\.md$/.test(object.key)))
	})

	test('recursive list returns 150 objects spread over 3 subdirectories', { timeout: 20_000 }, async () => {
		for (let i = 0; i < 150; i++) {
			await storage.write(`topics/r/s/sub-${i % 3}/f-${String(i).padStart(3, '0')}.md`, `body ${i}`, {
				contentType: 'text/markdown',
			})
		}
		const objects = await storage.list('topics/r/s', { recursive: true })
		assert.equal(objects.length, 150)
		assert.equal(new Set(objects.map((object) => object.key)).size, 150)
		assert.deepEqual(await storage.list('topics/r/s', { recursive: false }), [])
		assert.deepEqual(await storage.list('topics/r/none', { recursive: true }), [])
	})

	test('listPage pages direct objects newest first with size, createdAt and total', async () => {
		await storage.write('images/one.webp', Buffer.from('1'), { contentType: 'image/webp' })
		await sleep(10)
		await storage.write('images/two.webp', Buffer.from('22'), { contentType: 'image/webp' })
		await sleep(10)
		await storage.write('images/three.webp', Buffer.from('333'), { contentType: 'image/webp' })
		const page = await storage.listPage('images', { limit: 2, offset: 1 })
		assert.equal(page.total, 3)
		assert.deepEqual(
			page.objects.map((object) => [object.key, object.size]),
			[
				['images/two.webp', 2],
				['images/one.webp', 1],
			]
		)
		for (const object of page.objects) assert.ok(!Number.isNaN(Date.parse(object.createdAt)))
		assert.ok(page.objects[0]!.createdAt > page.objects[1]!.createdAt)
		const first = await storage.listPage('images', { limit: 2, offset: 0 })
		assert.deepEqual(
			first.objects.map((object) => object.key),
			['images/three.webp', 'images/two.webp']
		)
	})

	test('a key with %20 and Cyrillic is the same object for write, read, exists, copy, list and remove', async () => {
		const key = 'images/фото%20схема.webp'
		const copy = 'images/копия%20схемы.webp'
		await storage.write(key, 'x', { contentType: 'image/webp' })
		assert.equal(await storage.readText(key), 'x')
		assert.equal(await storage.exists(key), true)
		await storage.copy(key, copy)
		assert.equal(await storage.readText(copy), 'x')
		assert.deepEqual(
			(await storage.list('images')).map((object) => object.key),
			[copy, key].sort()
		)
		await storage.remove([key])
		assert.equal(await storage.exists(key), false)
		assert.equal(await storage.readText(copy), 'x')
	})

	test('storageUrl for images/ is the proxy route', () => {
		assert.equal(storageUrl('images/a.webp'), '/api/docs/assets/proxy?path=images%2Fa.webp')
	})

	describe('hostile keys never reach the adapter', () => {
		test.each(hostileKeys)('$name', async ({ key }) => {
			const before = context.parentDir ? snapshot(context.parentDir) : null
			const keyError = errorNamed('StorageKeyError')

			await assert.rejects(() => storage.write(key, 'x', { contentType: 'text/plain' }), keyError)
			await assert.rejects(() => storage.read(key), keyError)
			await assert.rejects(() => storage.readText(key), keyError)
			await assert.rejects(() => storage.exists(key), keyError)
			await assert.rejects(() => storage.remove([key]), keyError)
			await assert.rejects(() => storage.remove(['topics/ok.md', key]), keyError)
			await assert.rejects(() => storage.copy(key, 'images/ok.webp'), keyError)
			await assert.rejects(() => storage.copy('images/ok.webp', key), keyError)
			await assert.rejects(() => storage.list(key), keyError)
			await assert.rejects(() => storage.list(key, { recursive: true }), keyError)
			await assert.rejects(() => storage.listPage(key, { limit: 10, offset: 0 }), keyError)

			assert.equal(spy.total(), 0)
			if (context.fake) assert.deepEqual(context.fake.calls, [])
			if (context.parentDir) assert.deepEqual(snapshot(context.parentDir), before)
		})
	})
})

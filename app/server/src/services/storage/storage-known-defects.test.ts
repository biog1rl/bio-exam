import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test, vi } from 'vitest'

import {
	createSupabaseStorageFake,
	FAKE_SUPABASE_KEY,
	FAKE_SUPABASE_URL,
	fakeSupabaseClient,
	type SupabaseStorageFake,
} from '../../test-support/supabase-storage-fake.js'
import { createSupabaseAdapter } from './adapters/supabase.js'
import { normalizeKey, normalizePrefix } from './keys.js'

type SupabaseModule = typeof import('@supabase/supabase-js')

const createClientSpy = vi.hoisted(() => vi.fn())

vi.mock('@supabase/supabase-js', async (importOriginal) => ({
	...(await importOriginal<SupabaseModule>()),
	createClient: createClientSpy,
}))

const KNOWN_DEFECTS = new Set<string>([])

function defectTest(id: string, title: string, fn: () => Promise<void>, timeout?: number): void {
	const run = KNOWN_DEFECTS.has(id) ? test.fails : test
	run(`${id}: ${title}`, fn, timeout)
}

function errorNamed(name: string): (error: unknown) => boolean {
	return (error) => error instanceof Error && error.name === name
}

let fake: SupabaseStorageFake

async function realCreateClient(): Promise<SupabaseModule['createClient']> {
	return (await vi.importActual<SupabaseModule>('@supabase/supabase-js')).createClient
}

async function fakeAdapter() {
	const client = fakeSupabaseClient(fake, await realCreateClient())
	return createSupabaseAdapter({ client, bucket: 'main', retries: 2, baseDelayMs: 1 })
}

function callsTo(method: string, path: string): number {
	return fake.calls.filter((call) => call.method === method && call.path === path).length
}

beforeEach(async () => {
	vi.stubEnv('BIO_EXAM_ISOLATED_ENV', '')
	vi.stubEnv('STORAGE_DRIVER', '')
	vi.stubEnv('SUPABASE_URL', FAKE_SUPABASE_URL)
	vi.stubEnv('SUPABASE_SERVICE_KEY', FAKE_SUPABASE_KEY)
	vi.stubEnv('SUPABASE_STORAGE_BUCKET', 'main')
	fake = createSupabaseStorageFake()
	const create = await realCreateClient()
	createClientSpy.mockReset()
	createClientSpy.mockImplementation((url: string, key: string, options?: Record<string, unknown>) =>
		create(url, key, {
			...options,
			global: { ...(options?.global as Record<string, unknown> | undefined), fetch: fake.fetch },
			auth: { persistSession: false },
		})
	)
	vi.resetModules()
})

afterEach(() => {
	vi.unstubAllEnvs()
})

describe('storage known defects (D-23)', () => {
	defectTest('STOR-supabase-100-limit', 'a directory with 150 objects is listed completely', async () => {
		for (let i = 0; i < 150; i++) {
			fake.put(`topics/t/s/questions/q/f-${String(i).padStart(3, '0')}.md`, `body ${i}`, 'text/markdown')
		}
		const { storage } = await import('./index.js')
		const objects = await storage().list('topics/t/s', { recursive: true })
		assert.equal(objects.length, 150)
		assert.equal(new Set(objects.map((object) => object.key)).size, 150)
	})

	defectTest(
		'STOR-readFile-empty-on-outage',
		'reading rejects with StorageUnavailableError when the storage is unavailable, a missing object is null',
		async () => {
			const key = 'topics/t/s/questions/q/prompt.md'
			fake.put(key, 'prompt', 'text/markdown')
			fake.failures.download.add(key)
			const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
			const { storage } = await import('./index.js')
			await assert.rejects(() => storage().readText(key), errorNamed('StorageUnavailableError'))
			warnSpy.mockRestore()
			assert.equal(await storage().readText('topics/t/s/questions/q/missing.md'), null)
		},
		20_000
	)

	test('the Supabase client is created from SUPABASE_URL outside isolation', async () => {
		const { storage } = await import('./index.js')
		assert.equal(await storage().readText('topics/t/s/questions/q/missing.md'), null)
		assert.ok(createClientSpy.mock.calls.length >= 1)
		assert.equal(createClientSpy.mock.calls[0]?.[0], FAKE_SUPABASE_URL)
	})
})

describe('normalizeKey and normalizePrefix (D-02)', () => {
	test('a key inside a namespace is returned unchanged', () => {
		assert.equal(normalizeKey('images/a.webp'), 'images/a.webp')
		assert.equal(normalizeKey('topics/t/s/questions/q/prompt.md'), 'topics/t/s/questions/q/prompt.md')
		assert.equal(normalizeKey('avatars/u/a.png'), 'avatars/u/a.png')
	})

	test('percent-encoding is checked but the key is passed on without decoding', () => {
		assert.equal(normalizeKey('images/a%20b.webp'), 'images/a%20b.webp')
		assert.equal(normalizeKey('images/фото.webp'), 'images/фото.webp')
		assert.equal(normalizeKey('topics/т/с/assets/a%20b.png'), 'topics/т/с/assets/a%20b.png')
	})

	const rejected: string[] = [
		'../x',
		'images/../topics/x',
		'images/..%2fx',
		'images/%2e%2e/x',
		'images/%252e%252e/x',
		'/images/x',
		'\\images\\x',
		'images\\x',
		'C:/x',
		'images/a\u0000b',
		'images/a\u001fb',
		'images//x',
		'images/./x',
		'images/x/',
		'main/images/x',
		'storage/v1/object/public/main/images/x',
		'https://fake-project.supabase.test/storage/v1/object/public/main/images/x',
		'images',
		'',
		'topics/T/S%2Fanswer_keys.json?/assets/x.png',
		'topics/T/S%2Fanswer_keys.json#/assets/x.png',
		'topics/T/S%252Fanswer_keys.json?/assets/x.png',
		'images/foo?.png',
		'images/foo#.png',
		'images/foo%3F.png',
		'images/foo%23.png',
		'images/a%2Fb.png',
		'images/a%2fb.png',
		'images/a%5Cb.png',
		'images/a%5cb.png',
		'images/a%252Fb.png',
	]

	for (const key of rejected) {
		test(`normalizeKey rejects ${JSON.stringify(key)}`, () => {
			assert.throws(() => normalizeKey(key), errorNamed('StorageKeyError'))
		})
	}

	test('normalizePrefix strips the trailing slash and accepts a bare namespace', () => {
		assert.equal(normalizePrefix('topics/t/s/'), 'topics/t/s')
		assert.equal(normalizePrefix('topics'), 'topics')
		assert.equal(normalizePrefix('images/'), 'images')
	})

	for (const prefix of ['', 'main', '/topics', 'topics/../images', 'topics/%2e%2e', 'main/topics']) {
		test(`normalizePrefix rejects ${JSON.stringify(prefix)}`, () => {
			assert.throws(() => normalizePrefix(prefix), errorNamed('StorageKeyError'))
		})
	}

	test('private bucket: in Supabase mode avatars and images resolve to the proxy route without a nonce or a public URL', async () => {
		const { storageUrl } = await import('./index.js')
		for (const key of ['avatars/u/a.png', 'images/a.webp', 'topics/t/s/assets/b.png']) {
			const url = storageUrl(key)
			assert.equal(url, `/api/docs/assets/proxy?path=${encodeURIComponent(key)}`)
			assert.equal(url.includes('/storage/v1/object/public'), false)
			assert.equal(storageUrl(key), url)
		}
		assert.equal(fake.calls.length, 0)
	})

	test('the module rejects a bad key before the adapter is called', async () => {
		const { storage } = await import('./index.js')
		await assert.rejects(() => storage().readText('main/images/x.png'), errorNamed('StorageKeyError'))
		await assert.rejects(() => storage().copy('images/a.png', '../b.png'), errorNamed('StorageKeyError'))
		await assert.rejects(() => storage().list('', { recursive: true }), errorNamed('StorageKeyError'))
		assert.equal(fake.calls.length, 0)
	})
})

describe('Supabase adapter error classification (D-03, storage-js 2.93)', () => {
	test('a missing object is null after exactly one GET, without retries', async () => {
		const adapter = await fakeAdapter()
		assert.equal(await adapter.read('topics/t/s/missing.md'), null)
		assert.equal(callsTo('GET', '/object/main/topics/t/s/missing.md'), 1)
		assert.equal(fake.calls.length, 1)
	})

	test('an unavailable download is retried and ends with StorageUnavailableError after three GETs', async () => {
		const key = 'topics/t/s/prompt.md'
		fake.put(key, 'x', 'text/markdown')
		fake.failures.download.add(key)
		const adapter = await fakeAdapter()
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
		await assert.rejects(() => adapter.read(key), errorNamed('StorageUnavailableError'))
		warnSpy.mockRestore()
		assert.equal(callsTo('GET', `/object/main/${key}`), 3)
	})

	test('read returns bytes and the content type of an existing object', async () => {
		fake.put('images/a.webp', Buffer.from([1, 2, 3]), 'image/webp')
		const adapter = await fakeAdapter()
		const result = await adapter.read('images/a.webp')
		assert.ok(result)
		assert.deepEqual(result.data, Buffer.from([1, 2, 3]))
		assert.equal(result.contentType, 'image/webp')
	})

	test('exists of a missing object is false after one HEAD', async () => {
		fake.put('images/present.webp', 'x', 'image/webp')
		const adapter = await fakeAdapter()
		assert.equal(await adapter.exists('images/missing.webp'), false)
		assert.equal(callsTo('HEAD', '/object/main/images/missing.webp'), 1)
		assert.equal(fake.calls.length, 1)
		assert.equal(await adapter.exists('images/present.webp'), true)
	})

	test('exists retries a 5xx and ends with StorageUnavailableError', async () => {
		fake.failures.exists.add('images/a.webp')
		const adapter = await fakeAdapter()
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
		await assert.rejects(() => adapter.exists('images/a.webp'), errorNamed('StorageUnavailableError'))
		warnSpy.mockRestore()
		assert.equal(callsTo('HEAD', '/object/main/images/a.webp'), 3)
	})

	test('write with upsert false over an existing object is StorageConflictError after one POST', async () => {
		fake.put('images/a.webp', 'old', 'image/webp')
		const adapter = await fakeAdapter()
		await assert.rejects(
			() => adapter.write('images/a.webp', Buffer.from('new'), { contentType: 'image/webp', upsert: false }),
			errorNamed('StorageConflictError')
		)
		assert.equal(callsTo('POST', '/object/main/images/a.webp'), 1)
		assert.equal(fake.objects.get('images/a.webp')?.data.toString(), 'old')
	})

	test('write with upsert overwrites and keeps the content type', async () => {
		fake.put('images/a.webp', 'old', 'image/webp')
		const adapter = await fakeAdapter()
		await adapter.write('images/a.webp', Buffer.from('new'), { contentType: 'image/png', upsert: true })
		assert.equal(fake.objects.get('images/a.webp')?.data.toString(), 'new')
		assert.equal(fake.objects.get('images/a.webp')?.contentType, 'image/png')
	})

	test('copy without a source is StorageNotFoundError after one POST', async () => {
		const adapter = await fakeAdapter()
		await assert.rejects(() => adapter.copy('images/none.webp', 'images/b.webp'), errorNamed('StorageNotFoundError'))
		assert.equal(callsTo('POST', '/object/copy'), 1)
	})

	test('copy over an existing destination replaces it', async () => {
		fake.put('images/a.webp', 'source', 'image/webp')
		fake.put('images/b.webp', 'stale', 'image/webp')
		const adapter = await fakeAdapter()
		await adapter.copy('images/a.webp', 'images/b.webp')
		assert.equal(fake.objects.get('images/b.webp')?.data.toString(), 'source')
		assert.equal(fake.objects.get('images/a.webp')?.data.toString(), 'source')
	})

	test('list walks pages of 100 and returns files only, with metadata', async () => {
		for (let i = 0; i < 150; i++) fake.put(`images/f-${String(i).padStart(3, '0')}.webp`, 'xx', 'image/webp')
		fake.put('images/nested/inner.webp', 'x', 'image/webp')
		const adapter = await fakeAdapter()
		const direct = await adapter.list('images', { recursive: false })
		assert.equal(direct.length, 150)
		assert.equal(direct[0]?.key, 'images/f-000.webp')
		assert.equal(direct[0]?.size, 2)
		assert.equal(direct[0]?.contentType, 'image/webp')
		const recursive = await adapter.list('images', { recursive: true })
		assert.equal(recursive.length, 151)
		assert.ok(recursive.some((object) => object.key === 'images/nested/inner.webp'))
		assert.ok(callsTo('POST', '/object/list/main') >= 3)
	})

	test('remove deletes in batches of 100 and ignores missing keys', async () => {
		const keys: string[] = []
		for (let i = 0; i < 150; i++) {
			const key = `topics/t/s/f-${i}.md`
			fake.put(key, 'x', 'text/markdown')
			keys.push(key)
		}
		const adapter = await fakeAdapter()
		await adapter.remove([...keys, 'topics/t/s/none.md'])
		assert.equal(fake.objects.size, 0)
		assert.equal(callsTo('DELETE', '/object/main'), 2)
	})

	test('a list outage is retried and ends with StorageUnavailableError', async () => {
		fake.failures.list.add('images')
		const adapter = await fakeAdapter()
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
		await assert.rejects(() => adapter.list('images', { recursive: false }), errorNamed('StorageUnavailableError'))
		warnSpy.mockRestore()
		assert.equal(callsTo('POST', '/object/list/main'), 3)
	})

	describe('retry classifier on scripted responses', () => {
		type Step = { status: number; body?: unknown } | 'throw'

		async function scriptedAdapter(steps: Step[]) {
			const calls: string[] = []
			const create = await realCreateClient()
			const client = create(FAKE_SUPABASE_URL, FAKE_SUPABASE_KEY, {
				global: {
					fetch: async (input: unknown) => {
						calls.push(String(input instanceof Request ? input.url : input))
						const step = steps[Math.min(calls.length - 1, steps.length - 1)]
						if (step === undefined || step === 'throw') throw new TypeError('fetch failed')
						if (step.status === 200) {
							return new Response(new Uint8Array([111, 107]), {
								status: 200,
								headers: { 'content-type': 'text/plain' },
							})
						}
						return new Response(JSON.stringify(step.body ?? { message: 'error' }), {
							status: step.status,
							headers: { 'content-type': 'application/json' },
						})
					},
				},
				auth: { persistSession: false },
			})
			return { adapter: createSupabaseAdapter({ client, bucket: 'main', retries: 2, baseDelayMs: 1 }), calls }
		}

		for (const status of [401, 403]) {
			test(`download ${status} is not retried and is StorageUnavailableError`, async () => {
				const { adapter, calls } = await scriptedAdapter([{ status }])
				await assert.rejects(() => adapter.read('images/a.webp'), errorNamed('StorageUnavailableError'))
				assert.equal(calls.length, 1)
			})

			test(`upload ${status} is not retried and is StorageUnavailableError`, async () => {
				const { adapter, calls } = await scriptedAdapter([
					{ status, body: { statusCode: String(status), error: 'Unauthorized', message: 'denied' } },
				])
				await assert.rejects(
					() => adapter.write('images/a.webp', 'x', { contentType: 'image/webp' }),
					errorNamed('StorageUnavailableError')
				)
				assert.equal(calls.length, 1)
			})
		}

		test('a 503 followed by success returns the object after two requests', async () => {
			const { adapter, calls } = await scriptedAdapter([{ status: 503 }, { status: 200 }])
			const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
			const result = await adapter.read('images/a.webp')
			warnSpy.mockRestore()
			assert.equal(result?.data.toString(), 'ok')
			assert.equal(calls.length, 2)
		})

		test('a thrown fetch is retried and succeeds on the next request', async () => {
			const { adapter, calls } = await scriptedAdapter(['throw', { status: 200 }])
			const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
			const result = await adapter.read('images/a.webp')
			warnSpy.mockRestore()
			assert.equal(result?.data.toString(), 'ok')
			assert.equal(calls.length, 2)
		})

		test('a fetch that keeps throwing ends with StorageUnavailableError after three requests', async () => {
			const { adapter, calls } = await scriptedAdapter(['throw'])
			const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
			await assert.rejects(() => adapter.read('images/a.webp'), errorNamed('StorageUnavailableError'))
			warnSpy.mockRestore()
			assert.equal(calls.length, 3)
		})
	})

	describe('read, exists and write send the key as one path, without a query or fragment tail', () => {
		const keys = [
			'topics/T/S%2Fanswer_keys.json?/assets/x.png',
			'topics/T/S%2Fanswer_keys.json#/assets/x.png',
			'images/foo?.png',
			'images/a%20b фото.webp',
		]

		async function recordingAdapter(urls: URL[]) {
			const create = await realCreateClient()
			const client = create(FAKE_SUPABASE_URL, FAKE_SUPABASE_KEY, {
				global: {
					fetch: async (input: unknown, init?: RequestInit) => {
						urls.push(new URL(String(input instanceof Request ? input.url : input)))
						return fake.fetch(input, init)
					},
				},
				auth: { persistSession: false },
			})
			return createSupabaseAdapter({ client, bucket: 'main', retries: 0, baseDelayMs: 1 })
		}

		for (const key of keys) {
			test(JSON.stringify(key), async () => {
				const urls: URL[] = []
				const adapter = await recordingAdapter(urls)
				await adapter.write(key, 'x', { contentType: 'text/plain' })
				await adapter.read(key)
				await adapter.exists(key)
				assert.equal(urls.length, 3)
				for (const url of urls) {
					assert.equal(url.search, '')
					assert.equal(url.hash, '')
					const rest = url.pathname.slice('/storage/v1/object/main/'.length)
					assert.deepEqual(rest.split('/').map(decodeURIComponent), key.split('/'))
				}
				assert.deepEqual([...fake.objects.keys()], [key])
			})
		}
	})

	test('publicUrl is computed by the client without a request', async () => {
		const adapter = await fakeAdapter()
		assert.equal(
			adapter.publicUrl?.('avatars/u/a.png'),
			`${FAKE_SUPABASE_URL}/storage/v1/object/public/main/avatars/u/a.png`
		)
		assert.equal(fake.calls.length, 0)
	})
})

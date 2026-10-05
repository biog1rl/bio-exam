import type { Archiver, EntryData } from 'archiver'
import assert from 'node:assert/strict'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { Writable } from 'node:stream'
import { afterAll, afterEach, beforeAll, describe, test, vi } from 'vitest'

import { memoryStorage } from '../../test-support/storage.js'
import { readZipEntries } from '../../test-support/zip.js'
import type { MemoryStorageAdapter } from './adapters/memory.js'
import { StorageUnavailableError, type StorageReadResult } from './port.js'
import {
	buildZip,
	createCeilingBuffer,
	MISSING_FILES_ENTRY,
	streamZip,
	ZIP_READ_AHEAD,
	ZipEntryNameError,
	ZipLimitExceededError,
	type ZipEntry,
} from './zip.js'

type ArchiveRecord = { appended: string[]; packed: string[]; aborted: number }

const tracker = vi.hoisted(() => ({ archives: [] as ArchiveRecord[] }))

vi.mock('archiver', async (importOriginal) => {
	const actual = await importOriginal<{ default: (...args: unknown[]) => Archiver }>()
	const create = actual.default
	const wrapped = (...args: unknown[]): Archiver => {
		const archive = create(...args)
		const record: ArchiveRecord = { appended: [], packed: [], aborted: 0 }
		tracker.archives.push(record)
		archive.on('entry', (data: EntryData) => record.packed.push(data.name))
		const append = archive.append.bind(archive)
		archive.append = (source, data) => {
			record.appended.push(data?.name ?? '')
			return append(source, data)
		}
		const abort = archive.abort.bind(archive)
		archive.abort = () => {
			record.aborted += 1
			return abort()
		}
		return archive
	}
	return { ...actual, default: wrapped }
})

type ReadHook = (key: string, index: number) => Promise<void> | void

type ReadProbe = {
	started: string[]
	active: number
	maxActive: number
	onStart: ((key: string, index: number) => void) | null
}

type Deferred = { promise: Promise<void>; resolve(): void; reject(error: unknown): void }

let mem: MemoryStorageAdapter
let originalRead: (key: string) => Promise<StorageReadResult | null>

function sha256(buffer: Buffer): string {
	return createHash('sha256').update(buffer).digest('hex')
}

function digest(archive: Buffer): Array<[string, string]> {
	return [...readZipEntries(archive)].map(([name, data]) => [name, sha256(data)])
}

function uniqueKey(name: string): string {
	return `images/zip-stream-${name}-${randomBytes(6).toString('hex')}.webp`
}

function putObjects(prefix: string, count: number, size: number): ZipEntry[] {
	const entries: ZipEntry[] = []
	for (let index = 0; index < count; index += 1) {
		const key = uniqueKey(`${prefix}-${index}`)
		mem.put(key, randomBytes(size), 'image/webp')
		entries.push({ name: `assets/${prefix}-${String(index).padStart(2, '0')}.bin`, key })
	}
	return entries
}

function keyOf(entry: ZipEntry | undefined): string {
	assert.ok(entry && 'key' in entry)
	return entry.key
}

function deferred(): Deferred {
	let resolve!: () => void
	let reject!: (error: unknown) => void
	const promise = new Promise<void>((onResolve, onReject) => {
		resolve = onResolve
		reject = onReject
	})
	return { promise, resolve, reject }
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

async function until(condition: () => boolean): Promise<void> {
	for (let attempt = 0; attempt < 1000 && !condition(); attempt += 1) await delay(2)
	assert.ok(condition(), 'condition was not reached')
}

function instrumentReads(hook?: ReadHook): ReadProbe {
	const probe: ReadProbe = { started: [], active: 0, maxActive: 0, onStart: null }
	vi.spyOn(mem, 'read').mockImplementation(async (key: string) => {
		const index = probe.started.length
		probe.started.push(key)
		probe.active += 1
		probe.maxActive = Math.max(probe.maxActive, probe.active)
		probe.onStart?.(key, index)
		try {
			await hook?.(key, index)
			return await originalRead(key)
		} finally {
			probe.active -= 1
		}
	})
	return probe
}

function streamWithRecord(
	entries: ZipEntry[],
	sink: NodeJS.WritableStream,
	options?: Parameters<typeof streamZip>[2]
): { promise: ReturnType<typeof streamZip>; record: ArchiveRecord } {
	const before = tracker.archives.length
	const promise = streamZip(entries, sink, options)
	const record = tracker.archives[before]
	assert.ok(record, 'streamZip did not create an archive synchronously')
	return { promise, record }
}

function collectingSink(options: { highWaterMark?: number; writeDelayMs?: number } = {}): {
	writable: Writable
	buffer(): Buffer
} {
	const chunks: Buffer[] = []
	const writable = new Writable({
		highWaterMark: options.highWaterMark,
		write(chunk: Buffer, _encoding, callback) {
			chunks.push(chunk)
			if (options.writeDelayMs === undefined) callback()
			else setTimeout(callback, options.writeDelayMs)
		},
	})
	return { writable, buffer: () => Buffer.concat(chunks) }
}

async function withUnhandledCounter(run: () => Promise<void>): Promise<number> {
	let count = 0
	const handler = (): void => {
		count += 1
	}
	process.on('unhandledRejection', handler)
	try {
		await run()
		await delay(30)
		await new Promise((resolve) => setImmediate(resolve))
	} finally {
		process.off('unhandledRejection', handler)
	}
	return count
}

beforeAll(async () => {
	vi.stubEnv('STORAGE_DRIVER', '')
	mem = await memoryStorage()
	originalRead = mem.read.bind(mem)
})

afterEach(() => {
	vi.restoreAllMocks()
	mem.clearFailures()
})

afterAll(() => {
	vi.unstubAllEnvs()
})

describe('streamZip tracer', () => {
	test('one key entry and one buffer entry match buildZip by name, order and sha256', async () => {
		const key = uniqueKey('a')
		mem.put(key, randomBytes(2048), 'image/webp')
		const entries: ZipEntry[] = [
			{ name: 'images/a.png', key },
			{ name: 'settings.json', buffer: Buffer.from('{"title":"Тест"}') },
		]

		const ceiling = createCeilingBuffer(Number.MAX_SAFE_INTEGER)
		const result = await streamZip(entries, ceiling.writable)
		const streamed = ceiling.buffer()

		assert.equal(result.bytes, streamed.length)
		assert.deepEqual(result.missing, [])
		assert.deepEqual(
			digest(streamed).map(([name]) => name),
			['images/a.png', 'settings.json']
		)
		assert.deepEqual(digest(streamed), digest(await buildZip(entries)))
	})

	test('entry name ../x is rejected with ZipEntryNameError before any read', async () => {
		const probe = instrumentReads()
		const key = uniqueKey('slip')
		mem.put(key, 'x')
		const ceiling = createCeilingBuffer(Number.MAX_SAFE_INTEGER)
		await assert.rejects(
			streamZip(
				[
					{ name: 'images/ok.png', key },
					{ name: '../x', buffer: Buffer.from('x') },
				],
				ceiling.writable
			),
			ZipEntryNameError
		)
		assert.equal(probe.started.length, 0)
	})
})

describe('streamZip read-ahead and backpressure', () => {
	test('40 keys with a 10 ms adapter: at most ZIP_READ_AHEAD concurrent reads, same entries as buildZip', async () => {
		const entries = putObjects('conc', 40, 4096)
		const expected = digest(await buildZip(entries))
		const probe = instrumentReads(() => delay(10))
		const sink = collectingSink()

		const result = await streamZip(entries, sink.writable)

		assert.equal(ZIP_READ_AHEAD, 4)
		assert.equal(probe.started.length, 40)
		assert.equal(probe.maxActive, ZIP_READ_AHEAD)
		assert.equal(result.bytes, sink.buffer().length)
		assert.deepEqual(digest(sink.buffer()), expected)
		console.info(`zip-stream metrics: maxConcurrentReads=${probe.maxActive}`)
	})

	test('slow sink: started reads minus packed entries and read-but-unpacked bytes stay within the window', async () => {
		const size = 64 * 1024
		const entries = putObjects('slow', 40, size)
		const expected = digest(await buildZip(entries))
		const nameByKey = new Map(entries.map((entry) => [keyOf(entry), entry.name]))
		const probe = instrumentReads()
		const sink = collectingSink({ highWaterMark: 1024, writeDelayMs: 1 })
		let record: ArchiveRecord | null = null
		let maxLead = 0
		let readBytes = 0
		let peakUnpacked = 0
		probe.onStart = () => {
			if (record) maxLead = Math.max(maxLead, probe.started.length - record.packed.length)
		}

		const run = streamWithRecord(entries, sink.writable, {
			onRead: (key, bytes) => {
				assert.ok(nameByKey.has(key))
				readBytes += bytes
				const packedBytes = (record?.packed.length ?? 0) * size
				peakUnpacked = Math.max(peakUnpacked, readBytes - packedBytes)
			},
		})
		record = run.record
		await run.promise

		assert.equal(probe.started.length, 40)
		assert.ok(maxLead <= ZIP_READ_AHEAD, `lead ${maxLead}`)
		assert.ok(peakUnpacked <= ZIP_READ_AHEAD * size, `unpacked ${peakUnpacked}`)
		assert.deepEqual(digest(sink.buffer()), expected)
		console.info(
			`zip-stream metrics: maxLead=${maxLead} peakUnpackedBytes=${peakUnpacked} objectBytes=${size} archiveBytes=${sink.buffer().length}`
		)
	})
})

describe('streamZip cancellation and read failures', () => {
	test('abort after the 5th read: no new reads, AbortError, archive aborted', async () => {
		const entries = putObjects('abort', 40, 4096)
		const probe = instrumentReads(() => delay(5))
		const controller = new AbortController()
		let reads = 0
		let startedAtAbort = -1
		const sink = collectingSink()

		const run = streamWithRecord(entries, sink.writable, {
			signal: controller.signal,
			onRead: () => {
				reads += 1
				if (reads === 5) {
					startedAtAbort = probe.started.length
					controller.abort()
				}
			},
		})
		await assert.rejects(run.promise, { name: 'AbortError' })
		await delay(50)

		assert.ok(startedAtAbort > 0)
		assert.equal(probe.started.length, startedAtAbort)
		assert.ok(probe.started.length < entries.length)
		assert.ok(run.record.aborted >= 1)
	})

	test('already aborted signal rejects without reads', async () => {
		const entries = putObjects('pre', 3, 128)
		const probe = instrumentReads()
		const controller = new AbortController()
		controller.abort()

		await assert.rejects(streamZip(entries, collectingSink().writable, { signal: controller.signal }), {
			name: 'AbortError',
		})
		assert.equal(probe.started.length, 0)
	})

	test('read failure on the 10th entry rejects with that error and stops new reads', async () => {
		const entries = putObjects('fail', 40, 4096)
		mem.failOn({ op: 'read', key: keyOf(entries[9]) })
		const probe = instrumentReads(() => delay(2))

		const run = streamWithRecord(entries, collectingSink().writable)
		await assert.rejects(run.promise, StorageUnavailableError)
		const startedAtFailure = probe.started.length
		await delay(50)

		assert.equal(probe.started.length, startedAtFailure)
		assert.ok(startedAtFailure <= 9 + ZIP_READ_AHEAD, `started ${startedAtFailure}`)
		assert.ok(!run.record.appended.includes(entries[9]?.name ?? ''))
		assert.ok(run.record.aborted >= 1)
	})

	test('all reads of the window reject: error of the first entry, later rejections absorbed', async () => {
		const entries = putObjects('allfail', ZIP_READ_AHEAD + 2, 256)
		instrumentReads(async (_key, index) => {
			if (index >= ZIP_READ_AHEAD) return
			await delay(10 * (ZIP_READ_AHEAD - index))
			throw new Error(`read ${index}`)
		})

		const unhandled = await withUnhandledCounter(async () => {
			await assert.rejects(streamZip(entries, collectingSink().writable), { message: 'read 0' })
		})

		assert.equal(unhandled, 0)
	})

	test('a later read rejects before an earlier one settles: packing reaches the earlier entries first', async () => {
		const entries = putObjects('late', ZIP_READ_AHEAD + 4, 256)
		const first = deferred()
		const probe = instrumentReads(async (_key, index) => {
			if (index === 0) await first.promise
			if (index === 2) throw new Error('read 2')
		})

		const unhandled = await withUnhandledCounter(async () => {
			const run = streamWithRecord(entries, collectingSink().writable)
			await until(() => probe.started.length === ZIP_READ_AHEAD)
			await delay(20)
			first.resolve()
			await assert.rejects(run.promise, { message: 'read 2' })
			const startedAtFailure = probe.started.length
			await delay(30)
			assert.equal(probe.started.length, startedAtFailure)
			assert.deepEqual(run.record.appended, [entries[0]?.name, entries[1]?.name])
			assert.ok(run.record.aborted >= 1)
		})

		assert.equal(unhandled, 0)
	})

	test('abort while reads are pending, then every started read rejects', async () => {
		const entries = putObjects('abortfail', ZIP_READ_AHEAD + 4, 256)
		const pending: Deferred[] = []
		const probe = instrumentReads(async () => {
			const gate = deferred()
			pending.push(gate)
			await gate.promise
		})
		const controller = new AbortController()

		const unhandled = await withUnhandledCounter(async () => {
			const run = streamWithRecord(entries, collectingSink().writable, { signal: controller.signal })
			await until(() => pending.length === ZIP_READ_AHEAD)
			controller.abort()
			await assert.rejects(run.promise, { name: 'AbortError' })
			for (const [index, gate] of pending.entries()) gate.reject(new Error(`late ${index}`))
			await delay(20)
			assert.equal(probe.started.length, ZIP_READ_AHEAD)
			assert.ok(run.record.aborted >= 1)
		})

		assert.equal(unhandled, 0)
	})
})

describe('streamZip missing objects', () => {
	test('a missing key is skipped and listed in missing-files.txt as the last entry', async () => {
		const present = putObjects('miss', 2, 512)
		const absent = uniqueKey('absent')
		const entries: ZipEntry[] = [
			present[0] as ZipEntry,
			{ name: 'images/missing.webp', key: absent },
			present[1] as ZipEntry,
		]
		const expected = await buildZip(entries, { missing: ['topics/t/x/prompt.md'] })

		const sink = collectingSink()
		const result = await streamZip(entries, sink.writable, { missing: ['topics/t/x/prompt.md'] })
		const archive = readZipEntries(sink.buffer())

		assert.deepEqual(result.missing, ['topics/t/x/prompt.md', absent])
		assert.deepEqual([...archive.keys()], [present[0]?.name, present[1]?.name, MISSING_FILES_ENTRY])
		assert.equal(archive.get(MISSING_FILES_ENTRY)?.toString('utf8'), `topics/t/x/prompt.md\n${absent}\n`)
		assert.deepEqual(digest(sink.buffer()), digest(expected))
	})
})

describe('createCeilingBuffer', () => {
	test('an archive above the limit rejects with ZipLimitExceededError and stops before the end', async () => {
		const entries = putObjects('ceil', 40, 64 * 1024)
		const probe = instrumentReads()
		const limit = 300_000
		const ceiling = createCeilingBuffer(limit)
		let lastChunk = 0
		const write = ceiling.writable.write.bind(ceiling.writable) as (...args: unknown[]) => boolean
		ceiling.writable.write = ((...args: unknown[]) => {
			const chunk = args[0]
			if (Buffer.isBuffer(chunk)) lastChunk = chunk.length
			return write(...args)
		}) as typeof ceiling.writable.write

		const unhandled = await withUnhandledCounter(async () => {
			const run = streamWithRecord(entries, ceiling.writable)
			await assert.rejects(run.promise, ZipLimitExceededError)
			assert.ok(run.record.aborted >= 1)
		})

		assert.equal(unhandled, 0)
		assert.ok(ceiling.peakBytes() <= limit + lastChunk, `peak ${ceiling.peakBytes()} last ${lastChunk}`)
		assert.ok(probe.started.length < entries.length, `reads ${probe.started.length}`)
		assert.throws(() => ceiling.buffer(), ZipLimitExceededError)
		console.info(
			`zip-stream metrics: ceilingLimit=${limit} ceilingPeakBytes=${ceiling.peakBytes()} lastChunk=${lastChunk} readsBeforeStop=${probe.started.length}/${entries.length}`
		)
	})

	test('an archive below the limit is kept whole', async () => {
		const entries = putObjects('fit', 3, 2048)
		const ceiling = createCeilingBuffer(10 * 1024 * 1024)

		const result = await streamZip(entries, ceiling.writable)

		assert.equal(ceiling.buffer().length, result.bytes)
		assert.equal(ceiling.peakBytes(), result.bytes)
		assert.deepEqual(digest(ceiling.buffer()), digest(await buildZip(entries)))
	})
})

describe('streamZip equivalence with buildZip on D-24 samples', () => {
	function markdown(text: string): Buffer {
		return Buffer.from(text)
	}

	test('test with images/, a stale test image and missing objects', async () => {
		const questionA = randomUUID()
		const questionB = randomUUID()
		const promptImage = uniqueKey('prompt')
		const explanationImage = uniqueKey('explanation')
		const staleKey = `topics/zip-stream-topic/zip-stream-test/assets/c-${randomBytes(4).toString('hex')}.png`
		mem.put(promptImage, randomBytes(3000), 'image/webp')
		mem.put(explanationImage, randomBytes(5000), 'image/webp')
		mem.put(staleKey, randomBytes(1500), 'image/png')
		const absent = uniqueKey('missing')
		const staleName = staleKey.slice('topics/zip-stream-topic/zip-stream-test/'.length)
		const entries: ZipEntry[] = [
			{ name: 'settings.json', buffer: Buffer.from('{"title":"Тест","updatedAt":"2026-10-05"}') },
			{ name: 'answer_keys.json', buffer: Buffer.from(`[{"questionId":"${questionA}","correct":"b"}]`) },
			{ name: `questions/${questionA}/prompt.md`, buffer: markdown(`![](${promptImage})`) },
			{ name: `questions/${questionA}/explanation.md`, buffer: markdown(`![](${explanationImage})`) },
			{ name: `questions/${questionB}/prompt.md`, buffer: markdown(`![](/uploads/tests/x/assets/c.png)`) },
			{ name: staleName, key: staleKey },
			{ name: absent, key: absent },
			{ name: explanationImage, key: explanationImage },
			{ name: promptImage, key: promptImage },
		]
		const expectedMissing: string[] = [`topics/zip-stream-topic/zip-stream-test/questions/${questionB}/explanation.md`]
		const expected = await buildZip(entries, { missing: [...expectedMissing] })

		const sink = collectingSink()
		const result = await streamZip(entries, sink.writable, { missing: [...expectedMissing] })

		assert.deepEqual(result.missing, [...expectedMissing, absent])
		assert.deepEqual(digest(sink.buffer()), digest(expected))
		assert.equal(digest(sink.buffer()).at(-1)?.[0], MISSING_FILES_ENTRY)
	})

	test('topic of two tests with a shared image', async () => {
		const shared = uniqueKey('shared')
		const ownKey = `topics/zip-stream-topic/one/assets/own-${randomBytes(4).toString('hex')}.png`
		mem.put(shared, randomBytes(4000), 'image/webp')
		mem.put(ownKey, randomBytes(2500), 'image/png')
		const entries: ZipEntry[] = [
			{ name: 'one/settings.json', buffer: Buffer.from('{"title":"Первый"}') },
			{ name: `one/questions/${randomUUID()}/prompt.md`, buffer: markdown(`![](${shared})`) },
			{ name: `one/${ownKey.slice('topics/zip-stream-topic/one/'.length)}`, key: ownKey },
			{ name: 'two/settings.json', buffer: Buffer.from('{"title":"Второй"}') },
			{ name: `two/questions/${randomUUID()}/prompt.md`, buffer: markdown(`![](${shared})`) },
			{ name: shared, key: shared },
		]
		const expected = await buildZip(entries)

		const sink = collectingSink()
		const result = await streamZip(entries, sink.writable)

		assert.deepEqual(result.missing, [])
		assert.deepEqual(digest(sink.buffer()), digest(expected))
		assert.equal(digest(sink.buffer()).filter(([name]) => name === shared).length, 1)
	})
})

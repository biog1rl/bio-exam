import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { Writable } from 'node:stream'
import { afterAll, beforeAll, describe, test } from 'vitest'

import { call, login, seedUser, startAuthApp, type AuthApp, type CookieJar } from '../../test-support/auth-app.js'
import { memoryStorage } from '../../test-support/storage.js'
import { readZipEntries } from '../../test-support/zip.js'
import type { MemoryStorageAdapter } from '../storage/adapters/memory.js'

type QuestionContentModule = typeof import('./index.js')
type ReferenceModule = typeof import('../../test-support/export-reference.js')

type Json = Record<string, unknown>

type PointerRow = { id: string; prompt_path: string | null; explanation_path: string | null }

type TestSample = { testId: string; topicSlug: string; slug: string; missingPointer: string; missingKey: string }

type TopicSample = { topicId: string; topicSlug: string; shared: string }

const PASSWORD = 'qcon-export-eq-password-1'
const TOO_LARGE = 'Архив слишком большой для выгрузки, экспортируйте тесты по отдельности'
const OPTIONS = [
	{ id: 'a', text: 'Хлоропласт' },
	{ id: 'b', text: 'Митохондрия' },
	{ id: 'c', text: 'Рибосома' },
]

let ctx: AuthApp
let mem: MemoryStorageAdapter
let qc: QuestionContentModule
let reference: ReferenceModule
let adminJar: CookieJar
let counter = 0

function radio(promptText: string, overrides: Json = {}): Json {
	return { type: 'radio', promptText, options: OPTIONS, correct: 'b', points: 1, ...overrides }
}

function nextSlug(name: string): string {
	counter += 1
	return `qcon-eq-${name}-${counter}`
}

function imageKey(name: string): string {
	return `images/qcon-eq-${name}-${randomBytes(6).toString('hex')}.webp`
}

function sha256(buffer: Buffer): string {
	return createHash('sha256').update(buffer).digest('hex')
}

function names(archive: Buffer): string[] {
	return [...readZipEntries(archive).keys()]
}

function digest(archive: Buffer): Array<[string, string]> {
	return [...readZipEntries(archive)].map(([name, data]) => [name, sha256(data)])
}

function assertSameArchive(actual: Buffer, expected: Buffer): void {
	assert.deepEqual(names(actual), names(expected))
	assert.deepEqual(digest(actual), digest(expected))
}

function collectingSink(): { writable: Writable; buffer(): Buffer } {
	const chunks: Buffer[] = []
	const writable = new Writable({
		write(chunk: Buffer, _encoding, callback) {
			chunks.push(chunk)
			callback()
		},
	})
	return { writable, buffer: () => Buffer.concat(chunks) }
}

async function rejection(promise: Promise<unknown>): Promise<{ statusCode?: number; message?: string }> {
	try {
		await promise
	} catch (error) {
		return error as { statusCode?: number; message?: string }
	}
	assert.fail('expected rejection')
}

async function createTopic(slug: string): Promise<string> {
	const reply = await call(ctx, 'POST', '/api/tests/topics', {
		cookies: adminJar,
		body: { slug, title: `Тема ${slug}` },
	})
	assert.equal(reply.status, 201, JSON.stringify(reply.body))
	return (reply.body.topic as Json).id as string
}

async function saveTest(topicId: string, slug: string, questions: Json[]): Promise<string> {
	const reply = await call(ctx, 'POST', '/api/tests/save', {
		cookies: adminJar,
		body: { topicId, title: `Тест ${slug}`, slug, isPublished: true, questions },
	})
	assert.equal(reply.status, 201, JSON.stringify(reply.body))
	return (reply.body.test as Json).id as string
}

async function pointerRows(testId: string): Promise<PointerRow[]> {
	const { rows } = await ctx.pgPool.query<PointerRow>(
		'SELECT id, prompt_path, explanation_path FROM questions WHERE test_id = $1 ORDER BY "order", id',
		[testId]
	)
	return rows
}

async function seedTestSample(): Promise<TestSample> {
	const topicSlug = nextSlug('topic')
	const topicId = await createTopic(topicSlug)
	const slug = nextSlug('sample')
	const promptImage = imageKey('prompt')
	const explanationImage = imageKey('explanation')
	const legacy = `topics/${topicSlug}/${slug}/assets/c.png`
	const missingKey = imageKey('missing')
	mem.put(promptImage, randomBytes(3000), 'image/webp')
	mem.put(explanationImage, randomBytes(5000), 'image/webp')
	mem.put(legacy, randomBytes(1500), 'image/png')
	const testId = await saveTest(topicId, slug, [
		radio(`Первый ![схема](${promptImage} "t")`, {
			order: 0,
			correct: 'c',
			explanationText: `Пояснение <img src="${explanationImage}">`,
		}),
		radio(`Второй <img src="/uploads/tests/${topicSlug}/${slug}/assets/c.png"> ![](${missingKey})`, {
			order: 1,
			explanationText: 'Пояснение, которое пропадёт',
		}),
		radio(`Третий ![](${promptImage})`, { order: 2, correct: 'a' }),
	])
	const rows = await pointerRows(testId)
	const missingPointer = rows[1]?.explanation_path
	assert.ok(missingPointer)
	await mem.remove([missingPointer])
	return { testId, topicSlug, slug, missingPointer, missingKey }
}

async function seedTopicSample(): Promise<TopicSample> {
	const topicSlug = nextSlug('topic')
	const topicId = await createTopic(topicSlug)
	const first = nextSlug('b')
	const second = nextSlug('a')
	const shared = imageKey('shared')
	const own = imageKey('own')
	const legacy = `topics/${topicSlug}/${first}/assets/l.png`
	mem.put(shared, randomBytes(4000), 'image/webp')
	mem.put(own, randomBytes(2500), 'image/webp')
	mem.put(legacy, randomBytes(1800), 'image/png')
	const firstId = await saveTest(topicId, first, [
		radio(`Первый ![](${shared}) <img src="/uploads/tests/${topicSlug}/${first}/assets/l.png">`, {
			order: 0,
			correct: 'a',
			explanationText: 'Пояснение, которое пропадёт',
		}),
		radio(`Второй ![](${own})`, { order: 1, explanationText: `Пояснение ![](${shared})` }),
	])
	const secondId = await saveTest(topicId, second, [
		radio(`Третий ![](${shared}) ![](${imageKey('absent')})`, { order: 0, correct: 'c' }),
	])
	await ctx.pgPool.query('UPDATE tests SET "order" = $2 WHERE id = $1', [firstId, 0])
	await ctx.pgPool.query('UPDATE tests SET "order" = $2 WHERE id = $1', [secondId, 1])
	const [row] = await pointerRows(firstId)
	assert.ok(row?.explanation_path)
	await mem.remove([row.explanation_path])
	return { topicId, topicSlug, shared }
}

beforeAll(async () => {
	ctx = await startAuthApp('test_qcon_export_eq')
	await seedUser(ctx, { login: 'qcon_eq_admin', roles: ['admin'], password: PASSWORD })
	const admin = await login(ctx, 'qcon_eq_admin', PASSWORD)
	assert.equal(admin.status, 200)
	adminJar = admin.jar
	mem = await memoryStorage()
	qc = await import('./index.js')
	reference = await import('../../test-support/export-reference.js')
}, 60_000)

afterAll(async () => {
	await ctx?.stop()
})

describe('эквивалентность экспорта теста эталону фазы 7', () => {
	let sample: TestSample

	beforeAll(async () => {
		sample = await seedTestSample()
	})

	for (const withAnswers of [true, false]) {
		test(`тест с images/, устаревшей картинкой и пропусками, withAnswers=${withAnswers}: имена, порядок и sha256 совпадают`, async () => {
			const expected = await reference.referenceBuildTestArchive({ testId: sample.testId, withAnswers })
			const actual = await qc.buildTestArchive({ testId: sample.testId, withAnswers })
			assert.equal(actual.filename, expected.filename)
			assertSameArchive(actual.buffer, expected.buffer)
			const entries = readZipEntries(actual.buffer)
			assert.equal(names(actual.buffer).at(-1), 'missing-files.txt')
			assert.equal(
				entries.get('missing-files.txt')?.toString('utf8'),
				`${sample.missingPointer}\n${sample.missingKey}\n`
			)
			assert.equal(entries.has('answer_keys.json'), withAnswers)
			assert.ok(entries.has(`assets/c.png`))
		})
	}

	test('streamArchive(prepareTestArchive) в приёмник даёт тот же архив, что buildTestArchive', async () => {
		const built = await qc.buildTestArchive({ testId: sample.testId, withAnswers: true })
		const prepared = await qc.prepareTestArchive({ testId: sample.testId, withAnswers: true })
		assert.equal(prepared.filename, `${sample.topicSlug}-${sample.slug}.zip`)
		const sink = collectingSink()
		await qc.streamArchive(prepared, sink.writable)
		assertSameArchive(sink.buffer(), built.buffer)
	})

	test('archiveToBuffer с лимитом меньше архива → 413 с ARCHIVE_TOO_LARGE_MESSAGE', async () => {
		const prepared = await qc.prepareTestArchive({ testId: sample.testId, withAnswers: false })
		const error = await rejection(qc.archiveToBuffer(prepared, 1024))
		assert.equal(error.statusCode, 413)
		assert.equal(error.message, TOO_LARGE)
		assert.equal(qc.ARCHIVE_TOO_LARGE_MESSAGE, TOO_LARGE)
		const fits = await qc.archiveToBuffer(prepared, qc.ZIP_RESPONSE_LIMIT_BYTES)
		const expected = await reference.referenceBuildTestArchive({ testId: sample.testId, withAnswers: false })
		assertSameArchive(fits, expected.buffer)
	})
})

describe('эквивалентность экспорта темы эталону фазы 7', () => {
	let sample: TopicSample

	beforeAll(async () => {
		sample = await seedTopicSample()
	})

	const cases = [
		{ label: 'withAnswers=true', withAnswers: true, allowed: undefined },
		{ label: 'withAnswers=false', withAnswers: false, allowed: undefined },
		{ label: 'withAnswers=true, answersAllowed=false', withAnswers: true, allowed: false },
	]

	for (const item of cases) {
		test(`тема из двух тестов с общей картинкой, ${item.label}: имена, порядок и sha256 совпадают`, async () => {
			const asked: string[] = []
			const params = {
				topicSlug: sample.topicSlug,
				withAnswers: item.withAnswers,
				scope: { all: true as const },
				...(item.allowed === undefined
					? {}
					: {
							answersAllowed: async (id: string) => {
								asked.push(id)
								return item.allowed
							},
						}),
			}
			const expected = await reference.referenceBuildTopicArchive(params)
			const actual = await qc.buildTopicArchive(params)
			assert.equal(actual.filename, expected.filename)
			assertSameArchive(actual.buffer, expected.buffer)
			const entryNames = names(actual.buffer)
			assert.equal(entryNames.filter((name) => name === sample.shared).length, 1)
			assert.equal(entryNames.at(-1), 'missing-files.txt')
			assert.equal(
				entryNames.some((name) => name.endsWith('answer_keys.json')),
				item.withAnswers && item.allowed !== false
			)
			if (item.allowed !== undefined) assert.deepEqual(asked, [sample.topicId, sample.topicId])

			const sink = collectingSink()
			await qc.streamArchive(await qc.prepareTopicArchive(params), sink.writable)
			assertSameArchive(sink.buffer(), expected.buffer)
		})
	}
})

describe('потолок размера', () => {
	test('архив больше лимита → 413, чтений хранилища меньше, чем ключей в записях', async () => {
		const topicId = await createTopic(nextSlug('topic'))
		const keys = Array.from({ length: 16 }, (_, index) => imageKey(`big-${index}`))
		for (const key of keys) mem.put(key, randomBytes(4096), 'image/webp')
		const testId = await saveTest(topicId, nextSlug('ceiling'), [
			radio(keys.map((key) => `![](${key})`).join(' '), { order: 0 }),
		])
		const prepared = await qc.prepareTestArchive({ testId, withAnswers: false })
		const keyEntries = prepared.entries.filter((entry) => 'key' in entry).length
		assert.equal(keyEntries, keys.length)

		const originalRead = mem.read.bind(mem)
		let reads = 0
		mem.read = async (key: string) => {
			reads += 1
			return originalRead(key)
		}
		try {
			const error = await rejection(qc.archiveToBuffer(prepared, 1024))
			assert.equal(error.statusCode, 413)
			assert.equal(error.message, TOO_LARGE)
		} finally {
			mem.read = originalRead
		}
		assert.ok(reads < keyEntries, `reads ${reads} of ${keyEntries}`)
		console.info(`export ceiling: reads=${reads} keyEntries=${keyEntries} limit=1024`)

		const built = await rejection(qc.buildTestArchive({ testId, withAnswers: false, limitBytes: 1024 }))
		assert.equal(built.statusCode, 413)
		assert.equal(built.message, TOO_LARGE)
	})
})

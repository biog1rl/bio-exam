import express, { type NextFunction, type Request, type Response } from 'express'
import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { afterAll, afterEach, beforeAll, describe, test, vi } from 'vitest'

import type { MemoryStorageAdapter } from '../../services/storage/adapters/memory.js'
import {
	call,
	cookieHeader,
	login,
	nextIp,
	seedUser,
	startAuthApp,
	type AuthApp,
	type CookieJar,
} from '../../test-support/auth-app.js'
import { startTestServer } from '../../test-support/http.js'
import { memoryStorage } from '../../test-support/storage.js'
import { readZipEntries } from '../../test-support/zip.js'

type Json = Record<string, unknown>

type QuestionContent = typeof import('../../services/question-content/index.js')

type Logger = (typeof import('../../lib/logger.js'))['logger']

type World = {
	ctx: AuthApp
	mem: MemoryStorageAdapter
	adminJar: CookieJar
	teacherJar: CookieJar
	qc: QuestionContent
	logger: Logger
}

type Download = { status: number; headers: Headers; body: Buffer }

const PASSWORD = 'export-routes-password-1'
const MISSING_TEST_ID = '00000000-0000-4000-8000-000000000000'
const TOO_LARGE = 'Архив слишком большой для выгрузки, экспортируйте тесты по отдельности'

function setupWorld(prefix: string, loginPrefix: string, env?: Record<string, string>): () => World {
	let world: World | undefined
	beforeAll(async () => {
		const ctx = await startAuthApp(prefix, env ? { env } : {})
		const mem = await memoryStorage()
		const qc = await import('../../services/question-content/index.js')
		const { logger } = await import('../../lib/logger.js')
		await seedUser(ctx, { login: `${loginPrefix}_admin`, roles: ['admin'], password: PASSWORD })
		await seedUser(ctx, { login: `${loginPrefix}_teacher`, roles: ['teacher'], password: PASSWORD })
		const admin = await login(ctx, `${loginPrefix}_admin`, PASSWORD)
		assert.equal(admin.status, 200)
		const teacher = await login(ctx, `${loginPrefix}_teacher`, PASSWORD)
		assert.equal(teacher.status, 200)
		world = { ctx, mem, adminJar: admin.jar, teacherJar: teacher.jar, qc, logger }
	}, 60_000)
	afterEach(() => {
		world?.mem.clearFailures()
		vi.restoreAllMocks()
	})
	afterAll(async () => {
		await world?.ctx.stop()
	})
	return () => {
		assert.ok(world, 'world is not started')
		return world
	}
}

function radio(promptText: string, order: number): Json {
	return {
		type: 'radio',
		promptText,
		order,
		options: [
			{ id: 'a', text: 'Митоз' },
			{ id: 'b', text: 'Мейоз' },
		],
		correct: 'b',
		points: 1,
	}
}

async function createTopic(w: World, slug: string): Promise<string> {
	const reply = await call(w.ctx, 'POST', '/api/tests/topics', {
		cookies: w.adminJar,
		body: { slug, title: `Тема ${slug}` },
	})
	assert.equal(reply.status, 201)
	const created = reply.body.topic as Json | undefined
	assert.ok(created && typeof created.id === 'string')
	return created.id
}

async function saveTest(w: World, topicId: string, slug: string, questions: Json[]): Promise<string> {
	const reply = await call(w.ctx, 'POST', '/api/tests/save', {
		cookies: w.adminJar,
		body: { topicId, title: `Тест ${slug}`, slug, isPublished: true, questions },
	})
	assert.equal(reply.status, 201)
	const created = reply.body.test as Json | undefined
	assert.ok(created && typeof created.id === 'string')
	return created.id
}

function putImages(w: World, count: number, bytes: number): string[] {
	const keys = Array.from({ length: count }, () => `images/${randomBytes(12).toString('hex')}.webp`).sort()
	for (const key of keys) w.mem.put(key, randomBytes(bytes), 'image/webp')
	return keys
}

function withImages(text: string, keys: string[]): string {
	return [text, ...keys.map((key, index) => `![рисунок ${index}](${key})`)].join('\n\n')
}

async function seedTestWithImages(
	w: World,
	slug: string,
	imageCount: number,
	imageBytes: number
): Promise<{ topicSlug: string; testId: string; images: string[] }> {
	const topicSlug = `${slug}-topic`
	const topicId = await createTopic(w, topicSlug)
	const images = putImages(w, imageCount, imageBytes)
	const half = Math.ceil(images.length / 2)
	const testId = await saveTest(w, topicId, slug, [
		radio(withImages(`Вопрос 1 ${slug}`, images.slice(0, half)), 0),
		radio(withImages(`Вопрос 2 ${slug}`, images.slice(half)), 1),
	])
	return { topicSlug, testId, images }
}

async function seedTopicWithTwoTests(w: World, topicSlug: string): Promise<void> {
	const topicId = await createTopic(w, topicSlug)
	const shared = putImages(w, 2, 512)
	await saveTest(w, topicId, `${topicSlug}-a`, [radio(withImages('Тема, тест A', shared), 0)])
	await saveTest(w, topicId, `${topicSlug}-b`, [
		radio(withImages('Тема, тест B1', shared.slice(0, 1)), 0),
		radio('Тема, тест B2', 1),
	])
}

function headersFor(jar: CookieJar): Record<string, string> {
	return { cookie: cookieHeader(jar), 'x-forwarded-for': nextIp() }
}

async function download(w: World, path: string, jar: CookieJar = w.adminJar): Promise<Download> {
	const response = await fetch(`${w.ctx.baseUrl}${path}`, { headers: headersFor(jar) })
	return { status: response.status, headers: response.headers, body: Buffer.from(await response.arrayBuffer()) }
}

function digest(buffer: Buffer): Array<[string, string]> {
	return [...readZipEntries(buffer)].map(([name, data]) => [name, createHash('sha256').update(data).digest('hex')])
}

async function bufferedTest(w: World, testId: string, withAnswers: boolean): Promise<Buffer> {
	const prepared = await w.qc.prepareTestArchive({ testId, withAnswers })
	return w.qc.archiveToBuffer(prepared, w.qc.ZIP_RESPONSE_LIMIT_BYTES)
}

async function bufferedTopic(w: World, topicSlug: string, withAnswers: boolean): Promise<Buffer> {
	const prepared = await w.qc.prepareTopicArchive({ topicSlug, withAnswers, scope: { all: true } })
	return w.qc.archiveToBuffer(prepared, w.qc.ZIP_RESPONSE_LIMIT_BYTES)
}

function assertJsonRefusal(reply: Download, status: number): Json {
	assert.equal(reply.status, status)
	assert.match(reply.headers.get('content-type') ?? '', /^application\/json/)
	assert.equal(reply.headers.get('content-disposition'), null)
	return JSON.parse(reply.body.toString('utf8')) as Json
}

function readsOf(spy: { mock: { calls: unknown[][] } }, keys: Set<string>): number {
	return spy.mock.calls.filter(([key]) => typeof key === 'string' && keys.has(key)).length
}

function eventsOf(spy: { mock: { calls: unknown[][] } }, event: string): Json[] {
	return spy.mock.calls
		.map(([payload]) => payload)
		.filter((payload): payload is Json => typeof payload === 'object' && payload !== null)
		.filter((payload) => payload.event === event)
}

async function assertServerResponds(w: World): Promise<void> {
	const reply = await call(w.ctx, 'GET', '/healthz')
	assert.equal(reply.status, 200)
}

type StalledExport = { reader: ReadableStreamDefaultReader<Uint8Array>; chunks: Uint8Array[] }

async function openStalledExport(w: World, path: string): Promise<StalledExport> {
	for (let attempt = 0; ; attempt += 1) {
		const response = await fetch(`${w.ctx.baseUrl}${path}`, { headers: headersFor(w.adminJar) })
		if (response.status === 429 && attempt < 40) {
			await response.arrayBuffer()
			await delay(50)
			continue
		}
		assert.equal(response.status, 200)
		assert.ok(response.body)
		const reader = response.body.getReader()
		const first = await reader.read()
		assert.ok(first.value && first.value.length > 0)
		return { reader, chunks: [first.value] }
	}
}

async function drain(stalled: StalledExport): Promise<Buffer> {
	for (;;) {
		const chunk = await stalled.reader.read()
		if (chunk.done) return Buffer.concat(stalled.chunks)
		stalled.chunks.push(chunk.value)
	}
}

async function downloadWhenFree(w: World, path: string): Promise<Download> {
	for (let attempt = 0; ; attempt += 1) {
		const reply = await download(w, path)
		if (reply.status !== 429 || attempt >= 40) return reply
		await delay(50)
	}
}

const EXPORT_BUSY = 'Экспорт уже выполняется, повторите позже'

describe('EXPORT_ZIP_MAX_BYTES=0: потоковый приёмник', () => {
	const world = setupWorld('test_export_stream', 'exp_stream', { EXPORT_ZIP_MAX_BYTES: '0' })

	test('экспорт теста идёт потоком без Content-Length, записи совпадают с режимом буфера', async () => {
		const w = world()
		const { topicSlug, testId } = await seedTestWithImages(w, 'stream-test', 3, 2048)
		for (const withAnswers of [false, true]) {
			const reply = await download(w, `/api/tests/${testId}/export${withAnswers ? '?withAnswers=true' : ''}`)
			assert.equal(reply.status, 200)
			assert.equal(reply.headers.get('content-type'), 'application/zip')
			assert.equal(reply.headers.get('content-disposition'), `attachment; filename="${topicSlug}-stream-test.zip"`)
			assert.equal(reply.headers.get('content-length'), null)
			assert.equal(reply.headers.get('transfer-encoding'), 'chunked')
			assert.deepEqual(digest(reply.body), digest(await bufferedTest(w, testId, withAnswers)))
		}
	})

	test('отказы до заголовков — JSON: чужой тест у учителя 403, несуществующий 404', async () => {
		const w = world()
		const { topicSlug, testId } = await seedTestWithImages(w, 'stream-denied', 1, 256)
		assert.deepEqual(assertJsonRefusal(await download(w, `/api/tests/${testId}/export`, w.teacherJar), 403), {
			error: 'Forbidden',
		})
		assertJsonRefusal(await download(w, `/api/tests/topics/${topicSlug}/export`, w.teacherJar), 403)
		assertJsonRefusal(await download(w, `/api/tests/${MISSING_TEST_ID}/export`), 404)
		assertJsonRefusal(await download(w, '/api/tests/topics/stream-no-such-topic/export'), 404)
	})

	test('экспорт темы потоком: те же записи, что в режиме буфера', async () => {
		const w = world()
		await seedTopicWithTwoTests(w, 'stream-topic')
		for (const withAnswers of [false, true]) {
			const reply = await download(w, `/api/tests/topics/stream-topic/export${withAnswers ? '?withAnswers=true' : ''}`)
			assert.equal(reply.status, 200)
			assert.equal(reply.headers.get('content-disposition'), 'attachment; filename="stream-topic.zip"')
			assert.equal(reply.headers.get('content-length'), null)
			assert.deepEqual(digest(reply.body), digest(await bufferedTopic(w, 'stream-topic', withAnswers)))
		}
	})

	test('закрытие соединения клиентом отменяет сборку: новых чтений хранилища нет, сервер отвечает', async () => {
		const w = world()
		const { testId, images } = await seedTestWithImages(w, 'stream-cancel', 48, 256 * 1024)
		const reads = vi.spyOn(w.mem, 'read')
		const info = vi.spyOn(w.logger, 'info')
		const controller = new AbortController()
		const response = await fetch(`${w.ctx.baseUrl}/api/tests/${testId}/export`, {
			headers: headersFor(w.adminJar),
			signal: controller.signal,
		})
		assert.equal(response.status, 200)
		assert.ok(response.body)
		const reader = response.body.getReader()
		const first = await reader.read()
		assert.ok(first.value && first.value.length > 0)
		controller.abort()
		await reader.cancel().catch(() => undefined)
		const keys = new Set(images)
		await delay(200)
		const settled = readsOf(reads, keys)
		await delay(200)
		assert.equal(readsOf(reads, keys), settled)
		assert.ok(settled < images.length, `reads ${settled} of ${images.length}`)
		const aborted = eventsOf(info, 'export_stream_aborted')
		assert.equal(aborted.length, 1)
		assert.equal(aborted[0]?.testId, testId)
		await assertServerResponds(w)
	})

	test('сбой хранилища после заголовков: соединение обрывается, событие в логе, сервер отвечает', async () => {
		const w = world()
		const { testId, images } = await seedTestWithImages(w, 'stream-failure', 10, 64 * 1024)
		const failing = images[images.length - 1]
		assert.ok(failing)
		w.mem.failOn({ op: 'read', key: failing })
		const error = vi.spyOn(w.logger, 'error')
		const response = await fetch(`${w.ctx.baseUrl}/api/tests/${testId}/export`, { headers: headersFor(w.adminJar) })
		assert.equal(response.status, 200)
		assert.equal(response.headers.get('content-type'), 'application/zip')
		await assert.rejects(response.arrayBuffer())
		const events = eventsOf(error, 'export_stream_failed')
		assert.equal(events.length, 1)
		assert.equal(events[0]?.testId, testId)
		assert.ok(events[0]?.err)
		w.mem.clearFailures()
		await assertServerResponds(w)
		const again = await download(w, `/api/tests/${testId}/export`)
		assert.equal(again.status, 200)
		assert.deepEqual(digest(again.body), digest(await bufferedTest(w, testId, false)))
	})
	test('третий одновременный экспорт — 429 до заголовков, после завершения первого — снова 200', async () => {
		const w = world()
		const { testId, topicSlug } = await seedTestWithImages(w, 'stream-slots', 48, 256 * 1024)
		const testPath = `/api/tests/${testId}/export`
		const first = await openStalledExport(w, testPath)
		const second = await openStalledExport(w, `/api/tests/topics/${topicSlug}/export`)
		assert.deepEqual(assertJsonRefusal(await download(w, testPath), 429), { error: EXPORT_BUSY })
		assert.deepEqual(assertJsonRefusal(await download(w, `/api/tests/topics/${topicSlug}/export`), 429), {
			error: EXPORT_BUSY,
		})
		const firstBody = await drain(first)
		const again = await downloadWhenFree(w, testPath)
		assert.equal(again.status, 200)
		assert.equal(again.headers.get('content-type'), 'application/zip')
		assert.deepEqual(digest(again.body), digest(firstBody))
		await second.reader.cancel()
		await assertServerResponds(w)
	})

	test('обрыв соединения клиентом освобождает место экспорта', async () => {
		const w = world()
		const { testId } = await seedTestWithImages(w, 'stream-slots-abort', 48, 256 * 1024)
		const path = `/api/tests/${testId}/export`
		const first = await openStalledExport(w, path)
		const second = await openStalledExport(w, path)
		assert.equal((await download(w, path)).status, 429)
		await first.reader.cancel()
		await second.reader.cancel()
		const again = await downloadWhenFree(w, path)
		assert.equal(again.status, 200)
		assert.equal(again.headers.get('content-type'), 'application/zip')
		assert.ok(readZipEntries(again.body).size > 0)
	})
})

describe('EXPORT_ZIP_MAX_BYTES не задан: буфер 4 400 000', () => {
	const world = setupWorld('test_export_buffer', 'exp_buffer')

	test('экспорт маленького теста — 200 с Content-Length и теми же записями', async () => {
		const w = world()
		const { topicSlug, testId } = await seedTestWithImages(w, 'buffer-test', 3, 2048)
		for (const withAnswers of [false, true]) {
			const reply = await download(w, `/api/tests/${testId}/export${withAnswers ? '?withAnswers=true' : ''}`)
			assert.equal(reply.status, 200)
			assert.equal(reply.headers.get('content-type'), 'application/zip')
			assert.equal(reply.headers.get('content-disposition'), `attachment; filename="${topicSlug}-buffer-test.zip"`)
			assert.equal(reply.headers.get('content-length'), String(reply.body.length))
			assert.deepEqual(digest(reply.body), digest(await bufferedTest(w, testId, withAnswers)))
		}
	})

	test('экспорт темы — те же записи, что в режиме потока', async () => {
		const w = world()
		await seedTopicWithTwoTests(w, 'buffer-topic')
		for (const withAnswers of [false, true]) {
			const reply = await download(w, `/api/tests/topics/buffer-topic/export${withAnswers ? '?withAnswers=true' : ''}`)
			assert.equal(reply.status, 200)
			assert.equal(reply.headers.get('content-length'), String(reply.body.length))
			assert.deepEqual(digest(reply.body), digest(await bufferedTopic(w, 'buffer-topic', withAnswers)))
		}
	})

	test('отказы — JSON без заголовков ZIP', async () => {
		const w = world()
		const { testId } = await seedTestWithImages(w, 'buffer-denied', 1, 256)
		assertJsonRefusal(await download(w, `/api/tests/${testId}/export`, w.teacherJar), 403)
		assertJsonRefusal(await download(w, `/api/tests/${MISSING_TEST_ID}/export`), 404)
	})
})

describe('EXPORT_ZIP_MAX_BYTES=2000: буфер с потолком', () => {
	const world = setupWorld('test_export_ceiling', 'exp_ceiling', { EXPORT_ZIP_MAX_BYTES: '2000' })

	test('архив больше потолка — 413 до заголовков, чтений меньше числа ключей', async () => {
		const w = world()
		const { testId, images } = await seedTestWithImages(w, 'ceiling-test', 16, 4096)
		const reads = vi.spyOn(w.mem, 'read')
		const reply = await download(w, `/api/tests/${testId}/export`)
		assert.equal(assertJsonRefusal(reply, 413).error, TOO_LARGE)
		const count = readsOf(reads, new Set(images))
		assert.ok(count < images.length, `reads ${count} of ${images.length}`)
		await assertServerResponds(w)
	})

	test('тема больше потолка — 413', async () => {
		const w = world()
		const topicSlug = 'ceiling-topic'
		const topicId = await createTopic(w, topicSlug)
		await saveTest(w, topicId, `${topicSlug}-a`, [radio(withImages('Тема с картинками', putImages(w, 4, 4096)), 0)])
		const reply = await download(w, `/api/tests/topics/${topicSlug}/export`)
		assert.equal(assertJsonRefusal(reply, 413).error, TOO_LARGE)
	})
})

describe('sendArchive в потоке: отказ до первого байта', () => {
	test('ошибка уходит в next, заголовки ZIP сняты, ответ — JSON', async () => {
		const { sendArchive } = await import('./export-response.js')
		const app = express()
		app.get('/archive', async (req, res, next) => {
			try {
				await sendArchive(
					req,
					res,
					{ entries: [{ name: '../outside.txt', buffer: Buffer.from('x') }], missing: [], filename: 'bad.zip' },
					{ mode: 'stream' }
				)
			} catch (error) {
				next(error)
			}
		})
		app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
			res.status(500).json({ error: error.name })
		})
		const server = await startTestServer(app)
		try {
			const response = await fetch(`${server.baseUrl}/archive`)
			assert.equal(response.status, 500)
			assert.match(response.headers.get('content-type') ?? '', /^application\/json/)
			assert.equal(response.headers.get('content-disposition'), null)
			assert.deepEqual(await response.json(), { error: 'ZipEntryNameError' })
		} finally {
			await server.close()
		}
	})
})

describe('EXPORT_ZIP_MAX_BYTES с неверным значением', () => {
	test('сервер не стартует, сообщение называет ключ', async () => {
		await assert.rejects(
			startAuthApp('test_export_badenv', { env: { EXPORT_ZIP_MAX_BYTES: '4.4MB' } }),
			/EXPORT_ZIP_MAX_BYTES/
		)
	}, 60_000)
})

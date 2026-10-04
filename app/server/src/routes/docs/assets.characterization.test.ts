import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import sharp from 'sharp'
import { afterAll, afterEach, beforeAll, describe, test } from 'vitest'

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
import { memoryStorage } from '../../test-support/storage.js'

type Json = Record<string, unknown>

type Reply = { status: number; body: Json }

type Asset = { filename: string; path: string; signedUrl: string; size: number; createdAt: string }

const PASSWORD = 'assets-char-password-1'
const ASSET_KEYS = ['createdAt', 'filename', 'path', 'signedUrl', 'size']

const KNOWN_DEFECTS = new Set<string>(['STOR-delete-used-asset'])

function defectTest(id: string, title: string, fn: () => Promise<void>, timeout?: number): void {
	const run = KNOWN_DEFECTS.has(id) ? test.fails : test
	run(`${id}: ${title}`, fn, timeout)
}

let ctx: AuthApp
let mem: MemoryStorageAdapter
let adminJar: CookieJar
let studentJar: CookieJar
let tinyPng: Buffer

function imageKey(): string {
	return `images/${randomBytes(16).toString('hex')}.webp`
}

function webpBytes(): Buffer {
	return Buffer.from(`webp-${randomBytes(8).toString('hex')}`)
}

async function postFile(path: string, field: string, bytes: Buffer, type: string, jar: CookieJar): Promise<Reply> {
	const form = new FormData()
	form.append(field, new Blob([new Uint8Array(bytes)], { type }), 'a.png')
	const response = await fetch(`${ctx.baseUrl}${path}`, {
		method: 'POST',
		body: form,
		headers: { cookie: cookieHeader(jar), 'x-forwarded-for': nextIp() },
	})
	const text = await response.text()
	let body: Json
	try {
		body = JSON.parse(text) as Json
	} catch {
		body = { raw: text }
	}
	return { status: response.status, body }
}

async function fetchBytes(path: string, jar: CookieJar | null): Promise<{ status: number; bytes: Buffer }> {
	const headers: Record<string, string> = { 'x-forwarded-for': nextIp() }
	if (jar) headers.cookie = cookieHeader(jar)
	const response = await fetch(`${ctx.baseUrl}${path}`, { headers })
	return { status: response.status, bytes: Buffer.from(await response.arrayBuffer()) }
}

function proxyPath(key: string): string {
	return `/api/docs/assets/proxy?path=${encodeURIComponent(key)}`
}

beforeAll(async () => {
	ctx = await startAuthApp('test_assets_char')
	await seedUser(ctx, { login: 'assets_admin', roles: ['admin'], password: PASSWORD })
	await seedUser(ctx, { login: 'assets_student', roles: ['user'], password: PASSWORD })
	const admin = await login(ctx, 'assets_admin', PASSWORD)
	assert.equal(admin.status, 200)
	adminJar = admin.jar
	const student = await login(ctx, 'assets_student', PASSWORD)
	assert.equal(student.status, 200)
	studentJar = student.jar
	mem = await memoryStorage()
	tinyPng = await sharp({
		create: { width: 64, height: 64, channels: 4, background: { r: 0, g: 128, b: 255, alpha: 1 } },
	})
		.png()
		.toBuffer()
}, 60_000)

afterEach(() => {
	mem?.clearFailures()
})

afterAll(async () => {
	await ctx?.stop()
})

describe('GET /api/docs/assets', () => {
	test('администратор получает страницу медиатеки с total и полями filename, path, signedUrl, size, createdAt', async () => {
		mem.reset()
		const keys = [imageKey(), imageKey(), imageKey()]
		for (const key of keys) mem.put(key, webpBytes(), 'image/webp')
		const reply = await call(ctx, 'GET', '/api/docs/assets?limit=2&offset=0', { cookies: adminJar })
		assert.equal(reply.status, 200)
		assert.equal(reply.body.total, 3)
		const assets = reply.body.assets as Asset[]
		assert.equal(assets.length, 2)
		for (const asset of assets) {
			assert.deepEqual(Object.keys(asset).sort(), ASSET_KEYS)
			assert.ok(keys.includes(asset.path))
			assert.equal(asset.path, `images/${asset.filename}`)
			assert.ok(asset.signedUrl.startsWith('/api/docs/assets/proxy?path=images%2F'))
			assert.equal(asset.size, mem.get(asset.path)?.data.length)
			assert.equal(typeof asset.createdAt, 'string')
		}
	})

	test('без cookie сессии ответ 401', async () => {
		const reply = await call(ctx, 'GET', '/api/docs/assets')
		assert.equal(reply.status, 401)
		assert.equal(reply.body.error, 'Unauthorized')
	})
})

describe('POST /api/docs/assets', () => {
	test('PNG администратора сохраняется как images/<32 hex>.webp с типом image/webp', async () => {
		const reply = await postFile('/api/docs/assets', 'file', tinyPng, 'image/png', adminJar)
		assert.equal(reply.status, 200)
		assert.equal(reply.body.success, true)
		const path = reply.body.path as string
		assert.match(path, /^images\/[0-9a-f]{32}\.webp$/)
		assert.equal(reply.body.filename, path.slice('images/'.length))
		const object = mem.get(path)
		assert.ok(object)
		assert.equal(object.contentType, 'image/webp')
		const meta = await sharp(object.data).metadata()
		assert.equal(meta.format, 'webp')
	})

	test('tracer: загруженная картинка отдаётся через /proxy теми же байтами', async () => {
		const upload = await postFile('/api/docs/assets', 'file', tinyPng, 'image/png', adminJar)
		assert.equal(upload.status, 200)
		const path = upload.body.path as string
		const served = await fetchBytes(proxyPath(path), adminJar)
		assert.equal(served.status, 200)
		assert.ok(served.bytes.equals(mem.get(path)?.data ?? Buffer.alloc(0)))
	})
})

describe('DELETE /api/docs/assets', () => {
	test('администратор удаляет images/<hex>.webp: 200 { success: true }, объекта нет', async () => {
		const key = imageKey()
		mem.put(key, webpBytes(), 'image/webp')
		const reply = await call(ctx, 'DELETE', '/api/docs/assets', { cookies: adminJar, body: { path: key } })
		assert.equal(reply.status, 200)
		assert.deepEqual(reply.body, { success: true })
		assert.equal(mem.get(key), null)
	})

	test('ключ вне images/ отклоняется: 400, объект на месте', async () => {
		const key = 'topics/t/s/prompt.md'
		mem.put(key, 'Промпт', 'text/markdown')
		const reply = await call(ctx, 'DELETE', '/api/docs/assets', { cookies: adminJar, body: { path: key } })
		assert.equal(reply.status, 400)
		assert.equal(reply.body.error, 'Invalid path')
		assert.ok(mem.get(key))
	})
})

describe('GET /api/docs/assets/proxy', () => {
	test('администратор получает байты объекта', async () => {
		const key = imageKey()
		const bytes = webpBytes()
		mem.put(key, bytes, 'image/webp')
		const served = await fetchBytes(proxyPath(key), adminJar)
		assert.equal(served.status, 200)
		assert.ok(served.bytes.equals(bytes))
	})

	test('путь с .. отклоняется: 400', async () => {
		const reply = await call(ctx, 'GET', '/api/docs/assets/proxy?path=..%2Fx', { cookies: adminJar })
		assert.equal(reply.status, 400)
		assert.equal(reply.body.error, 'Invalid path')
	})

	test('без cookie сессии ответ 401', async () => {
		const key = imageKey()
		mem.put(key, webpBytes(), 'image/webp')
		const reply = await call(ctx, 'GET', proxyPath(key))
		assert.equal(reply.status, 401)
		assert.equal(reply.body.error, 'Unauthorized')
	})
})

describe('GET /api/docs/assets/signed', () => {
	test('возвращает signedUrl на маршрут proxy', async () => {
		const key = imageKey()
		const reply = await call(ctx, 'GET', `/api/docs/assets/signed?path=${encodeURIComponent(key)}`, {
			cookies: adminJar,
		})
		assert.equal(reply.status, 200)
		const signedUrl = reply.body.signedUrl as string
		assert.ok(signedUrl.startsWith(`/api/docs/assets/proxy?path=${encodeURIComponent(key)}`))
	})
})

describe('известные дефекты медиатеки (D-23)', () => {
	defectTest('STOR-student-reads-answer-keys', 'студент не читает topics/…/answer_keys.json через /proxy', async () => {
		mem.put('topics/t/s/answer_keys.json', '[]', 'application/json')
		const reply = await call(ctx, 'GET', proxyPath('topics/t/s/answer_keys.json'), { cookies: studentJar })
		assert.equal(reply.status, 400)
	})

	defectTest('STOR-student-deletes-asset', 'студент не удаляет картинку медиатеки', async () => {
		const key = imageKey()
		mem.put(key, webpBytes(), 'image/webp')
		const reply = await call(ctx, 'DELETE', '/api/docs/assets', { cookies: studentJar, body: { path: key } })
		assert.equal(reply.status, 403)
		assert.ok(mem.get(key))
	})

	defectTest('STOR-delete-used-asset', 'картинка, на которую ссылается вопрос, не удаляется', async () => {
		const key = imageKey()
		mem.put(key, webpBytes(), 'image/webp')
		const topic = await call(ctx, 'POST', '/api/tests/topics', {
			cookies: adminJar,
			body: { slug: 'assets-used', title: 'Тема с картинкой' },
		})
		assert.equal(topic.status, 201)
		const topicId = (topic.body.topic as Json).id as string
		const saved = await call(ctx, 'POST', '/api/tests/save', {
			cookies: adminJar,
			body: {
				topicId,
				title: 'Тест с картинкой',
				slug: 'assets-used-test',
				isPublished: true,
				questions: [
					{
						type: 'radio',
						order: 0,
						promptText: `Что на рисунке?\n\n![](${key})`,
						options: [
							{ id: 'a', text: 'Клетка' },
							{ id: 'b', text: 'Ткань' },
						],
						correct: 'a',
						points: 1,
					},
				],
			},
		})
		assert.equal(saved.status, 201)
		const reply = await call(ctx, 'DELETE', '/api/docs/assets', { cookies: adminJar, body: { path: key } })
		assert.equal(reply.status, 409)
		assert.ok(mem.get(key))
	})
})

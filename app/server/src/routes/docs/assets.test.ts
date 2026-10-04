import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import sharp from 'sharp'
import { afterAll, beforeAll, beforeEach, describe, test, vi } from 'vitest'

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

type Profile = 'admin' | 'user' | 'user_allow_tests_write' | 'admin_deny_tests_write' | 'anonymous'

const PASSWORD = 'assets-access-password-1'
const SUPABASE_HOST = 'https://fake-project.supabase.test'

const PROFILES: Array<{ name: Exclude<Profile, 'anonymous'>; roles: string[]; allow: boolean | null }> = [
	{ name: 'admin', roles: ['admin'], allow: null },
	{ name: 'user', roles: ['user'], allow: null },
	{ name: 'user_allow_tests_write', roles: ['user'], allow: true },
	{ name: 'admin_deny_tests_write', roles: ['admin'], allow: false },
]

const EXPECTED_STATUS: Record<Profile, number> = {
	admin: 200,
	user: 403,
	user_allow_tests_write: 200,
	admin_deny_tests_write: 403,
	anonymous: 401,
}

const SERVABLE_KEYS = ['images/a.webp', 'topics/t/s/assets/b.png', 'avatars/u/c.png']

const NOT_SERVABLE_KEYS = [
	'topics/t/s/answer_keys.json',
	'topics/t/s/questions/q/prompt.md',
	'topics/t/s/settings.json',
	'images/x.svg',
]

const TRAVERSAL_INPUTS = [
	'../x',
	'images/../topics/t/s/answer_keys.json',
	'images/..%2fx',
	'images/%2e%2e/x',
	'images/%252e%252e/x',
	'/etc/passwd',
	'C:\\x',
	'images\\x',
	'main/images/a.webp',
	'images/a\u0000.webp',
]

const ASSET_IN_USE = 'Изображение используется в вопросах'
const INDEX_INCOMPLETE = 'Удаление недоступно: ссылки на изображения ещё не проиндексированы'

let ctx: AuthApp
let mem: MemoryStorageAdapter
let tinyPng: Buffer
let adminId = ''
let topicCounter = 0
const jars = new Map<Exclude<Profile, 'anonymous'>, CookieJar>()

function jarOf(profile: Profile): CookieJar | undefined {
	if (profile === 'anonymous') return undefined
	const jar = jars.get(profile)
	assert.ok(jar, `no session for ${profile}`)
	return jar
}

function imageKey(): string {
	return `images/${randomBytes(16).toString('hex')}.webp`
}

function bytesOf(label: string): Buffer {
	return Buffer.from(`${label}-${randomBytes(8).toString('hex')}`)
}

function seedImages(): void {
	mem.put('images/a.webp', bytesOf('a'), 'image/webp')
	mem.put('topics/t/s/assets/b.png', bytesOf('b'), 'image/png')
	mem.put('avatars/u/c.png', bytesOf('c'), 'image/png')
	mem.put('topics/t/s/answer_keys.json', '[]', 'application/json')
	mem.put('topics/t/s/questions/q/prompt.md', 'Промпт', 'text/markdown')
	mem.put('topics/t/s/settings.json', '{}', 'application/json')
	mem.put('images/x.svg', '<svg/>', 'image/svg+xml')
	mem.put('images/sub/a.webp', bytesOf('sub'), 'image/webp')
}

function proxyPath(key: string): string {
	return `/api/docs/assets/proxy?path=${encodeURIComponent(key)}`
}

function signedPath(value: string): string {
	return `/api/docs/assets/signed?path=${encodeURIComponent(value)}`
}

async function postImage(jar: CookieJar | undefined): Promise<Reply> {
	const form = new FormData()
	form.append('file', new Blob([new Uint8Array(tinyPng)], { type: 'image/png' }), 'a.png')
	const headers: Record<string, string> = { 'x-forwarded-for': nextIp() }
	if (jar) headers.cookie = cookieHeader(jar)
	const response = await fetch(`${ctx.baseUrl}/api/docs/assets`, { method: 'POST', body: form, headers })
	const text = await response.text()
	let body: Json
	try {
		body = JSON.parse(text) as Json
	} catch {
		body = { raw: text }
	}
	return { status: response.status, body }
}

async function fetchRaw(path: string, jar: CookieJar | undefined) {
	const headers: Record<string, string> = { 'x-forwarded-for': nextIp() }
	if (jar) headers.cookie = cookieHeader(jar)
	const response = await fetch(`${ctx.baseUrl}${path}`, { headers })
	return { status: response.status, headers: response.headers, bytes: Buffer.from(await response.arrayBuffer()) }
}

beforeAll(async () => {
	vi.stubEnv('SUPABASE_URL', SUPABASE_HOST)
	vi.stubEnv('SUPABASE_STORAGE_BUCKET', 'main')
	ctx = await startAuthApp('test_assets_access')
	const { db, schema } = ctx
	for (const profile of PROFILES) {
		const username = `assets_${profile.name}`
		const userId = await seedUser(ctx, { login: username, roles: profile.roles, password: PASSWORD })
		if (profile.name === 'admin') adminId = userId
		if (profile.allow !== null) {
			await db.insert(schema.rbacUserGrants).values({ userId, domain: 'tests', action: 'write', allow: profile.allow })
		}
		const reply = await login(ctx, username, PASSWORD)
		assert.equal(reply.status, 200)
		jars.set(profile.name, reply.jar)
	}
	mem = await memoryStorage()
	tinyPng = await sharp({
		create: { width: 64, height: 64, channels: 4, background: { r: 0, g: 128, b: 255, alpha: 1 } },
	})
		.png()
		.toBuffer()
}, 60_000)

beforeEach(() => {
	mem.reset()
	seedImages()
})

afterAll(async () => {
	await ctx?.stop()
	vi.unstubAllEnvs()
})

const MATRIX = Object.entries(EXPECTED_STATUS) as Array<[Profile, number]>

describe('GET /api/docs/assets: право tests.write', () => {
	for (const [profile, status] of MATRIX) {
		test(`${profile} → ${status}`, async () => {
			const reply = await call(ctx, 'GET', '/api/docs/assets', { cookies: jarOf(profile) })
			assert.equal(reply.status, status)
			if (status === 200) {
				assert.equal(typeof reply.body.total, 'number')
				assert.ok(Array.isArray(reply.body.assets))
			}
		})
	}
})

describe('POST /api/docs/assets: право tests.write', () => {
	for (const [profile, status] of MATRIX) {
		test(`${profile} → ${status}`, async () => {
			const before = mem.keys()
			const reply = await postImage(jarOf(profile))
			assert.equal(reply.status, status)
			if (status === 200) {
				assert.match(reply.body.path as string, /^images\/[0-9a-f]{32}\.webp$/)
				assert.ok(mem.get(reply.body.path as string))
			} else {
				assert.deepEqual(mem.keys(), before)
			}
		})
	}
})

describe('DELETE /api/docs/assets: право tests.write', () => {
	for (const [profile, status] of MATRIX) {
		test(`${profile} → ${status}`, async () => {
			const key = imageKey()
			mem.put(key, bytesOf('delete'), 'image/webp')
			const reply = await call(ctx, 'DELETE', '/api/docs/assets', { cookies: jarOf(profile), body: { path: key } })
			assert.equal(reply.status, status)
			if (status === 200) {
				assert.deepEqual(reply.body, { success: true })
				assert.equal(mem.get(key), null)
			} else {
				assert.ok(mem.get(key))
			}
		})
	}
})

describe('DELETE /api/docs/assets: только images/<имя>', () => {
	for (const input of ['topics/t/s/assets/b.png', 'images/sub/a.webp', ...TRAVERSAL_INPUTS]) {
		test(`${JSON.stringify(input)} → 400, хранилище не меняется`, async () => {
			const before = mem.keys()
			const reply = await call(ctx, 'DELETE', '/api/docs/assets', { cookies: jarOf('admin'), body: { path: input } })
			assert.equal(reply.status, 400)
			assert.equal(reply.body.error, 'Invalid path')
			assert.deepEqual(mem.keys(), before)
		})
	}
})

async function testWithPrompt(promptText: string): Promise<string> {
	topicCounter += 1
	const slug = `assets-usage-${topicCounter}`
	const topic = await call(ctx, 'POST', '/api/tests/topics', {
		cookies: jarOf('admin'),
		body: { slug, title: `Тема ${slug}` },
	})
	assert.equal(topic.status, 201, JSON.stringify(topic.body))
	const saved = await call(ctx, 'POST', '/api/tests/save', {
		cookies: jarOf('admin'),
		body: {
			topicId: (topic.body.topic as Json).id,
			title: `Тест ${slug}`,
			slug: `${slug}-test`,
			isPublished: true,
			questions: [
				{
					type: 'radio',
					order: 0,
					promptText,
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
	assert.equal(saved.status, 201, JSON.stringify(saved.body))
	return (saved.body.test as Json).id as string
}

async function deleteAsset(key: string): Promise<Reply> {
	return call(ctx, 'DELETE', '/api/docs/assets', { cookies: jarOf('admin'), body: { path: key } })
}

describe('DELETE /api/docs/assets: используемая картинка (D-16)', () => {
	test('картинка из промпта вопроса: 409 с usage, объект на месте', async () => {
		const key = imageKey()
		mem.put(key, bytesOf('used'), 'image/webp')
		await testWithPrompt(`Что на рисунке?\n\n![](${key})`)
		const reply = await deleteAsset(key)
		assert.equal(reply.status, 409)
		assert.deepEqual(reply.body, { error: ASSET_IN_USE, usage: { questions: 1, drafts: 0 } })
		assert.ok(mem.get(key))
	})

	test('картинка из черновика вопроса: 409 с usage.drafts = 1, объект на месте', async () => {
		const key = imageKey()
		mem.put(key, bytesOf('draft'), 'image/webp')
		const testId = await testWithPrompt('Вопрос без картинки')
		await ctx.db
			.insert(ctx.schema.questionDrafts)
			.values({ testId, ownerId: adminId, payload: { promptText: `<img src="/uploads/${key}">` } })
		const reply = await deleteAsset(key)
		assert.equal(reply.status, 409)
		assert.deepEqual(reply.body, { error: ASSET_IN_USE, usage: { questions: 0, drafts: 1 } })
		assert.ok(mem.get(key))
	})

	async function testWithQuestions(questions: Array<{ promptText: string; explanationText?: string }>) {
		topicCounter += 1
		const slug = `assets-usage-${topicCounter}`
		const topic = await call(ctx, 'POST', '/api/tests/topics', {
			cookies: jarOf('admin'),
			body: { slug, title: `Тема ${slug}` },
		})
		assert.equal(topic.status, 201, JSON.stringify(topic.body))
		const saved = await call(ctx, 'POST', '/api/tests/save', {
			cookies: jarOf('admin'),
			body: {
				topicId: (topic.body.topic as Json).id,
				title: `Тест ${slug}`,
				slug: `${slug}-test`,
				isPublished: true,
				questions: questions.map((question, order) => ({
					type: 'radio',
					order,
					...question,
					options: [
						{ id: 'a', text: 'Клетка' },
						{ id: 'b', text: 'Ткань' },
					],
					correct: 'a',
					points: 1,
				})),
			},
		})
		assert.equal(saved.status, 201, JSON.stringify(saved.body))
		const testId = (saved.body.test as Json).id as string
		const { rows } = await ctx.pgPool.query<{ id: string }>(
			'SELECT id FROM questions WHERE test_id = $1 ORDER BY "order", id',
			[testId]
		)
		return { testId, questionIds: rows.map((row) => row.id) }
	}

	test('картинка только в пояснении одного вопроса, в промпте второго и в черновике: 409, usage считает всех', async () => {
		const key = imageKey()
		mem.put(key, bytesOf('everywhere'), 'image/webp')
		const { testId } = await testWithQuestions([
			{ promptText: 'Без картинки в промпте', explanationText: `Пояснение ![](${key})` },
			{ promptText: `Промпт <img src="/api/docs/assets/proxy?path=${encodeURIComponent(key)}">` },
		])
		await ctx.db
			.insert(ctx.schema.questionDrafts)
			.values({ testId, ownerId: adminId, payload: { promptText: `![](${key})` } })
		const reply = await deleteAsset(key)
		assert.equal(reply.status, 409)
		assert.deepEqual(reply.body, { error: ASSET_IN_USE, usage: { questions: 2, drafts: 1 } })
		assert.ok(mem.get(key))
	})

	test('после удаления одного из двух вопросов с общей картинкой удаление картинки всё ещё 409', async () => {
		const key = imageKey()
		mem.put(key, bytesOf('shared'), 'image/webp')
		const { testId, questionIds } = await testWithQuestions([
			{ promptText: `Первый ![](${key})` },
			{ promptText: `Второй ![](${key})` },
		])
		const [first] = questionIds
		assert.ok(first)
		const removed = await call(ctx, 'DELETE', `/api/tests/${testId}/questions/${first}`, { cookies: jarOf('admin') })
		assert.equal(removed.status, 200, JSON.stringify(removed.body))
		assert.ok(mem.get(key))
		const reply = await deleteAsset(key)
		assert.equal(reply.status, 409)
		assert.deepEqual(reply.body, { error: ASSET_IN_USE, usage: { questions: 1, drafts: 0 } })
		assert.ok(mem.get(key))
	})

	test('_ и % в ключе не работают как шаблон LIKE', async () => {
		const name = randomBytes(16).toString('hex')
		const testId = await testWithPrompt('Вопрос без картинки')
		await ctx.db
			.insert(ctx.schema.questionDrafts)
			.values({ testId, ownerId: adminId, payload: { promptText: `![](images/${name}.webp)` } })
		const underscore = `images/${name}_webp`
		mem.put(underscore, bytesOf('underscore'), 'image/webp')
		const first = await deleteAsset(underscore)
		assert.equal(first.status, 200, JSON.stringify(first.body))
		assert.equal(mem.get(underscore), null)
		const percent = await deleteAsset('images/%')
		assert.equal(percent.status, 200, JSON.stringify(percent.body))

		const other = randomBytes(16).toString('hex')
		await ctx.db
			.insert(ctx.schema.questionDrafts)
			.values({ testId, ownerId: adminId, payload: { promptText: `![](images/${other}_webp)` } })
		const dotted = `images/${other}.webp`
		mem.put(dotted, bytesOf('dotted'), 'image/webp')
		const second = await deleteAsset(dotted)
		assert.equal(second.status, 200, JSON.stringify(second.body))
		assert.equal(mem.get(dotted), null)
	})

	test('пока у вопроса assets_indexed = false, любое удаление отклоняется', async () => {
		const testId = await testWithPrompt('Вопрос без картинки')
		const { rows } = await ctx.pgPool.query<{ id: string }>(
			'INSERT INTO questions (test_id, type, "order") VALUES ($1, \'radio\', 1) RETURNING id',
			[testId]
		)
		const questionId = rows[0]?.id
		assert.ok(questionId)
		const key = imageKey()
		mem.put(key, bytesOf('unindexed'), 'image/webp')
		try {
			const reply = await deleteAsset(key)
			assert.equal(reply.status, 409)
			assert.deepEqual(reply.body, { error: INDEX_INCOMPLETE })
			assert.ok(mem.get(key))
		} finally {
			await ctx.pgPool.query('DELETE FROM questions WHERE id = $1', [questionId])
		}
	})

	test('неиспользуемая картинка при полном индексе: 200 { success: true }, объекта нет', async () => {
		await testWithPrompt(`![](${imageKey()})`)
		const key = imageKey()
		mem.put(key, bytesOf('unused'), 'image/webp')
		const reply = await deleteAsset(key)
		assert.equal(reply.status, 200)
		assert.deepEqual(reply.body, { success: true })
		assert.equal(mem.get(key), null)
	})
})

describe('GET /api/docs/assets/proxy: только картинки в пространствах имён', () => {
	for (const key of SERVABLE_KEYS) {
		test(`user получает ${key}`, async () => {
			const served = await fetchRaw(proxyPath(key), jarOf('user'))
			assert.equal(served.status, 200)
			assert.ok(served.bytes.equals(mem.get(key)?.data ?? Buffer.alloc(0)))
			assert.equal(served.headers.get('x-content-type-options'), 'nosniff')
		})
	}

	for (const key of NOT_SERVABLE_KEYS) {
		test(`user не получает ${key}: 400`, async () => {
			const reply = await call(ctx, 'GET', proxyPath(key), { cookies: jarOf('user') })
			assert.equal(reply.status, 400)
			assert.equal(reply.body.error, 'Invalid path')
		})
	}

	for (const input of TRAVERSAL_INPUTS) {
		test(`${JSON.stringify(input)} → 400, хранилище не меняется`, async () => {
			const before = mem.keys()
			const reply = await call(ctx, 'GET', proxyPath(input), { cookies: jarOf('user') })
			assert.equal(reply.status, 400)
			assert.deepEqual(mem.keys(), before)
		})
	}

	test('отсутствующая картинка → 404', async () => {
		const reply = await call(ctx, 'GET', proxyPath(imageKey()), { cookies: jarOf('user') })
		assert.equal(reply.status, 404)
	})

	test('без cookie сессии ответ 401', async () => {
		const reply = await call(ctx, 'GET', proxyPath('images/a.webp'))
		assert.equal(reply.status, 401)
	})
})

describe('GET /api/docs/assets/signed: разрешение ссылки', () => {
	for (const key of SERVABLE_KEYS) {
		test(`user получает URL для ${key}`, async () => {
			const reply = await call(ctx, 'GET', signedPath(key), { cookies: jarOf('user') })
			assert.equal(reply.status, 200)
			assert.equal(reply.body.signedUrl, proxyPath(key))
		})
	}

	for (const key of NOT_SERVABLE_KEYS) {
		test(`user не получает URL для ${key}: 400`, async () => {
			const reply = await call(ctx, 'GET', signedPath(key), { cookies: jarOf('user') })
			assert.equal(reply.status, 400)
			assert.equal(reply.body.error, 'Invalid path')
		})
	}

	for (const input of TRAVERSAL_INPUTS) {
		test(`${JSON.stringify(input)} → 400, хранилище не меняется`, async () => {
			const before = mem.keys()
			const reply = await call(ctx, 'GET', signedPath(input), { cookies: jarOf('user') })
			assert.equal(reply.status, 400)
			assert.deepEqual(mem.keys(), before)
		})
	}

	const LEGACY: Array<{ input: string; key: string }> = [
		{ input: 'images/a.webp', key: 'images/a.webp' },
		{ input: `${SUPABASE_HOST}/storage/v1/object/public/main/images/a.webp`, key: 'images/a.webp' },
		{
			input: `${SUPABASE_HOST}/storage/v1/object/sign/main/topics/t/s/assets/b.png?token=1`,
			key: 'topics/t/s/assets/b.png',
		},
		{ input: '/uploads/images/a.webp', key: 'images/a.webp' },
		{ input: 'uploads/images/a.webp', key: 'images/a.webp' },
		{ input: '/uploads/tests/t/s/assets/b.png', key: 'topics/t/s/assets/b.png' },
		{ input: '/uploads/avatars/u/c.png', key: 'avatars/u/c.png' },
		{ input: '/api/docs/assets/proxy?path=images%2Fa.webp&cacheNonce=1', key: 'images/a.webp' },
	]

	for (const { input, key } of LEGACY) {
		test(`устаревшая ссылка ${input} открывается через proxy`, async () => {
			const reply = await call(ctx, 'GET', signedPath(input), { cookies: jarOf('user') })
			assert.equal(reply.status, 200)
			const signedUrl = reply.body.signedUrl as string
			assert.equal(signedUrl, proxyPath(key))
			const served = await fetchRaw(signedUrl, jarOf('user'))
			assert.equal(served.status, 200)
			assert.ok(served.bytes.equals(mem.get(key)?.data ?? Buffer.alloc(0)))
		})
	}

	for (const url of [
		'https://example.com/x.png',
		'https://x.supabase.co/storage/v1/object/public/other/images/a.webp',
		'https://other-project.supabase.test/storage/v1/object/public/main/images/a.webp',
	]) {
		test(`внешний URL ${url} возвращается как есть`, async () => {
			const reply = await call(ctx, 'GET', signedPath(url), { cookies: jarOf('user') })
			assert.equal(reply.status, 200)
			assert.equal(reply.body.signedUrl, url)
		})
	}

	test('без path → 400 path is required', async () => {
		const reply = await call(ctx, 'GET', '/api/docs/assets/signed', { cookies: jarOf('user') })
		assert.equal(reply.status, 400)
		assert.equal(reply.body.error, 'path is required')
	})

	test('без cookie сессии ответ 401', async () => {
		const reply = await call(ctx, 'GET', signedPath('images/a.webp'))
		assert.equal(reply.status, 401)
	})
})

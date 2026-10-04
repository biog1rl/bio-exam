import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
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
import { readZipEntries } from '../../test-support/zip.js'

type Json = Record<string, unknown>

type QuestionRow = { id: string; order: number; prompt_path: string | null; explanation_path: string | null }

type ReadQuestion = { id: string; promptText: string }

type Download = { status: number; headers: Headers; entries: Map<string, Buffer> }

const PASSWORD = 'reloc-password-1'
const KEEP_IMAGE = 'images/keep.webp'
const ROLLBACK_ERROR = 'Не удалось перенести файлы, переименование отменено'

const KNOWN_DEFECTS = new Set<string>([])

function defectTest(id: string, title: string, fn: () => Promise<void>, timeout?: number): void {
	const run = KNOWN_DEFECTS.has(id) ? test.fails : test
	run(`${id}: ${title}`, fn, timeout)
}

const OPTIONS = [
	{ id: 'a', text: 'Митоз' },
	{ id: 'b', text: 'Мейоз' },
	{ id: 'c', text: 'Амитоз' },
]

let ctx: AuthApp
let mem: MemoryStorageAdapter
let adminJar: CookieJar

function radio(promptText: string, overrides: Json = {}): Json {
	return { type: 'radio', promptText, options: OPTIONS, correct: 'b', points: 1, ...overrides }
}

function escape(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function promptName(base: string, questionId: string): RegExp {
	return new RegExp(`^${escape(base)}questions/${questionId}/prompt(-[0-9a-f]+)?\\.md$`)
}

function zipPromptName(base: string, questionId: string): string {
	return `${base}questions/${questionId}/prompt.md`
}

function testPrefix(topicSlug: string, testSlug: string): string {
	return `topics/${topicSlug}/${testSlug}`
}

function questionDir(topicSlug: string, testSlug: string, questionId: string): string {
	return `${testPrefix(topicSlug, testSlug)}/questions/${questionId}`
}

async function createTopic(slug: string): Promise<string> {
	const reply = await call(ctx, 'POST', '/api/tests/topics', {
		cookies: adminJar,
		body: { slug, title: `Тема ${slug}` },
	})
	assert.equal(reply.status, 201)
	const created = reply.body.topic as Json | undefined
	assert.ok(created && typeof created.id === 'string')
	return created.id
}

async function saveTest(topicId: string, slug: string, questions: Json[]): Promise<string> {
	const reply = await call(ctx, 'POST', '/api/tests/save', {
		cookies: adminJar,
		body: { topicId, title: `Тест ${slug}`, slug, isPublished: true, questions },
	})
	assert.equal(reply.status, 201)
	const created = reply.body.test as Json | undefined
	assert.ok(created && typeof created.id === 'string')
	return created.id
}

async function questionRows(testId: string): Promise<QuestionRow[]> {
	const { rows } = await ctx.pgPool.query<QuestionRow>(
		'SELECT id, "order", prompt_path, explanation_path FROM questions WHERE test_id = $1 ORDER BY "order"',
		[testId]
	)
	return rows
}

async function testSlugInDb(testId: string): Promise<string | null> {
	const { rows } = await ctx.pgPool.query<{ slug: string }>('SELECT slug FROM tests WHERE id = $1', [testId])
	return rows[0]?.slug ?? null
}

async function rowCount(sqlText: string, params: unknown[]): Promise<number> {
	const { rows } = await ctx.pgPool.query<{ count: string }>(sqlText, params)
	return Number(rows[0]?.count ?? 0)
}

function stored(key: string | null): string | null {
	assert.ok(key)
	const object = mem.get(key)
	return object ? object.data.toString('utf8') : null
}

async function textsBySlug(topicSlug: string, testSlug: string): Promise<string[]> {
	const reply = await call(ctx, 'GET', `/api/tests/by-slug/${topicSlug}/${testSlug}`, { cookies: adminJar })
	assert.equal(reply.status, 200)
	return (reply.body.questions as ReadQuestion[]).map((q) => q.promptText)
}

function settingsBody(topicId: string, slug: string, testSlug: string): Json {
	return { topicId, title: `Тест ${testSlug}`, slug, isPublished: true }
}

async function download(path: string): Promise<Download> {
	const response = await fetch(`${ctx.baseUrl}${path}`, {
		headers: { cookie: cookieHeader(adminJar), 'x-forwarded-for': nextIp() },
	})
	const buffer = Buffer.from(await response.arrayBuffer())
	return {
		status: response.status,
		headers: response.headers,
		entries: response.status === 200 ? readZipEntries(buffer) : new Map(),
	}
}

beforeAll(async () => {
	ctx = await startAuthApp('test_qcon_relocation')
	await seedUser(ctx, { login: 'reloc_admin', roles: ['admin'], password: PASSWORD })
	const admin = await login(ctx, 'reloc_admin', PASSWORD)
	assert.equal(admin.status, 200)
	adminJar = admin.jar
	mem = await memoryStorage()
}, 60_000)

afterEach(() => {
	mem?.clearFailures()
})

afterAll(async () => {
	await ctx?.stop()
})

describe('переименование теста и смена темы', () => {
	test('PATCH /:id/settings со сменой slug переносит указатели и объекты, чтение по новому slug отдаёт прежние тексты', async () => {
		const topicSlug = 'reloc-rename'
		const topicId = await createTopic(topicSlug)
		const texts = ['Первый до переименования', 'Второй до переименования']
		const testId = await saveTest(
			topicId,
			'reloc-old',
			texts.map((text, order) => radio(text, { order }))
		)
		const before = await questionRows(testId)
		const reply = await call(ctx, 'PATCH', `/api/tests/${testId}/settings`, {
			cookies: adminJar,
			body: settingsBody(topicId, 'reloc-new', 'reloc-old'),
		})
		assert.equal(reply.status, 200)
		assert.equal(reply.body.assetsMoved, true)
		const after = await questionRows(testId)
		const base = `${testPrefix(topicSlug, 'reloc-new')}/`
		for (const row of after) {
			assert.match(row.prompt_path ?? '', promptName(base, row.id))
		}
		assert.deepEqual(
			after.map((row) => stored(row.prompt_path)),
			texts
		)
		for (const row of before) assert.equal(stored(row.prompt_path), null)
		assert.deepEqual(mem.keys(testPrefix(topicSlug, 'reloc-old')), [])
		assert.deepEqual(await textsBySlug(topicSlug, 'reloc-new'), texts)
	})

	test('PATCH /:id/settings со сменой topicId переносит указатели и объекты в другую тему', async () => {
		const fromSlug = 'reloc-from'
		const toSlug = 'reloc-to'
		const fromId = await createTopic(fromSlug)
		const toId = await createTopic(toSlug)
		const texts = ['Вопрос переезжает в другую тему']
		const testId = await saveTest(
			fromId,
			'reloc-moving',
			texts.map((text, order) => radio(text, { order }))
		)
		const before = await questionRows(testId)
		const reply = await call(ctx, 'PATCH', `/api/tests/${testId}/settings`, {
			cookies: adminJar,
			body: settingsBody(toId, 'reloc-moving', 'reloc-moving'),
		})
		assert.equal(reply.status, 200)
		assert.equal(reply.body.assetsMoved, true)
		const after = await questionRows(testId)
		const base = `${testPrefix(toSlug, 'reloc-moving')}/`
		for (const row of after) assert.match(row.prompt_path ?? '', promptName(base, row.id))
		assert.deepEqual(
			after.map((row) => stored(row.prompt_path)),
			texts
		)
		for (const row of before) assert.equal(stored(row.prompt_path), null)
		assert.deepEqual(mem.keys(testPrefix(fromSlug, 'reloc-moving')), [])
		assert.deepEqual(await textsBySlug(toSlug, 'reloc-moving'), texts)
	})
})

describe('перенос вопроса', () => {
	test('POST /:id/questions/:questionId/move в существующий тест', async () => {
		const sourceSlug = 'reloc-move-src'
		const targetSlug = 'reloc-move-dst'
		const sourceTopicId = await createTopic(sourceSlug)
		const targetTopicId = await createTopic(targetSlug)
		const sourceId = await saveTest(sourceTopicId, 'reloc-source', [
			radio('Остаётся первым', { order: 0 }),
			radio('Уезжает', { order: 1 }),
			radio('Остаётся последним', { order: 2 }),
		])
		const targetId = await saveTest(targetTopicId, 'reloc-target', [radio('Уже в цели', { order: 0 })])
		const moving = (await questionRows(sourceId))[1]
		assert.ok(moving?.prompt_path)
		const oldPrompt = moving.prompt_path
		const reply = await call(ctx, 'POST', `/api/tests/${sourceId}/questions/${moving.id}/move`, {
			cookies: adminJar,
			body: { targetTestId: targetId },
		})
		assert.equal(reply.status, 200)
		assert.deepEqual(reply.body, {
			ok: true,
			questionId: moving.id,
			target: { topicId: targetTopicId, topicSlug: targetSlug, testId: targetId, testSlug: 'reloc-target' },
		})
		const source = await questionRows(sourceId)
		assert.deepEqual(
			source.map((row) => row.order),
			[0, 1]
		)
		assert.deepEqual(
			source.map((row) => stored(row.prompt_path)),
			['Остаётся первым', 'Остаётся последним']
		)
		const target = await questionRows(targetId)
		const moved = target.find((row) => row.id === moving.id)
		assert.ok(moved)
		assert.match(moved.prompt_path ?? '', promptName(`${testPrefix(targetSlug, 'reloc-target')}/`, moving.id))
		assert.equal(stored(moved.prompt_path), 'Уезжает')
		assert.equal(stored(oldPrompt), null)
		assert.deepEqual(mem.keys(questionDir(sourceSlug, 'reloc-source', moving.id)), [])
		const { rows } = await ctx.pgPool.query<{ test_id: string }>(
			'SELECT test_id FROM question_search_documents WHERE question_id = $1',
			[moving.id]
		)
		assert.deepEqual(
			rows.map((row) => row.test_id),
			[targetId]
		)
	})

	test('перенос в тему без теста с таким slug создаёт неопубликованный тест с тем же slug', async () => {
		const sourceSlug = 'reloc-auto-src'
		const targetSlug = 'reloc-auto-dst'
		const sourceTopicId = await createTopic(sourceSlug)
		const targetTopicId = await createTopic(targetSlug)
		const sourceId = await saveTest(sourceTopicId, 'reloc-auto', [radio('Переедет в новую тему', { order: 0 })])
		const [moving] = await questionRows(sourceId)
		assert.ok(moving)
		const reply = await call(ctx, 'POST', `/api/tests/${sourceId}/questions/${moving.id}/move`, {
			cookies: adminJar,
			body: { targetTopicId },
		})
		assert.equal(reply.status, 200)
		const target = reply.body.target as Json
		assert.equal(target.topicId, targetTopicId)
		assert.equal(target.testSlug, 'reloc-auto')
		const { rows } = await ctx.pgPool.query<{ id: string; slug: string; is_published: boolean }>(
			'SELECT id, slug, is_published FROM tests WHERE topic_id = $1',
			[targetTopicId]
		)
		assert.equal(rows.length, 1)
		assert.equal(rows[0]?.slug, 'reloc-auto')
		assert.equal(rows[0]?.is_published, false)
		assert.equal(rows[0]?.id, target.testId)
		const moved = await questionRows(String(target.testId))
		assert.deepEqual(
			moved.map((row) => row.id),
			[moving.id]
		)
		assert.equal(stored(moved[0]?.prompt_path ?? null), 'Переедет в новую тему')
		assert.deepEqual(await questionRows(sourceId), [])
	})
})

describe('удаление вопроса, теста и темы', () => {
	test('DELETE /:id/questions/:questionId удаляет объекты вопроса, порядок без дыр, общая картинка на месте', async () => {
		const topicSlug = 'reloc-del-question'
		const topicId = await createTopic(topicSlug)
		mem.put(KEEP_IMAGE, Buffer.from('keep'), 'image/webp')
		const testId = await saveTest(topicId, 'reloc-del-q', [
			radio('Первый', { order: 0 }),
			radio('Удаляемый', { order: 1, explanationText: 'Пояснение удаляемого' }),
			radio('Третий', { order: 2 }),
		])
		const removed = (await questionRows(testId))[1]
		assert.ok(removed)
		assert.ok(mem.keys(questionDir(topicSlug, 'reloc-del-q', removed.id)).length > 0)
		const reply = await call(ctx, 'DELETE', `/api/tests/${testId}/questions/${removed.id}`, { cookies: adminJar })
		assert.equal(reply.status, 200)
		assert.deepEqual(reply.body, { ok: true, questionId: removed.id, assetsDeleted: true })
		const rest = await questionRows(testId)
		assert.deepEqual(
			rest.map((row) => row.order),
			[0, 1]
		)
		assert.deepEqual(
			rest.map((row) => stored(row.prompt_path)),
			['Первый', 'Третий']
		)
		assert.deepEqual(mem.keys(questionDir(topicSlug, 'reloc-del-q', removed.id)), [])
		assert.ok(mem.get(KEEP_IMAGE))
	})

	test('DELETE /:id удаляет объекты и строки теста, общая картинка на месте', async () => {
		const topicSlug = 'reloc-del-test'
		const topicId = await createTopic(topicSlug)
		mem.put(KEEP_IMAGE, Buffer.from('keep'), 'image/webp')
		const testId = await saveTest(topicId, 'reloc-del-t', [radio('Один', { order: 0 }), radio('Два', { order: 1 })])
		assert.ok(mem.keys(testPrefix(topicSlug, 'reloc-del-t')).length > 0)
		const reply = await call(ctx, 'DELETE', `/api/tests/${testId}`, { cookies: adminJar })
		assert.equal(reply.status, 200)
		assert.deepEqual(mem.keys(testPrefix(topicSlug, 'reloc-del-t')), [])
		assert.equal(await rowCount('SELECT count(*) AS count FROM tests WHERE id = $1', [testId]), 0)
		assert.equal(await rowCount('SELECT count(*) AS count FROM questions WHERE test_id = $1', [testId]), 0)
		assert.ok(mem.get(KEEP_IMAGE))
	})

	test('DELETE /topics/:id удаляет объекты под topics/<slug>/', async () => {
		const topicSlug = 'reloc-del-topic'
		const topicId = await createTopic(topicSlug)
		await saveTest(topicId, 'reloc-del-a', [radio('Тема A', { order: 0 })])
		await saveTest(topicId, 'reloc-del-b', [radio('Тема B', { order: 0 })])
		assert.ok(mem.keys(`topics/${topicSlug}`).length > 0)
		const reply = await call(ctx, 'DELETE', `/api/tests/topics/${topicId}`, { cookies: adminJar })
		assert.equal(reply.status, 200)
		assert.deepEqual(mem.keys(`topics/${topicSlug}`), [])
		assert.equal(await rowCount('SELECT count(*) AS count FROM topics WHERE id = $1', [topicId]), 0)
		assert.equal(await rowCount('SELECT count(*) AS count FROM tests WHERE topic_id = $1', [topicId]), 0)
	})
})

describe('экспорт теста и темы', () => {
	test('GET /:id/export отдаёт ZIP с промптами вопросов без answer_keys.json', async () => {
		const topicSlug = 'reloc-export'
		const topicId = await createTopic(topicSlug)
		const testId = await saveTest(topicId, 'reloc-exp', [
			radio('Экспорт 1', { order: 0 }),
			radio('Экспорт 2', { order: 1 }),
		])
		const rows = await questionRows(testId)
		const reply = await download(`/api/tests/${testId}/export`)
		assert.equal(reply.status, 200)
		assert.equal(reply.headers.get('content-type'), 'application/zip')
		assert.equal(reply.headers.get('content-disposition'), `attachment; filename="${topicSlug}-reloc-exp.zip"`)
		for (const row of rows) {
			const entry = reply.entries.get(zipPromptName('', row.id))
			assert.ok(entry, `prompt entry for ${row.id}`)
			assert.equal(entry.toString('utf8'), stored(row.prompt_path))
		}
		assert.equal(reply.entries.has('answer_keys.json'), false)
	})

	test('GET /:id/export?withAnswers=true кладёт в ZIP answer_keys.json с ключами вопросов', async () => {
		const topicSlug = 'reloc-export-answers'
		const topicId = await createTopic(topicSlug)
		const testId = await saveTest(topicId, 'reloc-exp-ans', [
			radio('С ответом b', { order: 0 }),
			radio('С ответом c', { order: 1, correct: 'c' }),
		])
		const rows = await questionRows(testId)
		const reply = await download(`/api/tests/${testId}/export?withAnswers=true`)
		assert.equal(reply.status, 200)
		const keys = reply.entries.get('answer_keys.json')
		assert.ok(keys)
		const parsed = JSON.parse(keys.toString('utf8')) as Array<{ questionId: string; correct: unknown }>
		assert.ok(Array.isArray(parsed))
		const byId = (a: { questionId: string }, b: { questionId: string }) => a.questionId.localeCompare(b.questionId)
		assert.deepEqual(
			[...parsed].sort(byId),
			[
				{ questionId: rows[0]?.id ?? '', correct: 'b' },
				{ questionId: rows[1]?.id ?? '', correct: 'c' },
			].sort(byId)
		)
	})

	test('GET /topics/:slug/export кладёт промпты каждого теста темы под <testSlug>/', async () => {
		const topicSlug = 'reloc-export-topic'
		const topicId = await createTopic(topicSlug)
		const firstId = await saveTest(topicId, 'reloc-topic-a', [radio('Тема, тест A', { order: 0 })])
		const secondId = await saveTest(topicId, 'reloc-topic-b', [
			radio('Тема, тест B1', { order: 0 }),
			radio('Тема, тест B2', { order: 1 }),
		])
		const reply = await download(`/api/tests/topics/${topicSlug}/export`)
		assert.equal(reply.status, 200)
		assert.equal(reply.headers.get('content-type'), 'application/zip')
		const names = [...reply.entries.keys()]
		for (const [testId, testSlug] of [
			[firstId, 'reloc-topic-a'],
			[secondId, 'reloc-topic-b'],
		] as const) {
			for (const row of await questionRows(testId)) {
				assert.ok(names.includes(zipPromptName(`${testSlug}/`, row.id)), `prompt entry for ${testSlug}/${row.id}`)
			}
		}
	})
})

describe('известные дефекты переноса и экспорта', () => {
	defectTest('STOR-rename-topic-files', 'смена slug темы переносит файлы и указатели', async () => {
		const topicId = await createTopic('reloc-topic-old')
		const texts = ['Промпт темы 1', 'Промпт темы 2']
		const testId = await saveTest(
			topicId,
			'reloc-topic-test',
			texts.map((text, order) => radio(text, { order }))
		)
		const before = await questionRows(testId)
		const reply = await call(ctx, 'PATCH', `/api/tests/topics/${topicId}`, {
			cookies: adminJar,
			body: { slug: 'reloc-topic-new' },
		})
		assert.equal(reply.status, 200)
		const after = await questionRows(testId)
		for (const row of after)
			assert.ok((row.prompt_path ?? '').startsWith('topics/reloc-topic-new/'), row.prompt_path ?? '')
		assert.deepEqual(
			after.map((row) => stored(row.prompt_path)),
			texts
		)
		for (const row of before) assert.equal(stored(row.prompt_path), null)
		assert.deepEqual(await textsBySlug('reloc-topic-new', 'reloc-topic-test'), texts)
	})

	defectTest(
		'STOR-rename-test-rollback',
		'сбой переноса при переименовании теста отменяет переименование',
		async () => {
			const topicSlug = 'reloc-rollback'
			const topicId = await createTopic(topicSlug)
			const testId = await saveTest(topicId, 'reloc-rb-old', [radio('Не должен потеряться', { order: 0 })])
			const before = await questionRows(testId)
			mem.failOn({ op: 'copy', prefix: testPrefix(topicSlug, 'reloc-rb-old') })
			const reply = await call(ctx, 'PATCH', `/api/tests/${testId}/settings`, {
				cookies: adminJar,
				body: settingsBody(topicId, 'reloc-rb-new', 'reloc-rb-old'),
			})
			mem.clearFailures()
			assert.equal(reply.status, 503)
			assert.equal(reply.body.error, ROLLBACK_ERROR)
			assert.equal(await testSlugInDb(testId), 'reloc-rb-old')
			const after = await questionRows(testId)
			assert.deepEqual(
				after.map((row) => row.prompt_path),
				before.map((row) => row.prompt_path)
			)
			for (const row of before) assert.equal(stored(row.prompt_path), 'Не должен потеряться')
			assert.deepEqual(mem.keys(testPrefix(topicSlug, 'reloc-rb-new')), [])
		}
	)

	defectTest('STOR-zip-no-images', 'ZIP теста содержит картинки, на которые ссылается вопрос', async () => {
		const topicId = await createTopic('reloc-zip-images')
		const image = `images/${randomBytes(16).toString('hex')}.webp`
		const bytes = randomBytes(64)
		mem.put(image, bytes, 'image/webp')
		const testId = await saveTest(topicId, 'reloc-zip-img', [
			radio(`Рассмотрите рисунок\n\n![схема](${image})`, { order: 0 }),
		])
		const reply = await download(`/api/tests/${testId}/export`)
		assert.equal(reply.status, 200)
		const entry = reply.entries.get(image)
		assert.ok(entry, `entry ${image}`)
		assert.ok(entry.equals(bytes))
	})

	defectTest('STOR-export-writes-answer-keys', 'экспорт с ответами не пишет answer_keys.json в хранилище', async () => {
		const topicSlug = 'reloc-zip-answers'
		const topicId = await createTopic(topicSlug)
		const testId = await saveTest(topicId, 'reloc-zip-ans', [radio('Ключ не должен остаться', { order: 0 })])
		const reply = await download(`/api/tests/${testId}/export?withAnswers=true`)
		assert.equal(reply.status, 200)
		assert.ok(reply.entries.has('answer_keys.json'))
		assert.equal(mem.get(`${testPrefix(topicSlug, 'reloc-zip-ans')}/answer_keys.json`), null)
	})
})

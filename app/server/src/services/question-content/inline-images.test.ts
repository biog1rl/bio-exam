import assert from 'node:assert/strict'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, test } from 'vitest'

import { call, login, seedUser, startAuthApp, type AuthApp, type CookieJar } from '../../test-support/auth-app.js'
import { memoryStorage } from '../../test-support/storage.js'
import type { MemoryStorageAdapter } from '../storage/adapters/memory.js'

type QuestionContentModule = typeof import('./index.js')

type Json = Record<string, unknown>

type PointerRow = { prompt_path: string | null; explanation_path: string | null }

const PASSWORD = 'qcon-inline-password-1'
const TOPIC_SLUG = 'qcon-inline-topic'
const LIBRARY_KEY = /images\/[0-9a-f]{32}\.webp/g
const BROKEN_URI = 'data:image/png;base64,AAAAAAAA'

const OPTIONS = [
	{ id: 'a', text: 'Хлоропласт' },
	{ id: 'b', text: 'Митохондрия' },
]

let ctx: AuthApp
let mem: MemoryStorageAdapter
let qc: QuestionContentModule
let adminJar: CookieJar
let topicId = ''
let slugCounter = 0
let greenUri = ''
let redUri = ''

async function pngUri(background: string): Promise<string> {
	const png = await sharp({ create: { width: 6, height: 4, channels: 3, background } })
		.png()
		.toBuffer()
	return `data:image/png;base64,${png.toString('base64')}`
}

function radio(promptText: string, overrides: Json = {}): Json {
	return { type: 'radio', promptText, options: OPTIONS, correct: 'b', points: 1, ...overrides }
}

async function saveTest(questions: Json[]): Promise<string> {
	slugCounter += 1
	const slug = `qcon-inline-${slugCounter}`
	const reply = await call(ctx, 'POST', '/api/tests/save', {
		cookies: adminJar,
		body: {
			topicId,
			title: `Тест ${slug}`,
			slug,
			isPublished: true,
			questions: questions.map((question, order) => ({ order, ...question })),
		},
	})
	assert.equal(reply.status, 201, JSON.stringify(reply.body))
	return (reply.body.test as Json).id as string
}

async function firstQuestionId(testId: string): Promise<string> {
	const { rows } = await ctx.pgPool.query<{ id: string }>(
		'SELECT id FROM questions WHERE test_id = $1 ORDER BY "order", created_at, id LIMIT 1',
		[testId]
	)
	assert.ok(rows[0])
	return rows[0].id
}

async function pointers(questionId: string): Promise<PointerRow> {
	const { rows } = await ctx.pgPool.query<PointerRow>(
		'SELECT prompt_path, explanation_path FROM questions WHERE id = $1',
		[questionId]
	)
	assert.ok(rows[0])
	return rows[0]
}

async function assetRefs(questionId: string): Promise<string[]> {
	const { rows } = await ctx.pgPool.query<{ asset_key: string }>(
		'SELECT asset_key FROM question_asset_refs WHERE question_id = $1 ORDER BY asset_key',
		[questionId]
	)
	return rows.map((row) => row.asset_key)
}

async function searchPrompt(questionId: string): Promise<string> {
	const { rows } = await ctx.pgPool.query<{ prompt_text: string }>(
		'SELECT prompt_text FROM question_search_documents WHERE question_id = $1',
		[questionId]
	)
	return rows[0]?.prompt_text ?? ''
}

function stored(key: string | null): string {
	assert.ok(key)
	const object = mem.get(key)
	assert.ok(object, `нет объекта ${key}`)
	return object.data.toString('utf8')
}

function libraryKeys(text: string): string[] {
	return [...new Set(text.match(LIBRARY_KEY) ?? [])].sort()
}

function assertWebp(key: string): void {
	const object = mem.get(key)
	assert.ok(object, `нет картинки ${key}`)
	assert.equal(object.contentType, 'image/webp')
	assert.equal(object.data.subarray(8, 12).toString('ascii'), 'WEBP')
}

beforeAll(async () => {
	ctx = await startAuthApp('test_qcon_inline')
	await seedUser(ctx, { login: 'qcon_inline_admin', roles: ['admin'], password: PASSWORD })
	const admin = await login(ctx, 'qcon_inline_admin', PASSWORD)
	assert.equal(admin.status, 200)
	adminJar = admin.jar
	mem = await memoryStorage()
	qc = await import('./index.js')
	const topic = await call(ctx, 'POST', '/api/tests/topics', {
		cookies: adminJar,
		body: { slug: TOPIC_SLUG, title: 'Тема встроенных картинок' },
	})
	assert.equal(topic.status, 201)
	topicId = (topic.body.topic as Json).id as string
	greenUri = await pngUri('#2a7a2a')
	redUri = await pngUri('#a02020')
}, 60_000)

afterAll(async () => {
	await ctx?.stop()
})

describe('base64-картинки при сохранении вопроса', () => {
	test('PATCH переносит картинки в images/, одинаковые дают один файл, ссылки индексируются', async () => {
		const testId = await saveTest([radio('Исходный вопрос')])
		const questionId = await firstQuestionId(testId)
		const reply = await call(ctx, 'PATCH', `/api/tests/${testId}/questions/${questionId}`, {
			cookies: adminJar,
			body: radio(`Что на рисунке? ![первый](${greenUri}) и снова ![второй](${greenUri})`, {
				explanationText: `Пояснение <img src="${redUri}" width="40" />`,
			}),
		})
		assert.equal(reply.status, 200, JSON.stringify(reply.body))

		const row = await pointers(questionId)
		const prompt = stored(row.prompt_path)
		const explanation = stored(row.explanation_path)
		assert.ok(!prompt.includes('data:image'))
		assert.ok(!explanation.includes('data:image'))
		const promptKeys = libraryKeys(prompt)
		const explanationKeys = libraryKeys(explanation)
		assert.equal(promptKeys.length, 1)
		assert.equal(explanationKeys.length, 1)
		assert.notEqual(promptKeys[0], explanationKeys[0])
		assert.equal(prompt.match(LIBRARY_KEY)?.length, 2)
		for (const key of [...promptKeys, ...explanationKeys]) assertWebp(key)
		assert.deepEqual(await assetRefs(questionId), [...promptKeys, ...explanationKeys].sort())
		assert.ok(!(await searchPrompt(questionId)).includes('base64'))
	})

	test('сохранение теста целиком переносит картинки, битая base64 остаётся как есть', async () => {
		const testId = await saveTest([radio(`Новый ![схема](${greenUri}) и ![битая](${BROKEN_URI})`)])
		const questionId = await firstQuestionId(testId)
		const prompt = stored((await pointers(questionId)).prompt_path)
		assert.ok(prompt.includes(BROKEN_URI))
		assert.equal(libraryKeys(prompt).length, 1)
		assert.ok(!prompt.includes(greenUri))
	})
})

describe('moveInlineImages для уже сохранённых вопросов', () => {
	test('без --apply только считает, с --apply переписывает указатель и оставляет старый файл', async () => {
		const testId = await saveTest([radio('Старый вопрос без картинок')])
		const questionId = await firstQuestionId(testId)
		const before = await pointers(questionId)
		assert.ok(before.prompt_path)
		const baseline = await qc.moveInlineImages({ apply: false })
		const legacy = `Старый вопрос ![рис](${redUri}) ![рис](${redUri})`
		mem.put(before.prompt_path, legacy, 'text/markdown')

		const dry = await qc.moveInlineImages({ apply: false })
		assert.equal(dry.withImages, baseline.withImages + 1)
		assert.equal(dry.inlineImages, baseline.inlineImages + 2)
		assert.equal(dry.updated, 0)
		assert.deepEqual(await pointers(questionId), before)
		assert.equal(stored(before.prompt_path), legacy)

		const applied = await qc.moveInlineImages({ apply: true })
		assert.equal(applied.withImages, dry.withImages)
		assert.equal(applied.updated, 1)
		assert.equal(applied.storedImages, 1)
		assert.equal(applied.failedImages, baseline.inlineImages)
		assert.deepEqual(applied.failedQuestions, [])
		const after = await pointers(questionId)
		assert.notEqual(after.prompt_path, before.prompt_path)
		const rewritten = stored(after.prompt_path)
		assert.ok(!rewritten.includes('data:image'))
		const keys = libraryKeys(rewritten)
		assert.equal(keys.length, 1)
		assertWebp(keys[0] as string)
		assert.equal(stored(before.prompt_path), legacy)
		assert.deepEqual(await assetRefs(questionId), keys)

		const again = await qc.moveInlineImages({ apply: true })
		assert.equal(again.withImages, baseline.withImages)
		assert.equal(again.updated, 0)
	})

	test('вопрос, изменённый между чтением и записью, не перезаписывается', async () => {
		const testId = await saveTest([radio('Вопрос для гонки')])
		const questionId = await firstQuestionId(testId)
		const before = await pointers(questionId)
		await assert.rejects(
			qc.rewriteQuestionTexts({
				questionId,
				expected: { promptPath: 'topics/other/path/prompt.md', explanationPath: before.explanation_path },
				promptText: 'Подменённый текст',
				explanationText: null,
			}),
			(error: unknown) => error instanceof Error && error.message === qc.CONTENT_CHANGED_MESSAGE
		)
		assert.deepEqual(await pointers(questionId), before)
	})
})

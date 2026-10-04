import { eq } from 'drizzle-orm'
import assert from 'node:assert/strict'
import { afterAll, afterEach, beforeAll, describe, test } from 'vitest'

import type { MemoryStorageAdapter } from '../../services/storage/adapters/memory.js'
import { call, login, seedUser, startAuthApp, type AuthApp, type CookieJar } from '../../test-support/auth-app.js'
import { memoryStorage } from '../../test-support/storage.js'

type Json = Record<string, unknown>

type QuestionRow = { id: string; order: number; prompt_path: string | null; explanation_path: string | null }

type KeyRow = { version: number; is_active: boolean; key: string }

type ReadQuestion = {
	id: string
	order: number
	promptText: string
	explanationText: string
	correct: unknown
}

const PASSWORD = 'qcon-password-1'
const TOPIC_SLUG = 'qcon-topic'

const KNOWN_DEFECTS = new Set<string>(['STOR-D6a', 'STOR-D6b', 'STOR-save-order-holes'])

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
let studentJar: CookieJar
let topicId = ''

function radio(promptText: string, overrides: Json = {}): Json {
	return { type: 'radio', promptText, options: OPTIONS, correct: 'b', points: 1, ...overrides }
}

function promptPattern(testSlug: string, questionId: string, name: 'prompt' | 'explanation'): RegExp {
	return new RegExp(`^topics/${TOPIC_SLUG}/${testSlug}/questions/${questionId}/${name}(-[0-9a-f]+)?\\.md$`)
}

function questionDir(testSlug: string, questionId: string): string {
	return `topics/${TOPIC_SLUG}/${testSlug}/questions/${questionId}`
}

async function saveTest(slug: string, questions: Json[]): Promise<string> {
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

async function keyRows(questionId: string): Promise<KeyRow[]> {
	const { rows } = await ctx.pgPool.query<KeyRow>(
		"SELECT version, is_active, correct_answer #>> '{}' AS key FROM answer_keys WHERE question_id = $1 ORDER BY version",
		[questionId]
	)
	return rows
}

function stored(key: string | null): string | null {
	assert.ok(key)
	const object = mem.get(key)
	return object ? object.data.toString('utf8') : null
}

async function adminQuestions(testId: string): Promise<ReadQuestion[]> {
	const reply = await call(ctx, 'GET', `/api/tests/${testId}`, { cookies: adminJar })
	assert.equal(reply.status, 200)
	assert.ok(Array.isArray(reply.body.questions))
	return reply.body.questions as ReadQuestion[]
}

beforeAll(async () => {
	ctx = await startAuthApp('test_qcon_crud')
	await seedUser(ctx, { login: 'qcon_admin', roles: ['admin'], password: PASSWORD })
	await seedUser(ctx, { login: 'qcon_student', roles: ['user'], password: PASSWORD })
	const admin = await login(ctx, 'qcon_admin', PASSWORD)
	assert.equal(admin.status, 200)
	adminJar = admin.jar
	const student = await login(ctx, 'qcon_student', PASSWORD)
	assert.equal(student.status, 200)
	studentJar = student.jar
	mem = await memoryStorage()
	const topic = await call(ctx, 'POST', '/api/tests/topics', {
		cookies: adminJar,
		body: { slug: TOPIC_SLUG, title: 'Тема содержимого вопросов' },
	})
	assert.equal(topic.status, 201)
	const created = topic.body.topic as Json | undefined
	assert.ok(created && typeof created.id === 'string')
	topicId = created.id
}, 60_000)

afterEach(() => {
	mem?.clearFailures()
})

afterAll(async () => {
	await ctx?.stop()
})

describe('POST /api/tests/save → хранилище → чтение', () => {
	const testSlug = 'qcon-main'
	const sent = [
		radio('Как делится соматическая клетка?', { order: 0 }),
		radio('Какое деление даёт гаметы?', { order: 1, correct: 'c', explanationText: 'Гаметы образуются мейозом' }),
	]
	let testId = ''

	test('создание: два вопроса, указатели на канонические ключи, тексты в хранилище, поисковые документы', async () => {
		testId = await saveTest(testSlug, sent)
		const rows = await questionRows(testId)
		assert.equal(rows.length, 2)
		const [first, second] = rows
		assert.ok(first && second)
		assert.match(first.prompt_path ?? '', promptPattern(testSlug, first.id, 'prompt'))
		assert.match(second.prompt_path ?? '', promptPattern(testSlug, second.id, 'prompt'))
		assert.equal(stored(first.prompt_path), sent[0]?.promptText)
		assert.equal(stored(second.prompt_path), sent[1]?.promptText)
		assert.equal(first.explanation_path, null)
		assert.match(second.explanation_path ?? '', promptPattern(testSlug, second.id, 'explanation'))
		assert.equal(stored(second.explanation_path), sent[1]?.explanationText)
		const { rows: docs } = await ctx.pgPool.query<{ count: string }>(
			'SELECT count(*) AS count FROM question_search_documents WHERE test_id = $1',
			[testId]
		)
		assert.equal(Number(docs[0]?.count), 2)
	})

	test('чтение администратора: by-slug и /:id отдают одинаковый массив questions с отправленными полями', async () => {
		const bySlug = await call(ctx, 'GET', `/api/tests/by-slug/${TOPIC_SLUG}/${testSlug}`, { cookies: adminJar })
		const byId = await call(ctx, 'GET', `/api/tests/${testId}`, { cookies: adminJar })
		assert.equal(bySlug.status, 200)
		assert.equal(byId.status, 200)
		assert.deepEqual(bySlug.body.questions, byId.body.questions)
		const questions = byId.body.questions as ReadQuestion[]
		assert.deepEqual(
			questions.map((q) => ({
				promptText: q.promptText,
				explanationText: q.explanationText,
				correct: q.correct,
				order: q.order,
			})),
			sent.map((q) => ({
				promptText: q.promptText,
				explanationText: q.explanationText ?? '',
				correct: q.correct,
				order: q.order,
			}))
		)
	})

	test('by-slug с view=summary отдаёт число вопросов', async () => {
		const reply = await call(ctx, 'GET', `/api/tests/by-slug/${TOPIC_SLUG}/${testSlug}?view=summary`, {
			cookies: adminJar,
		})
		assert.equal(reply.status, 200)
		assert.equal(reply.body.questionsCount, 2)
	})

	test('чтение для прохождения по slug и по id отдаёт отправленные тексты', async () => {
		const bySlug = await call(ctx, 'GET', `/api/tests/public/topics/${TOPIC_SLUG}/tests/${testSlug}`, {
			cookies: adminJar,
		})
		const byId = await call(ctx, 'GET', `/api/tests/public/tests/${testId}`, { cookies: adminJar })
		for (const reply of [bySlug, byId]) {
			assert.equal(reply.status, 200)
			const questions = reply.body.questions as ReadQuestion[]
			assert.deepEqual(
				questions.map((q) => q.promptText),
				sent.map((q) => q.promptText)
			)
		}
	})
})

describe('чтение при отсутствии файла и при недоступном хранилище', () => {
	test('нет объекта промпта: администратор получает пустой promptText', async () => {
		const testSlug = 'qcon-missing'
		const testId = await saveTest(testSlug, [radio('Текст, который пропадёт', { order: 0 })])
		const [row] = await questionRows(testId)
		assert.ok(row?.prompt_path)
		await mem.remove([row.prompt_path])
		const [byId] = await adminQuestions(testId)
		assert.equal(byId?.promptText, '')
		const bySlug = await call(ctx, 'GET', `/api/tests/by-slug/${TOPIC_SLUG}/${testSlug}`, { cookies: adminJar })
		assert.equal(bySlug.status, 200)
		assert.equal((bySlug.body.questions as ReadQuestion[])[0]?.promptText, '')
	})

	test('сбой чтения хранилища: прохождение и администратор получают 503', async () => {
		const testId = await saveTest('qcon-outage', [radio('Текст при сбое', { order: 0 })])
		mem.failOn({ op: 'read', prefix: 'topics' })
		const forPublic = await call(ctx, 'GET', `/api/tests/public/tests/${testId}`, { cookies: adminJar })
		assert.equal(forPublic.status, 503)
		assert.equal(typeof forPublic.body.error, 'string')
		const forAdmin = await call(ctx, 'GET', `/api/tests/${testId}`, { cookies: adminJar })
		assert.equal(forAdmin.status, 503)
		assert.equal(typeof forAdmin.body.error, 'string')
	})
})

describe('создание с позицией, правка, порядок', () => {
	test('POST /:id/questions с order 0 вставляет вопрос первым и сдвигает остальные', async () => {
		const testId = await saveTest('qcon-insert', [radio('Первый', { order: 0 }), radio('Второй', { order: 1 })])
		const before = await questionRows(testId)
		const reply = await call(ctx, 'POST', `/api/tests/${testId}/questions`, {
			cookies: adminJar,
			body: radio('Вставленный', { order: 0 }),
		})
		assert.equal(reply.status, 201)
		assert.equal(reply.body.ok, true)
		assert.equal(reply.body.order, 0)
		assert.equal(typeof reply.body.questionId, 'string')
		const after = await questionRows(testId)
		assert.deepEqual(
			after.map((row) => row.order),
			[0, 1, 2]
		)
		assert.deepEqual(
			after.map((row) => row.id),
			[reply.body.questionId, ...before.map((row) => row.id)]
		)
	})

	test('PATCH /:id/questions/:questionId меняет текст и создаёт версию 2 ключа ответа', async () => {
		const testId = await saveTest('qcon-patch', [radio('Старая формулировка', { order: 0 })])
		const [row] = await questionRows(testId)
		assert.ok(row)
		const reply = await call(ctx, 'PATCH', `/api/tests/${testId}/questions/${row.id}`, {
			cookies: adminJar,
			body: radio('Новая формулировка', { order: 0, correct: 'c' }),
		})
		assert.equal(reply.status, 200)
		assert.deepEqual(reply.body, { ok: true, questionId: row.id })
		const [read] = await adminQuestions(testId)
		assert.equal(read?.promptText, 'Новая формулировка')
		assert.equal(read?.correct, 'c')
		assert.deepEqual(await keyRows(row.id), [
			{ version: 1, is_active: false, key: 'b' },
			{ version: 2, is_active: true, key: 'c' },
		])
	})

	test('PUT /:id/questions/reorder задаёт порядок по переданному массиву', async () => {
		const testId = await saveTest('qcon-reorder', [
			radio('Альфа', { order: 0 }),
			radio('Бета', { order: 1 }),
			radio('Гамма', { order: 2 }),
		])
		const reversed = (await questionRows(testId)).map((row) => row.id).reverse()
		const reply = await call(ctx, 'PUT', `/api/tests/${testId}/questions/reorder`, {
			cookies: adminJar,
			body: { questionIds: reversed },
		})
		assert.equal(reply.status, 200)
		const after = await questionRows(testId)
		assert.deepEqual(
			after.map((row) => row.id),
			reversed
		)
		assert.deepEqual(
			after.map((row) => row.order),
			[0, 1, 2]
		)
	})

	test('студент без права записи получает 403 на создание вопроса', async () => {
		const testId = await saveTest('qcon-student', [radio('Только для чтения', { order: 0 })])
		const reply = await call(ctx, 'POST', `/api/tests/${testId}/questions`, {
			cookies: studentJar,
			body: radio('Попытка студента', { order: 0 }),
		})
		assert.equal(reply.status, 403)
		assert.equal(typeof reply.body.error, 'string')
		assert.equal((await questionRows(testId)).length, 1)
	})
})

describe('известные дефекты записи вопроса', () => {
	defectTest('STOR-D6a', 'указатель вне канонического пути и сбой записи не теряют прежний промпт', async () => {
		const testSlug = 'qcon-d6a'
		const testId = await saveTest(testSlug, [radio('Прежний промпт D6a', { order: 0 })])
		const [row] = await questionRows(testId)
		assert.ok(row?.prompt_path)
		const legacy = `topics/${TOPIC_SLUG}/${testId}/questions/${row.id}/prompt.md`
		mem.put(legacy, 'Прежний промпт D6a', 'text/markdown')
		await mem.remove([row.prompt_path])
		await ctx.db.update(ctx.schema.questions).set({ promptPath: legacy }).where(eq(ctx.schema.questions.id, row.id))
		assert.equal((await adminQuestions(testId))[0]?.promptText, 'Прежний промпт D6a')
		mem.failOn({ op: 'write', prefix: questionDir(testSlug, row.id) })
		const reply = await call(ctx, 'PATCH', `/api/tests/${testId}/questions/${row.id}`, {
			cookies: adminJar,
			body: radio('Новый промпт D6a', { order: 0 }),
		})
		assert.ok(reply.status >= 500, `status ${reply.status}`)
		mem.clearFailures()
		assert.equal(stored(legacy), 'Прежний промпт D6a')
		const [after] = await questionRows(testId)
		assert.equal(after?.prompt_path, legacy)
		assert.equal((await adminQuestions(testId))[0]?.promptText, 'Прежний промпт D6a')
	})

	defectTest(
		'STOR-D6b',
		'канонический указатель и сбой записи не активируют новый ключ ответа при старом промпте',
		async () => {
			const testSlug = 'qcon-d6b'
			const testId = await saveTest(testSlug, [radio('Прежний промпт D6b', { order: 0 })])
			const [row] = await questionRows(testId)
			assert.ok(row)
			mem.failOn({ op: 'write', prefix: questionDir(testSlug, row.id) })
			const reply = await call(ctx, 'PATCH', `/api/tests/${testId}/questions/${row.id}`, {
				cookies: adminJar,
				body: radio('Новый промпт D6b', { order: 0, correct: 'c' }),
			})
			assert.ok(reply.status >= 500, `status ${reply.status}`)
			mem.clearFailures()
			assert.deepEqual(await keyRows(row.id), [{ version: 1, is_active: true, key: 'b' }])
			const [read] = await adminQuestions(testId)
			assert.equal(read?.promptText, 'Прежний промпт D6b')
			assert.equal(read?.correct, 'b')
		}
	)

	defectTest('STOR-save-order-holes', '/save с порядком 0, 5, 7 сохраняет порядок 0, 1, 2', async () => {
		const testSlug = 'qcon-holes'
		const testId = await saveTest(testSlug, [
			radio('Первый с дырой', { order: 0 }),
			radio('Второй с дырой', { order: 5 }),
			radio('Третий с дырой', { order: 7 }),
		])
		const rows = await questionRows(testId)
		assert.deepEqual(
			rows.map((row) => stored(row.prompt_path)),
			['Первый с дырой', 'Второй с дырой', 'Третий с дырой']
		)
		assert.deepEqual(
			rows.map((row) => row.order),
			[0, 1, 2]
		)
	})
})

import assert from 'node:assert/strict'
import { afterAll, afterEach, beforeAll, describe, test, vi } from 'vitest'

import { call, login, seedUser, startAuthApp, type AuthApp, type CookieJar } from '../../test-support/auth-app.js'
import { memoryStorage } from '../../test-support/storage.js'
import type { MemoryStorageAdapter } from '../storage/adapters/memory.js'

type QuestionContentModule = typeof import('./index.js')

type Json = Record<string, unknown>

type QuestionRow = { id: string; order: number; prompt_path: string | null; explanation_path: string | null }

const PASSWORD = 'qcon-move-remove-password-1'
const ORPHAN_LOG = '[question-content] orphan objects'
const CONTENT_CHANGED = 'Содержимое изменилось, повторите'
const MOVE_FAILED = 'Не удалось перенести файлы, перенос отменён'
const REORDER_MISMATCH = 'Неверный набор вопросов для сортировки'
const SAME_TARGET = 'Выберите другую тему или тест для переноса вопроса'
const KEEP_IMAGE = 'images/qcon-move-remove-keep.webp'
const MISSING_ID = '00000000-0000-4000-8000-000000000000'

const OPTIONS = [
	{ id: 'a', text: 'Хлоропласт' },
	{ id: 'b', text: 'Митохондрия' },
	{ id: 'c', text: 'Рибосома' },
]

let ctx: AuthApp
let mem: MemoryStorageAdapter
let qc: QuestionContentModule
let adminJar: CookieJar
let studentJar: CookieJar
let deniedJar: CookieJar
let counter = 0

function radio(promptText: string, overrides: Json = {}): Json {
	return { type: 'radio', promptText, options: OPTIONS, correct: 'b', points: 1, ...overrides }
}

function nextSlug(name: string): string {
	counter += 1
	return `qcon-mr-${name}-${counter}`
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

async function questionRows(testId: string): Promise<QuestionRow[]> {
	const { rows } = await ctx.pgPool.query<QuestionRow>(
		'SELECT id, "order", prompt_path, explanation_path FROM questions WHERE test_id = $1 ORDER BY "order", id',
		[testId]
	)
	return rows
}

async function count(query: string, params: unknown[]): Promise<number> {
	const { rows } = await ctx.pgPool.query<{ count: string }>(query, params)
	return Number(rows[0]?.count ?? 0)
}

async function testsOfTopic(topicId: string): Promise<Array<{ id: string; slug: string; is_published: boolean }>> {
	const { rows } = await ctx.pgPool.query<{ id: string; slug: string; is_published: boolean }>(
		'SELECT id, slug, is_published FROM tests WHERE topic_id = $1 ORDER BY slug',
		[topicId]
	)
	return rows
}

function stored(key: string | null | undefined): string | null {
	assert.ok(key)
	const object = mem.get(key)
	return object ? object.data.toString('utf8') : null
}

async function deleteQuestionCall(testId: string, questionId: string, jar = adminJar) {
	return call(ctx, 'DELETE', `/api/tests/${testId}/questions/${questionId}`, { cookies: jar })
}

async function deleteTestCall(testId: string, jar = adminJar) {
	return call(ctx, 'DELETE', `/api/tests/${testId}`, { cookies: jar })
}

async function deleteTopicCall(topicId: string, jar = adminJar) {
	return call(ctx, 'DELETE', `/api/tests/topics/${topicId}`, { cookies: jar })
}

async function reorderCall(testId: string, questionIds: string[], jar = adminJar) {
	return call(ctx, 'PUT', `/api/tests/${testId}/questions/reorder`, { cookies: jar, body: { questionIds } })
}

async function moveCall(testId: string, questionId: string, body: Json, jar = adminJar) {
	return call(ctx, 'POST', `/api/tests/${testId}/questions/${questionId}/move`, { cookies: jar, body })
}

async function withTrigger(name: string, definition: string, table: string, run: () => Promise<void>) {
	await ctx.pgPool.query(
		`CREATE OR REPLACE FUNCTION ${name}_fn() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION '${name} failure'; END $$ LANGUAGE plpgsql`
	)
	await ctx.pgPool.query(`CREATE TRIGGER ${name} ${definition} EXECUTE FUNCTION ${name}_fn()`)
	try {
		await run()
	} finally {
		await ctx.pgPool.query(`DROP TRIGGER IF EXISTS ${name} ON ${table}`)
	}
}

function afterCopies(times: number, action: () => Promise<unknown>) {
	const original = mem.copy.bind(mem)
	let calls = 0
	let fired = false
	vi.spyOn(mem, 'copy').mockImplementation(async (from, to) => {
		await original(from, to)
		calls += 1
		if (!fired && calls === times) {
			fired = true
			await action()
		}
	})
	return { fired: () => fired }
}

beforeAll(async () => {
	ctx = await startAuthApp('test_qcon_move_remove')
	await seedUser(ctx, { login: 'qcon_mr_admin', roles: ['admin'], password: PASSWORD })
	await seedUser(ctx, { login: 'qcon_mr_student', roles: ['user'], password: PASSWORD })
	const deniedId = await seedUser(ctx, { login: 'qcon_mr_denied', roles: ['admin'], password: PASSWORD })
	await ctx.pgPool.query(
		"INSERT INTO rbac_user_grants (user_id, domain, action, allow) VALUES ($1, 'tests', 'write', false)",
		[deniedId]
	)
	const admin = await login(ctx, 'qcon_mr_admin', PASSWORD)
	assert.equal(admin.status, 200)
	adminJar = admin.jar
	const student = await login(ctx, 'qcon_mr_student', PASSWORD)
	assert.equal(student.status, 200)
	studentJar = student.jar
	const denied = await login(ctx, 'qcon_mr_denied', PASSWORD)
	assert.equal(denied.status, 200)
	deniedJar = denied.jar
	mem = await memoryStorage()
	qc = await import('./index.js')
}, 60_000)

afterEach(() => {
	mem?.clearFailures()
	vi.restoreAllMocks()
})

afterAll(async () => {
	await ctx?.stop()
})

describe('удаление вопроса', () => {
	test('строка удалена, порядок без дыр, объекты вопроса удалены, общая картинка на месте', async () => {
		const topicSlug = nextSlug('topic')
		const topicId = await createTopic(topicSlug)
		const slug = nextSlug('dq')
		mem.put(KEEP_IMAGE, 'keep', 'image/webp')
		const testId = await saveTest(topicId, slug, [
			radio('Первый', { order: 0 }),
			radio(`Удаляемый ![k](${KEEP_IMAGE})`, { order: 1, explanationText: 'Пояснение' }),
			radio('Третий', { order: 2 }),
			radio('Четвёртый', { order: 3 }),
		])
		const removed = (await questionRows(testId))[1]
		assert.ok(removed)
		mem.put(`${questionDir(topicSlug, slug, removed.id)}/prompt.md`, 'устаревший', 'text/markdown')
		const reply = await deleteQuestionCall(testId, removed.id)
		assert.equal(reply.status, 200, JSON.stringify(reply.body))
		assert.deepEqual(reply.body, { ok: true, questionId: removed.id, assetsDeleted: true })
		const rest = await questionRows(testId)
		assert.deepEqual(
			rest.map((row) => row.order),
			[0, 1, 2]
		)
		assert.deepEqual(
			rest.map((row) => stored(row.prompt_path)),
			['Первый', 'Третий', 'Четвёртый']
		)
		assert.deepEqual(mem.keys(questionDir(topicSlug, slug, removed.id)), [])
		assert.equal(stored(KEEP_IMAGE), 'keep')
	})

	test('сбой удаления объектов: 200 с assetsDeleted: false, строки нет, объекты на месте, лог сирот', async () => {
		const topicSlug = nextSlug('topic')
		const topicId = await createTopic(topicSlug)
		const slug = nextSlug('dq-orphan')
		const testId = await saveTest(topicId, slug, [radio('Сирота', { order: 0 }), radio('Сосед', { order: 1 })])
		const [removed] = await questionRows(testId)
		assert.ok(removed?.prompt_path)
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
		mem.failOn({ op: 'remove', prefix: questionDir(topicSlug, slug, removed.id) })
		const reply = await deleteQuestionCall(testId, removed.id)
		assert.equal(reply.status, 200, JSON.stringify(reply.body))
		assert.deepEqual(reply.body, { ok: true, questionId: removed.id, assetsDeleted: false })
		assert.equal(await count('SELECT count(*) AS count FROM questions WHERE id = $1', [removed.id]), 0)
		assert.equal(stored(removed.prompt_path), 'Сирота')
		const logged = warn.mock.calls.find((args) => args[0] === ORPHAN_LOG)
		assert.ok(logged, 'console.warn orphan objects')
		assert.ok(Array.isArray(logged[1]) && (logged[1] as string[]).includes(removed.prompt_path))
		const rest = await questionRows(testId)
		assert.deepEqual(
			rest.map((row) => row.order),
			[0]
		)
	})

	test('несуществующий вопрос: 404 «Вопрос не найден в текущем тесте»', async () => {
		const topicId = await createTopic(nextSlug('topic'))
		const testId = await saveTest(topicId, nextSlug('dq-missing'), [radio('Есть', { order: 0 })])
		const reply = await deleteQuestionCall(testId, MISSING_ID)
		assert.equal(reply.status, 404)
		assert.equal(reply.body.error, 'Вопрос не найден в текущем тесте')
	})
})

describe('удаление теста и темы', () => {
	test('сбой БД при удалении теста: ошибка, объекты и строка теста на месте', async () => {
		const topicSlug = nextSlug('topic')
		const topicId = await createTopic(topicSlug)
		const slug = nextSlug('dt-fail')
		const testId = await saveTest(topicId, slug, [radio('Не потеряется', { order: 0 })])
		const keysBefore = mem.keys(testPrefix(topicSlug, slug))
		assert.ok(keysBefore.length > 0)
		await withTrigger(
			'qcon_mr_fail_test_delete',
			`BEFORE DELETE ON tests FOR EACH ROW WHEN (OLD.id = '${testId}')`,
			'tests',
			async () => {
				const reply = await deleteTestCall(testId)
				assert.ok(reply.status >= 500, String(reply.status))
			}
		)
		assert.deepEqual(mem.keys(testPrefix(topicSlug, slug)), keysBefore)
		assert.equal(await count('SELECT count(*) AS count FROM tests WHERE id = $1', [testId]), 1)
		const [row] = await questionRows(testId)
		assert.equal(stored(row?.prompt_path), 'Не потеряется')
	})

	test('удаление теста: questions/**, settings.json, answer_keys.json и указатели вне префикса удалены, assets и images на месте', async () => {
		const topicSlug = nextSlug('topic')
		const topicId = await createTopic(topicSlug)
		const slug = nextSlug('dt')
		const prefix = testPrefix(topicSlug, slug)
		const asset = `${prefix}/assets/a.png`
		const other = `${prefix}/notes.txt`
		mem.put(KEEP_IMAGE, 'keep', 'image/webp')
		mem.put(asset, 'png', 'image/png')
		mem.put(other, 'notes', 'text/plain')
		const testId = await saveTest(topicId, slug, [
			radio(`Один ![a](${asset})`, { order: 0, explanationText: 'Пояснение' }),
			radio('Два', { order: 1 }),
		])
		mem.put(`${prefix}/settings.json`, '{}', 'application/json')
		mem.put(`${prefix}/answer_keys.json`, '[]', 'application/json')
		const [first, second] = await questionRows(testId)
		assert.ok(first && second)
		const outside = `${questionDir(topicSlug, testId, second.id)}/prompt.md`
		const avatar = `avatars/${slug}.png`
		mem.put(outside, 'Вне префикса', 'text/markdown')
		mem.put(avatar, 'avatar', 'image/png')
		await ctx.pgPool.query('UPDATE questions SET prompt_path = $2, explanation_path = $3 WHERE id = $1', [
			second.id,
			outside,
			avatar,
		])
		const reply = await deleteTestCall(testId)
		assert.equal(reply.status, 200, JSON.stringify(reply.body))
		assert.deepEqual(reply.body, { ok: true })
		assert.deepEqual(mem.keys(prefix), [asset, other])
		assert.equal(mem.get(outside), null)
		assert.equal(stored(avatar), 'avatar')
		assert.equal(stored(KEEP_IMAGE), 'keep')
		assert.equal(await count('SELECT count(*) AS count FROM tests WHERE id = $1', [testId]), 0)
		assert.equal(await count('SELECT count(*) AS count FROM questions WHERE test_id = $1', [testId]), 0)
	})

	test('удаление темы: содержимое каждого теста и указатели вне префикса удалены, assets и images на месте', async () => {
		const topicSlug = nextSlug('topic')
		const topicId = await createTopic(topicSlug)
		const firstSlug = nextSlug('dtp-a')
		const secondSlug = nextSlug('dtp-b')
		const asset = `${testPrefix(topicSlug, firstSlug)}/assets/a.png`
		const topicAsset = `topics/${topicSlug}/assets/cover.png`
		mem.put(KEEP_IMAGE, 'keep', 'image/webp')
		mem.put(asset, 'png', 'image/png')
		mem.put(topicAsset, 'cover', 'image/png')
		const firstId = await saveTest(topicId, firstSlug, [radio(`A ![a](${asset})`, { order: 0 })])
		const secondId = await saveTest(topicId, secondSlug, [radio('B', { order: 0 })])
		mem.put(`${testPrefix(topicSlug, secondSlug)}/settings.json`, '{}', 'application/json')
		const [row] = await questionRows(secondId)
		assert.ok(row)
		const outside = `topics/${topicSlug}-legacy/${secondSlug}/questions/${row.id}/prompt.md`
		mem.put(outside, 'Вне темы', 'text/markdown')
		await ctx.pgPool.query('UPDATE questions SET prompt_path = $2, explanation_path = $3 WHERE id = $1', [
			row.id,
			outside,
			KEEP_IMAGE,
		])
		const reply = await deleteTopicCall(topicId)
		assert.equal(reply.status, 200, JSON.stringify(reply.body))
		assert.deepEqual(reply.body, { ok: true })
		assert.deepEqual(mem.keys(`topics/${topicSlug}`), [asset, topicAsset].sort())
		assert.equal(mem.get(outside), null)
		assert.equal(stored(KEEP_IMAGE), 'keep')
		assert.equal(await count('SELECT count(*) AS count FROM topics WHERE id = $1', [topicId]), 0)
		assert.equal(
			await count('SELECT count(*) AS count FROM tests WHERE id = ANY($1::uuid[])', [[firstId, secondId]]),
			0
		)
	})

	test('сбой БД при удалении темы: объекты и строки на месте', async () => {
		const topicSlug = nextSlug('topic')
		const topicId = await createTopic(topicSlug)
		const testId = await saveTest(topicId, nextSlug('dtp-fail'), [radio('Останется', { order: 0 })])
		const keysBefore = mem.keys(`topics/${topicSlug}`)
		assert.ok(keysBefore.length > 0)
		await withTrigger(
			'qcon_mr_fail_topic_delete',
			`BEFORE DELETE ON topics FOR EACH ROW WHEN (OLD.id = '${topicId}')`,
			'topics',
			async () => {
				const reply = await deleteTopicCall(topicId)
				assert.ok(reply.status >= 500, String(reply.status))
			}
		)
		assert.deepEqual(mem.keys(`topics/${topicSlug}`), keysBefore)
		assert.equal(await count('SELECT count(*) AS count FROM tests WHERE id = $1', [testId]), 1)
	})

	test('переименование s → s2, новый тест со slug s, удаление нового: assets старого slug на месте, промпт переименованного читается', async () => {
		const topicSlug = nextSlug('topic')
		const topicId = await createTopic(topicSlug)
		const slug = nextSlug('shared')
		const renamed = nextSlug('shared-renamed')
		const asset = `${testPrefix(topicSlug, slug)}/assets/a.png`
		mem.put(asset, 'png', 'image/png')
		const prompt = `Смотри ![a](${asset})`
		const originalId = await saveTest(topicId, slug, [radio(prompt, { order: 0 })])
		const rename = await call(ctx, 'PATCH', `/api/tests/${originalId}/settings`, {
			cookies: adminJar,
			body: { topicId, title: 'Переименованный', slug: renamed, isPublished: true },
		})
		assert.equal(rename.status, 200, JSON.stringify(rename.body))
		const newcomerId = await saveTest(topicId, slug, [radio('Новый', { order: 0 })])
		const reply = await deleteTestCall(newcomerId)
		assert.equal(reply.status, 200, JSON.stringify(reply.body))
		assert.equal(stored(asset), 'png')
		const [row] = await questionRows(originalId)
		assert.equal(stored(row?.prompt_path), prompt)
		const read = await call(ctx, 'GET', `/api/tests/by-slug/${topicSlug}/${renamed}`, { cookies: adminJar })
		assert.equal(read.status, 200, JSON.stringify(read.body))
		assert.deepEqual(
			(read.body.questions as Array<{ promptText: string }>).map((q) => q.promptText),
			[prompt]
		)
	})
})

describe('порядок вопросов', () => {
	test('PUT reorder с полным набором: порядок как передан', async () => {
		const topicId = await createTopic(nextSlug('topic'))
		const testId = await saveTest(topicId, nextSlug('ro'), [
			radio('A', { order: 0 }),
			radio('B', { order: 1 }),
			radio('C', { order: 2 }),
		])
		const rows = await questionRows(testId)
		const wanted = [rows[2]?.id, rows[0]?.id, rows[1]?.id] as string[]
		const reply = await reorderCall(testId, wanted)
		assert.equal(reply.status, 200, JSON.stringify(reply.body))
		assert.deepEqual(reply.body, { ok: true })
		const after = await questionRows(testId)
		assert.deepEqual(
			after.map((row) => row.id),
			wanted
		)
		assert.deepEqual(
			after.map((row) => row.order),
			[0, 1, 2]
		)
	})

	test('PUT reorder с неполным или чужим набором: 400, порядок прежний', async () => {
		const topicId = await createTopic(nextSlug('topic'))
		const testId = await saveTest(topicId, nextSlug('ro-bad'), [radio('A', { order: 0 }), radio('B', { order: 1 })])
		const otherId = await saveTest(topicId, nextSlug('ro-other'), [radio('X', { order: 0 })])
		const rows = await questionRows(testId)
		const [foreign] = await questionRows(otherId)
		assert.ok(foreign)
		const before = rows.map((row) => row.id)
		for (const ids of [[rows[0]?.id as string], [rows[0]?.id as string, foreign.id]]) {
			const reply = await reorderCall(testId, ids)
			assert.equal(reply.status, 400, JSON.stringify(reply.body))
			assert.equal(reply.body.error, REORDER_MISMATCH)
		}
		assert.deepEqual(
			(await questionRows(testId)).map((row) => row.id),
			before
		)
	})

	test('PUT reorder несуществующего теста: 404', async () => {
		const reply = await reorderCall(MISSING_ID, [MISSING_ID])
		assert.equal(reply.status, 404)
	})
})

describe('перенос вопроса', () => {
	test('в существующий тест: вопрос последний в цели, источник без дыр, объекты и документ поиска у цели', async () => {
		const fromSlug = nextSlug('from')
		const toSlug = nextSlug('to')
		const fromId = await createTopic(fromSlug)
		const toId = await createTopic(toSlug)
		const sourceSlug = nextSlug('src')
		const targetSlug = nextSlug('dst')
		const sourceId = await saveTest(fromId, sourceSlug, [
			radio('Первый', { order: 0 }),
			radio('Уезжает', { order: 1, explanationText: 'Пояснение уезжающего' }),
			radio('Третий', { order: 2 }),
		])
		const targetId = await saveTest(toId, targetSlug, [radio('Цель 1', { order: 0 }), radio('Цель 2', { order: 1 })])
		const moving = (await questionRows(sourceId))[1]
		assert.ok(moving?.prompt_path)
		const reply = await moveCall(sourceId, moving.id, { targetTestId: targetId })
		assert.equal(reply.status, 200, JSON.stringify(reply.body))
		assert.deepEqual(reply.body, {
			ok: true,
			questionId: moving.id,
			target: { topicId: toId, topicSlug: toSlug, testId: targetId, testSlug: targetSlug },
		})
		const source = await questionRows(sourceId)
		assert.deepEqual(
			source.map((row) => row.order),
			[0, 1]
		)
		const target = await questionRows(targetId)
		assert.deepEqual(
			target.map((row) => row.order),
			[0, 1, 2]
		)
		const moved = target[2]
		assert.equal(moved?.id, moving.id)
		assert.ok((moved?.prompt_path ?? '').startsWith(`${questionDir(toSlug, targetSlug, moving.id)}/`))
		assert.equal(stored(moved?.prompt_path), 'Уезжает')
		assert.equal(stored(moved?.explanation_path), 'Пояснение уезжающего')
		assert.deepEqual(mem.keys(questionDir(fromSlug, sourceSlug, moving.id)), [])
		const { rows } = await ctx.pgPool.query<{ test_id: string; topic_id: string }>(
			'SELECT test_id, topic_id FROM question_search_documents WHERE question_id = $1',
			[moving.id]
		)
		assert.deepEqual(rows, [{ test_id: targetId, topic_id: toId }])
	})

	test('в тему без теста с тем же slug: создан неопубликованный тест-приёмник с тем же slug', async () => {
		const fromSlug = nextSlug('from')
		const toSlug = nextSlug('to')
		const fromId = await createTopic(fromSlug)
		const toId = await createTopic(toSlug)
		const sourceSlug = nextSlug('auto')
		await saveTest(toId, nextSlug('existing'), [radio('Другой тест', { order: 0 })])
		const sourceId = await saveTest(fromId, sourceSlug, [
			radio('Переедет', { order: 0 }),
			radio('Останется', { order: 1 }),
		])
		const [moving] = await questionRows(sourceId)
		assert.ok(moving)
		const reply = await moveCall(sourceId, moving.id, { targetTopicId: toId })
		assert.equal(reply.status, 200, JSON.stringify(reply.body))
		const target = reply.body.target as Json
		assert.equal(target.topicId, toId)
		assert.equal(target.testSlug, sourceSlug)
		const created = (await testsOfTopic(toId)).find((row) => row.slug === sourceSlug)
		assert.ok(created)
		assert.equal(created.id, target.testId)
		assert.equal(created.is_published, false)
		const moved = await questionRows(created.id)
		assert.deepEqual(
			moved.map((row) => [row.id, row.order]),
			[[moving.id, 0]]
		)
		assert.ok((moved[0]?.prompt_path ?? '').startsWith(`${questionDir(toSlug, sourceSlug, moving.id)}/`))
		assert.equal(stored(moved[0]?.prompt_path), 'Переедет')
		assert.deepEqual(
			(await questionRows(sourceId)).map((row) => row.order),
			[0]
		)
	})

	test('сбой копирования: 503, вопрос с прежними указателями, у цели пусто, тест-приёмник не создан', async () => {
		const fromSlug = nextSlug('from')
		const toSlug = nextSlug('to')
		const fromId = await createTopic(fromSlug)
		const toId = await createTopic(toSlug)
		const sourceSlug = nextSlug('copyfail')
		const sourceId = await saveTest(fromId, sourceSlug, [radio('Не уедет', { order: 0, explanationText: 'Пояснение' })])
		const before = await questionRows(sourceId)
		const [moving] = before
		assert.ok(moving?.explanation_path)
		mem.failOn({ op: 'copy', key: moving.explanation_path })
		const reply = await moveCall(sourceId, moving.id, { targetTopicId: toId })
		assert.equal(reply.status, 503)
		assert.equal(reply.body.error, MOVE_FAILED)
		assert.deepEqual(await questionRows(sourceId), before)
		assert.deepEqual(mem.keys(`topics/${toSlug}`), [])
		assert.deepEqual(await testsOfTopic(toId), [])
		assert.equal(stored(moving.prompt_path), 'Не уедет')
	})

	test('сбой транзакции: ошибка, копии удалены, БД прежняя', async () => {
		const fromSlug = nextSlug('from')
		const toSlug = nextSlug('to')
		const fromId = await createTopic(fromSlug)
		const toId = await createTopic(toSlug)
		const sourceSlug = nextSlug('txfail')
		const targetSlug = nextSlug('txfail-dst')
		const sourceId = await saveTest(fromId, sourceSlug, [radio('Остаётся', { order: 0 })])
		const targetId = await saveTest(toId, targetSlug, [radio('Цель', { order: 0 })])
		const before = await questionRows(sourceId)
		const targetBefore = await questionRows(targetId)
		const [moving] = before
		assert.ok(moving)
		await withTrigger(
			'qcon_mr_fail_question_update',
			`BEFORE UPDATE ON questions FOR EACH ROW WHEN (OLD.id = '${moving.id}')`,
			'questions',
			async () => {
				const reply = await moveCall(sourceId, moving.id, { targetTestId: targetId })
				assert.ok(reply.status >= 500, String(reply.status))
			}
		)
		assert.deepEqual(await questionRows(sourceId), before)
		assert.deepEqual(await questionRows(targetId), targetBefore)
		assert.deepEqual(mem.keys(questionDir(toSlug, targetSlug, moving.id)), [])
		assert.equal(stored(moving.prompt_path), 'Остаётся')
	})

	test('в тот же тест: 400', async () => {
		const topicId = await createTopic(nextSlug('topic'))
		const testId = await saveTest(topicId, nextSlug('same'), [radio('Здесь', { order: 0 })])
		const [row] = await questionRows(testId)
		assert.ok(row)
		for (const body of [{ targetTestId: testId }, { targetTopicId: topicId }]) {
			const reply = await moveCall(testId, row.id, body)
			assert.equal(reply.status, 400, JSON.stringify(reply.body))
			assert.equal(reply.body.error, SAME_TARGET)
		}
	})

	test('параллельно перенос в тест B и создание вопроса в B: порядок B 0…n-1 без повторов', async () => {
		const topicSlug = nextSlug('topic')
		const topicId = await createTopic(topicSlug)
		const sourceId = await saveTest(topicId, nextSlug('par-a'), [radio('A1', { order: 0 }), radio('A2', { order: 1 })])
		const targetId = await saveTest(topicId, nextSlug('par-b'), [radio('B1', { order: 0 }), radio('B2', { order: 1 })])
		const [moving] = await questionRows(sourceId)
		assert.ok(moving)
		const [moved, created] = await Promise.all([
			moveCall(sourceId, moving.id, { targetTestId: targetId }),
			call(ctx, 'POST', `/api/tests/${targetId}/questions`, { cookies: adminJar, body: radio('B3') }),
		])
		assert.equal(moved.status, 200, JSON.stringify(moved.body))
		assert.equal(created.status, 201, JSON.stringify(created.body))
		const target = await questionRows(targetId)
		assert.deepEqual(
			target.map((row) => row.order),
			[0, 1, 2, 3]
		)
		assert.ok(target.some((row) => row.id === moving.id))
		assert.deepEqual(
			(await questionRows(sourceId)).map((row) => row.order),
			[0]
		)
	})

	test('гонка правки и переноса: 409, вопрос в источнике с указателем правки, у цели пусто, приёмник не создан', async () => {
		const fromSlug = nextSlug('from')
		const toSlug = nextSlug('to')
		const fromId = await createTopic(fromSlug)
		const toId = await createTopic(toSlug)
		const sourceSlug = nextSlug('edit-race')
		const sourceId = await saveTest(fromId, sourceSlug, [radio('До правки', { order: 0 })])
		const [row] = await questionRows(sourceId)
		assert.ok(row)
		const race = afterCopies(1, () =>
			qc.updateQuestion({ testId: sourceId, questionId: row.id, data: radio('Правка') as never, userId: null })
		)
		const reply = await moveCall(sourceId, row.id, { targetTopicId: toId })
		assert.equal(race.fired(), true)
		assert.equal(reply.status, 409, JSON.stringify(reply.body))
		assert.equal(reply.body.error, CONTENT_CHANGED)
		const [after] = await questionRows(sourceId)
		assert.ok(after?.prompt_path)
		assert.notEqual(after.prompt_path, row.prompt_path)
		assert.ok(after.prompt_path.startsWith(`${questionDir(fromSlug, sourceSlug, row.id)}/prompt-`))
		assert.equal(stored(after.prompt_path), 'Правка')
		assert.deepEqual(mem.keys(`topics/${toSlug}`), [])
		assert.deepEqual(await testsOfTopic(toId), [])
	})

	test('гонка переименования цели и переноса: 409, копии под прежним префиксом цели удалены', async () => {
		const fromSlug = nextSlug('from')
		const toSlug = nextSlug('to')
		const fromId = await createTopic(fromSlug)
		const toId = await createTopic(toSlug)
		const sourceSlug = nextSlug('rename-race')
		const targetSlug = nextSlug('rename-race-dst')
		const sourceId = await saveTest(fromId, sourceSlug, [radio('Едет', { order: 0 })])
		const targetId = await saveTest(toId, targetSlug, [radio('Цель', { order: 0 })])
		const [row] = await questionRows(sourceId)
		assert.ok(row)
		const race = afterCopies(1, () =>
			ctx.pgPool.query('UPDATE tests SET slug = $2 WHERE id = $1', [targetId, `${targetSlug}-renamed`])
		)
		const reply = await moveCall(sourceId, row.id, { targetTestId: targetId })
		assert.equal(race.fired(), true)
		assert.equal(reply.status, 409, JSON.stringify(reply.body))
		assert.equal(reply.body.error, CONTENT_CHANGED)
		assert.deepEqual(mem.keys(questionDir(toSlug, targetSlug, row.id)), [])
		assert.deepEqual(await questionRows(sourceId), [row])
		assert.equal(stored(row.prompt_path), 'Едет')
	})
})

describe('доступ через scope.ts', () => {
	test('студент: удаление вопроса, теста, темы, reorder и перенос → 403, и для несуществующего id', async () => {
		const topicSlug = nextSlug('topic')
		const topicId = await createTopic(topicSlug)
		const otherTopicId = await createTopic(nextSlug('topic-other'))
		const testId = await saveTest(topicId, nextSlug('student'), [radio('Ученик', { order: 0 })])
		const [row] = await questionRows(testId)
		assert.ok(row)
		const keysBefore = mem.keys()
		const snapshot = async () =>
			(
				await ctx.pgPool.query(
					"SELECT (SELECT string_agg(id::text, ',' ORDER BY id) FROM tests) AS tests, (SELECT string_agg(id::text, ',' ORDER BY id) FROM topics) AS topics, (SELECT string_agg(id::text || ':' || test_id::text || ':' || \"order\", ',' ORDER BY id) FROM questions) AS questions"
				)
			).rows
		const before = await snapshot()
		const attempts = [
			deleteQuestionCall(testId, row.id, studentJar),
			deleteQuestionCall(MISSING_ID, MISSING_ID, studentJar),
			deleteTestCall(testId, studentJar),
			deleteTestCall(MISSING_ID, studentJar),
			deleteTopicCall(topicId, studentJar),
			deleteTopicCall(MISSING_ID, studentJar),
			reorderCall(testId, [row.id], studentJar),
			reorderCall(MISSING_ID, [MISSING_ID], studentJar),
			moveCall(testId, row.id, { targetTopicId: otherTopicId }, studentJar),
			moveCall(MISSING_ID, MISSING_ID, { targetTopicId: MISSING_ID }, studentJar),
			moveCall(testId, row.id, { broken: true }, studentJar),
		]
		for (const reply of await Promise.all(attempts)) {
			assert.equal(reply.status, 403, JSON.stringify(reply.body))
			assert.equal(reply.body.error, 'Forbidden')
		}
		assert.deepEqual(await snapshot(), before)
		assert.deepEqual(mem.keys(), keysBefore)
	})

	test('администратор с deny tests.write: перенос и удаление → 403', async () => {
		const topicId = await createTopic(nextSlug('topic'))
		const otherTopicId = await createTopic(nextSlug('topic-other'))
		const testId = await saveTest(topicId, nextSlug('denied'), [radio('Закрыто', { order: 0 })])
		const [row] = await questionRows(testId)
		assert.ok(row)
		const attempts = [
			moveCall(testId, row.id, { targetTopicId: otherTopicId }, deniedJar),
			deleteQuestionCall(testId, row.id, deniedJar),
			deleteTestCall(testId, deniedJar),
			deleteTopicCall(topicId, deniedJar),
			reorderCall(testId, [row.id], deniedJar),
		]
		for (const reply of await Promise.all(attempts)) {
			assert.equal(reply.status, 403, JSON.stringify(reply.body))
			assert.equal(reply.body.error, 'Forbidden')
		}
		assert.equal((await questionRows(testId)).length, 1)
		assert.deepEqual(await testsOfTopic(otherTopicId), [])
	})
})

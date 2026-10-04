import assert from 'node:assert/strict'
import { afterAll, afterEach, beforeAll, describe, test, vi } from 'vitest'

import { call, login, seedUser, startAuthApp, type AuthApp, type CookieJar } from '../../test-support/auth-app.js'
import { memoryStorage } from '../../test-support/storage.js'
import type { MemoryStorageAdapter } from '../storage/adapters/memory.js'

type QuestionContentModule = typeof import('./index.js')

type Json = Record<string, unknown>

type QuestionRow = { id: string; order: number; prompt_path: string | null; explanation_path: string | null }

const PASSWORD = 'qcon-relocate-password-1'
const ROLLBACK_ERROR = 'Не удалось перенести файлы, переименование отменено'
const CONTENT_CHANGED = 'Содержимое изменилось, повторите'
const ORPHAN_LOG = '[question-content] orphan objects'
const MISSING_ID = '00000000-0000-4000-8000-000000000000'

const OPTIONS = [
	{ id: 'a', text: 'Ядро' },
	{ id: 'b', text: 'Вакуоль' },
	{ id: 'c', text: 'Лизосома' },
]

let ctx: AuthApp
let mem: MemoryStorageAdapter
let qc: QuestionContentModule
let adminJar: CookieJar
let studentJar: CookieJar
let counter = 0

function radio(promptText: string, overrides: Json = {}): Json {
	return { type: 'radio', promptText, options: OPTIONS, correct: 'b', points: 1, ...overrides }
}

function nextSlug(name: string): string {
	counter += 1
	return `qcon-rl-${name}-${counter}`
}

function testPrefix(topicSlug: string, testSlug: string): string {
	return `topics/${topicSlug}/${testSlug}`
}

function questionDir(topicSlug: string, testSlug: string, questionId: string): string {
	return `${testPrefix(topicSlug, testSlug)}/questions/${questionId}`
}

function base(key: string | null): string {
	assert.ok(key)
	return key.slice(key.lastIndexOf('/') + 1)
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

async function testSlugInDb(testId: string): Promise<string | null> {
	const { rows } = await ctx.pgPool.query<{ slug: string }>('SELECT slug FROM tests WHERE id = $1', [testId])
	return rows[0]?.slug ?? null
}

function stored(key: string | null | undefined): string | null {
	assert.ok(key)
	const object = mem.get(key)
	return object ? object.data.toString('utf8') : null
}

function settingsBody(topicId: string, slug: string, overrides: Json = {}): Json {
	return { topicId, title: `Тест ${slug}`, slug, isPublished: true, ...overrides }
}

async function patchSettings(testId: string, body: Json, jar = adminJar) {
	return call(ctx, 'PATCH', `/api/tests/${testId}/settings`, { cookies: jar, body })
}

async function patchTopic(topicId: string, body: Json, jar = adminJar) {
	return call(ctx, 'PATCH', `/api/tests/topics/${topicId}`, { cookies: jar, body })
}

async function withFailingUpdate(slug: string, run: () => Promise<void>) {
	await ctx.pgPool.query(
		`CREATE OR REPLACE FUNCTION qcon_relocate_fail() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'qcon relocate failure'; END $$ LANGUAGE plpgsql`
	)
	await ctx.pgPool.query(
		`CREATE TRIGGER qcon_relocate_fail_tests BEFORE UPDATE ON tests FOR EACH ROW WHEN (NEW.slug = '${slug}') EXECUTE FUNCTION qcon_relocate_fail()`
	)
	try {
		await run()
	} finally {
		await ctx.pgPool.query('DROP TRIGGER IF EXISTS qcon_relocate_fail_tests ON tests')
	}
}

function afterCopies(count: number, action: () => Promise<unknown>) {
	const original = mem.copy.bind(mem)
	let calls = 0
	let fired = false
	const spy = vi.spyOn(mem, 'copy').mockImplementation(async (from, to) => {
		await original(from, to)
		calls += 1
		if (!fired && calls === count) {
			fired = true
			await action()
		}
	})
	return { spy, fired: () => fired }
}

beforeAll(async () => {
	ctx = await startAuthApp('test_qcon_relocate')
	await seedUser(ctx, { login: 'qcon_relocate_admin', roles: ['admin'], password: PASSWORD })
	await seedUser(ctx, { login: 'qcon_relocate_student', roles: ['user'], password: PASSWORD })
	const admin = await login(ctx, 'qcon_relocate_admin', PASSWORD)
	assert.equal(admin.status, 200)
	adminJar = admin.jar
	const student = await login(ctx, 'qcon_relocate_student', PASSWORD)
	assert.equal(student.status, 200)
	studentJar = student.jar
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

describe('переименование теста', () => {
	test('смена slug: указатели и объекты под новым префиксом, под старым нет, assetsMoved: true', async () => {
		const topicSlug = nextSlug('topic')
		const topicId = await createTopic(topicSlug)
		const oldSlug = nextSlug('old')
		const newSlug = nextSlug('new')
		const testId = await saveTest(topicId, oldSlug, [
			radio('Первый', { order: 0, explanationText: 'Пояснение первого' }),
			radio('Второй', { order: 1 }),
		])
		const before = await questionRows(testId)
		const reply = await patchSettings(testId, settingsBody(topicId, newSlug))
		assert.equal(reply.status, 200, JSON.stringify(reply.body))
		assert.equal(reply.body.assetsMoved, true)
		assert.equal((reply.body.test as Json).topicSlug, topicSlug)
		assert.equal(await testSlugInDb(testId), newSlug)
		const after = await questionRows(testId)
		for (const [index, row] of after.entries()) {
			const prior = before[index]
			assert.ok(prior)
			assert.equal(row.prompt_path, `${questionDir(topicSlug, newSlug, row.id)}/${base(prior.prompt_path)}`)
		}
		assert.equal(
			after[0]?.explanation_path,
			`${questionDir(topicSlug, newSlug, after[0]?.id ?? '')}/${base(before[0]?.explanation_path ?? null)}`
		)
		assert.equal(after[1]?.explanation_path, null)
		assert.deepEqual(
			after.map((row) => stored(row.prompt_path)),
			['Первый', 'Второй']
		)
		assert.equal(stored(after[0]?.explanation_path), 'Пояснение первого')
		assert.deepEqual(mem.keys(testPrefix(topicSlug, oldSlug)), [])
	})

	test('устаревший указатель topics/<t>/<testId>/questions/<qid>/prompt.md переносится в канонический ключ', async () => {
		const topicSlug = nextSlug('topic')
		const topicId = await createTopic(topicSlug)
		const oldSlug = nextSlug('legacy')
		const newSlug = nextSlug('legacy-new')
		const testId = await saveTest(topicId, oldSlug, [radio('Канонический', { order: 0 })])
		const [row] = await questionRows(testId)
		assert.ok(row?.prompt_path)
		const legacy = `${questionDir(topicSlug, testId, row.id)}/prompt.md`
		mem.put(legacy, 'Устаревший', 'text/markdown')
		await mem.remove([row.prompt_path])
		await ctx.pgPool.query('UPDATE questions SET prompt_path = $2 WHERE id = $1', [row.id, legacy])
		const reply = await patchSettings(testId, settingsBody(topicId, newSlug))
		assert.equal(reply.status, 200, JSON.stringify(reply.body))
		const [after] = await questionRows(testId)
		assert.equal(after?.prompt_path, `${questionDir(topicSlug, newSlug, row.id)}/prompt.md`)
		assert.equal(stored(after?.prompt_path), 'Устаревший')
		assert.equal(mem.get(legacy), null)
	})

	test('prompt_path = null при существующем prompt.md: указатель становится каноническим новым ключом', async () => {
		const topicSlug = nextSlug('topic')
		const topicId = await createTopic(topicSlug)
		const oldSlug = nextSlug('nullptr')
		const newSlug = nextSlug('nullptr-new')
		const testId = await saveTest(topicId, oldSlug, [radio('По ревизии', { order: 0 })])
		const [row] = await questionRows(testId)
		assert.ok(row?.prompt_path)
		const fallback = `${questionDir(topicSlug, oldSlug, row.id)}/prompt.md`
		mem.put(fallback, 'Без указателя', 'text/markdown')
		await mem.remove([row.prompt_path])
		await ctx.pgPool.query('UPDATE questions SET prompt_path = NULL WHERE id = $1', [row.id])
		const reply = await patchSettings(testId, settingsBody(topicId, newSlug))
		assert.equal(reply.status, 200, JSON.stringify(reply.body))
		const [after] = await questionRows(testId)
		assert.equal(after?.prompt_path, `${questionDir(topicSlug, newSlug, row.id)}/prompt.md`)
		assert.equal(stored(after?.prompt_path), 'Без указателя')
		assert.equal(mem.get(fallback), null)
	})

	test('картинки по ссылкам, settings.json и answer_keys.json не переносятся', async () => {
		const topicSlug = nextSlug('topic')
		const topicId = await createTopic(topicSlug)
		const oldSlug = nextSlug('assets')
		const newSlug = nextSlug('assets-new')
		const asset = `${testPrefix(topicSlug, oldSlug)}/assets/a.png`
		const image = `images/${nextSlug('b')}.webp`
		mem.put(asset, 'png', 'image/png')
		mem.put(image, 'webp', 'image/webp')
		const testId = await saveTest(topicId, oldSlug, [radio(`![a](${asset}) ![b](${image})`, { order: 0 })])
		const settings = `${testPrefix(topicSlug, oldSlug)}/settings.json`
		const answers = `${testPrefix(topicSlug, oldSlug)}/answer_keys.json`
		mem.put(settings, '{}', 'application/json')
		mem.put(answers, '[]', 'application/json')
		const reply = await patchSettings(testId, settingsBody(topicId, newSlug))
		assert.equal(reply.status, 200, JSON.stringify(reply.body))
		assert.equal(stored(asset), 'png')
		assert.equal(stored(image), 'webp')
		assert.equal(stored(settings), '{}')
		assert.equal(stored(answers), '[]')
		const [row] = await questionRows(testId)
		assert.ok(row)
		assert.deepEqual(mem.keys(testPrefix(topicSlug, newSlug)), [row.prompt_path])
		assert.deepEqual(mem.keys(testPrefix(topicSlug, oldSlug)), [answers, asset, settings].sort())
	})

	test('смена темы: topic_id документов поиска вопросов — новая тема', async () => {
		const fromSlug = nextSlug('from')
		const toSlug = nextSlug('to')
		const fromId = await createTopic(fromSlug)
		const toId = await createTopic(toSlug)
		const slug = nextSlug('mover')
		const testId = await saveTest(fromId, slug, [radio('Один', { order: 0 }), radio('Два', { order: 1 })])
		const reply = await patchSettings(testId, settingsBody(toId, slug))
		assert.equal(reply.status, 200, JSON.stringify(reply.body))
		assert.equal(reply.body.assetsMoved, true)
		const { rows } = await ctx.pgPool.query<{ topic_id: string }>(
			'SELECT d.topic_id FROM question_search_documents d JOIN questions q ON q.id = d.question_id WHERE q.test_id = $1',
			[testId]
		)
		assert.deepEqual(
			rows.map((row) => row.topic_id),
			[toId, toId]
		)
		for (const row of await questionRows(testId)) {
			assert.ok((row.prompt_path ?? '').startsWith(`${testPrefix(toSlug, slug)}/`))
			assert.ok(stored(row.prompt_path))
		}
		assert.deepEqual(mem.keys(testPrefix(fromSlug, slug)), [])
	})

	test('без смены slug и темы: ответ без assetsMoved, объекты не копируются', async () => {
		const topicSlug = nextSlug('topic')
		const topicId = await createTopic(topicSlug)
		const slug = nextSlug('same')
		const testId = await saveTest(topicId, slug, [radio('На месте', { order: 0 })])
		const before = await questionRows(testId)
		const copy = vi.spyOn(mem, 'copy')
		const reply = await patchSettings(testId, settingsBody(topicId, slug, { title: 'Новое название' }))
		assert.equal(reply.status, 200, JSON.stringify(reply.body))
		assert.equal('assetsMoved' in reply.body, false)
		assert.equal((reply.body.test as Json).title, 'Новое название')
		assert.equal(copy.mock.calls.length, 0)
		assert.deepEqual(await questionRows(testId), before)
	})

	test('поиск источников без exists: list по одному разу на каждый префикс теста', async () => {
		const topicSlug = nextSlug('topic')
		const topicId = await createTopic(topicSlug)
		const oldSlug = nextSlug('lister')
		const newSlug = nextSlug('lister-new')
		const testId = await saveTest(topicId, oldSlug, [
			radio('Раз', { order: 0 }),
			radio('Два', { order: 1 }),
			radio('Три', { order: 2 }),
		])
		const exists = vi.spyOn(mem, 'exists')
		const list = vi.spyOn(mem, 'list')
		const reply = await patchSettings(testId, settingsBody(topicId, newSlug))
		assert.equal(reply.status, 200, JSON.stringify(reply.body))
		assert.equal(exists.mock.calls.length, 0)
		const prefixes = list.mock.calls.map((args) => args[0])
		assert.equal(new Set(prefixes).size, prefixes.length)
		assert.ok(prefixes.includes(testPrefix(topicSlug, oldSlug)))
		assert.ok(prefixes.every((prefix) => prefix.startsWith(`topics/${topicSlug}/`)))
		for (const call of list.mock.calls) assert.deepEqual(call[1], { recursive: true })
	})
})

describe('сбои переименования теста', () => {
	test('сбой копирования второго вопроса: 503, slug и указатели прежние, под новым префиксом пусто', async () => {
		const topicSlug = nextSlug('topic')
		const topicId = await createTopic(topicSlug)
		const oldSlug = nextSlug('copyfail')
		const newSlug = nextSlug('copyfail-new')
		const testId = await saveTest(topicId, oldSlug, [radio('Первый', { order: 0 }), radio('Второй', { order: 1 })])
		const before = await questionRows(testId)
		mem.failOn({ op: 'copy', key: before[1]?.prompt_path ?? '' })
		const reply = await patchSettings(testId, settingsBody(topicId, newSlug))
		assert.equal(reply.status, 503)
		assert.equal(reply.body.error, ROLLBACK_ERROR)
		assert.equal(await testSlugInDb(testId), oldSlug)
		assert.deepEqual(await questionRows(testId), before)
		assert.deepEqual(mem.keys(testPrefix(topicSlug, newSlug)), [])
		assert.deepEqual(
			before.map((row) => stored(row.prompt_path)),
			['Первый', 'Второй']
		)
	})

	test('сбой транзакции: ответ с ошибкой, под новым префиксом пусто, БД прежняя', async () => {
		const topicSlug = nextSlug('topic')
		const topicId = await createTopic(topicSlug)
		const oldSlug = nextSlug('txfail')
		const newSlug = nextSlug('txfail-new')
		const testId = await saveTest(topicId, oldSlug, [radio('Останется', { order: 0 })])
		const before = await questionRows(testId)
		await withFailingUpdate(newSlug, async () => {
			const reply = await patchSettings(testId, settingsBody(topicId, newSlug))
			assert.ok(reply.status >= 500, String(reply.status))
		})
		assert.equal(await testSlugInDb(testId), oldSlug)
		assert.deepEqual(await questionRows(testId), before)
		assert.deepEqual(mem.keys(testPrefix(topicSlug, newSlug)), [])
		assert.equal(stored(before[0]?.prompt_path), 'Останется')
	})

	test('сбой удаления старого объекта после commit: 200, объект на месте, лог orphan objects', async () => {
		const topicSlug = nextSlug('topic')
		const topicId = await createTopic(topicSlug)
		const oldSlug = nextSlug('orphan')
		const newSlug = nextSlug('orphan-new')
		const testId = await saveTest(topicId, oldSlug, [radio('Сирота', { order: 0 })])
		const [row] = await questionRows(testId)
		assert.ok(row?.prompt_path)
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
		mem.failOn({ op: 'remove', key: row.prompt_path })
		const reply = await patchSettings(testId, settingsBody(topicId, newSlug))
		assert.equal(reply.status, 200, JSON.stringify(reply.body))
		assert.equal(stored(row.prompt_path), 'Сирота')
		const [after] = await questionRows(testId)
		assert.equal(stored(after?.prompt_path), 'Сирота')
		const logged = warn.mock.calls.find((args) => args[0] === ORPHAN_LOG)
		assert.ok(logged, 'console.warn orphan objects')
		assert.ok(Array.isArray(logged[1]) && (logged[1] as string[]).includes(row.prompt_path))
	})
})

describe('гонки с переименованием теста', () => {
	test('правка вопроса после копирования: 409, slug прежний, указатель правки на месте', async () => {
		const topicSlug = nextSlug('topic')
		const topicId = await createTopic(topicSlug)
		const oldSlug = nextSlug('edit-race')
		const newSlug = nextSlug('edit-race-new')
		const testId = await saveTest(topicId, oldSlug, [radio('До правки', { order: 0 })])
		const [row] = await questionRows(testId)
		assert.ok(row)
		const race = afterCopies(1, () =>
			qc.updateQuestion({ testId, questionId: row.id, data: radio('Правка', { order: 0 }) as never, userId: null })
		)
		const reply = await patchSettings(testId, settingsBody(topicId, newSlug))
		assert.equal(race.fired(), true)
		assert.equal(reply.status, 409)
		assert.deepEqual(reply.body.error, CONTENT_CHANGED)
		assert.equal(await testSlugInDb(testId), oldSlug)
		assert.deepEqual(mem.keys(testPrefix(topicSlug, newSlug)), [])
		const [after] = await questionRows(testId)
		assert.ok(after?.prompt_path)
		assert.notEqual(after.prompt_path, row.prompt_path)
		assert.ok(after.prompt_path.startsWith(`${questionDir(topicSlug, oldSlug, row.id)}/prompt-`))
		assert.equal(stored(after.prompt_path), 'Правка')
	})

	test('создание вопроса после копирования: 409, новый вопрос и его промпт на месте', async () => {
		const topicSlug = nextSlug('topic')
		const topicId = await createTopic(topicSlug)
		const oldSlug = nextSlug('create-race')
		const newSlug = nextSlug('create-race-new')
		const testId = await saveTest(topicId, oldSlug, [radio('Был', { order: 0 })])
		let createdId = ''
		const race = afterCopies(1, async () => {
			const created = await qc.createQuestion({ testId, data: radio('Появился') as never, userId: null })
			createdId = created.questionId
		})
		const reply = await patchSettings(testId, settingsBody(topicId, newSlug))
		assert.equal(race.fired(), true)
		assert.equal(reply.status, 409)
		assert.equal(reply.body.error, CONTENT_CHANGED)
		assert.equal(await testSlugInDb(testId), oldSlug)
		assert.deepEqual(mem.keys(testPrefix(topicSlug, newSlug)), [])
		const rows = await questionRows(testId)
		const created = rows.find((row) => row.id === createdId)
		assert.ok(created)
		assert.equal(stored(created.prompt_path), 'Появился')
		assert.equal(rows.length, 2)
	})
})

describe('переименование темы', () => {
	test('смена slug темы переносит файлы всех тестов темы', async () => {
		const oldTopic = nextSlug('topic-old')
		const newTopic = nextSlug('topic-new')
		const topicId = await createTopic(oldTopic)
		const firstSlug = nextSlug('a')
		const secondSlug = nextSlug('b')
		const firstId = await saveTest(topicId, firstSlug, [radio('A1', { order: 0, explanationText: 'Пояснение A1' })])
		const secondId = await saveTest(topicId, secondSlug, [radio('B1', { order: 0 }), radio('B2', { order: 1 })])
		const reply = await patchTopic(topicId, { slug: newTopic })
		assert.equal(reply.status, 200, JSON.stringify(reply.body))
		assert.equal((reply.body.topic as Json).slug, newTopic)
		for (const [testId, testSlug] of [
			[firstId, firstSlug],
			[secondId, secondSlug],
		] as const) {
			for (const row of await questionRows(testId)) {
				assert.ok((row.prompt_path ?? '').startsWith(`${questionDir(newTopic, testSlug, row.id)}/`))
				assert.ok(stored(row.prompt_path))
			}
		}
		const [first] = await questionRows(firstId)
		assert.equal(stored(first?.explanation_path), 'Пояснение A1')
		assert.deepEqual(mem.keys(`topics/${oldTopic}`), [])
	})

	test('сбой копирования при смене slug темы: 503, slug темы прежний', async () => {
		const oldTopic = nextSlug('topic-keep')
		const newTopic = nextSlug('topic-keep-new')
		const topicId = await createTopic(oldTopic)
		const testSlug = nextSlug('k')
		const testId = await saveTest(topicId, testSlug, [radio('K1', { order: 0 })])
		const before = await questionRows(testId)
		mem.failOn({ op: 'copy', prefix: `topics/${oldTopic}` })
		const reply = await patchTopic(topicId, { slug: newTopic })
		assert.equal(reply.status, 503)
		assert.equal(reply.body.error, ROLLBACK_ERROR)
		const { rows } = await ctx.pgPool.query<{ slug: string }>('SELECT slug FROM topics WHERE id = $1', [topicId])
		assert.equal(rows[0]?.slug, oldTopic)
		assert.deepEqual(await questionRows(testId), before)
		assert.deepEqual(mem.keys(`topics/${newTopic}`), [])
	})
})

describe('доступ к переименованию через scope.ts', () => {
	test('студент: PATCH /:id/settings и PATCH /topics/:id → 403, БД и хранилище не меняются', async () => {
		const topicSlug = nextSlug('topic')
		const topicId = await createTopic(topicSlug)
		const slug = nextSlug('student')
		const testId = await saveTest(topicId, slug, [radio('Только чтение', { order: 0 })])
		const keysBefore = mem.keys()
		const { rows: before } = await ctx.pgPool.query(
			"SELECT (SELECT string_agg(slug, ',' ORDER BY id) FROM tests) AS tests, (SELECT string_agg(slug, ',' ORDER BY id) FROM topics) AS topics, (SELECT string_agg(prompt_path, ',' ORDER BY id) FROM questions) AS prompts"
		)
		const attempts = [
			patchSettings(testId, settingsBody(topicId, nextSlug('student-new')), studentJar),
			patchSettings(testId, { broken: true }, studentJar),
			patchSettings(MISSING_ID, settingsBody(topicId, nextSlug('student-missing')), studentJar),
			patchTopic(topicId, { slug: nextSlug('student-topic') }, studentJar),
			patchTopic(topicId, { slug: 'X' }, studentJar),
			patchTopic(MISSING_ID, { slug: nextSlug('student-topic-missing') }, studentJar),
		]
		for (const reply of await Promise.all(attempts)) {
			assert.equal(reply.status, 403)
			assert.equal(reply.body.error, 'Forbidden')
		}
		const { rows: after } = await ctx.pgPool.query(
			"SELECT (SELECT string_agg(slug, ',' ORDER BY id) FROM tests) AS tests, (SELECT string_agg(slug, ',' ORDER BY id) FROM topics) AS topics, (SELECT string_agg(prompt_path, ',' ORDER BY id) FROM questions) AS prompts"
		)
		assert.deepEqual(after, before)
		assert.deepEqual(mem.keys(), keysBefore)
	})
})

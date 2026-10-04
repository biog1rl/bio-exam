import assert from 'node:assert/strict'
import { afterAll, afterEach, beforeAll, describe, test, vi } from 'vitest'

import { call, login, seedUser, startAuthApp, type AuthApp, type CookieJar } from '../../test-support/auth-app.js'
import { memoryStorage } from '../../test-support/storage.js'
import type { MemoryStorageAdapter } from '../storage/adapters/memory.js'

type QuestionContentModule = typeof import('./index.js')

type Json = Record<string, unknown>

type QuestionRow = {
	id: string
	order: number
	prompt_path: string | null
	explanation_path: string | null
	created_at: Date
}

type KeyRow = { version: number; is_active: boolean; key: string }

const PASSWORD = 'qcon-write-password-1'
const TOPIC_SLUG = 'qcon-write-topic'
const MISSING_ID = '00000000-0000-4000-8000-000000000000'
const REVISION_PROMPT = /\/prompt-[0-9a-f]{12}\.md$/
const ORPHAN_LOG = '[question-content] orphan objects'
const PARALLEL_POSTS = 6

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
let topicId = ''
let slugCounter = 0

function radio(promptText: string, overrides: Json = {}): Json {
	return { type: 'radio', promptText, options: OPTIONS, correct: 'b', points: 1, ...overrides }
}

function nextSlug(name: string): string {
	slugCounter += 1
	return `qcon-w-${name}-${slugCounter}`
}

function questionDir(testSlug: string, questionId: string): string {
	return `topics/${TOPIC_SLUG}/${testSlug}/questions/${questionId}`
}

async function saveTest(slug: string, questions: Json[]): Promise<string> {
	const reply = await call(ctx, 'POST', '/api/tests/save', {
		cookies: adminJar,
		body: { topicId, title: `Тест ${slug}`, slug, isPublished: true, questions },
	})
	assert.equal(reply.status, 201, JSON.stringify(reply.body))
	const created = reply.body.test as Json | undefined
	assert.ok(created && typeof created.id === 'string')
	return created.id
}

async function questionRows(testId: string): Promise<QuestionRow[]> {
	const { rows } = await ctx.pgPool.query<QuestionRow>(
		'SELECT id, "order", prompt_path, explanation_path, created_at FROM questions WHERE test_id = $1 ORDER BY "order", created_at, id',
		[testId]
	)
	return rows
}

async function questionRow(questionId: string): Promise<QuestionRow | undefined> {
	const { rows } = await ctx.pgPool.query<QuestionRow>(
		'SELECT id, "order", prompt_path, explanation_path, created_at FROM questions WHERE id = $1',
		[questionId]
	)
	return rows[0]
}

async function keyRows(questionId: string): Promise<KeyRow[]> {
	const { rows } = await ctx.pgPool.query<KeyRow>(
		"SELECT version, is_active, correct_answer #>> '{}' AS key FROM answer_keys WHERE question_id = $1 ORDER BY version",
		[questionId]
	)
	return rows
}

async function searchPrompt(questionId: string): Promise<string | null> {
	const { rows } = await ctx.pgPool.query<{ prompt_text: string }>(
		'SELECT prompt_text FROM question_search_documents WHERE question_id = $1',
		[questionId]
	)
	return rows[0]?.prompt_text ?? null
}

function stored(key: string | null | undefined): string | null {
	assert.ok(key)
	const object = mem.get(key)
	return object ? object.data.toString('utf8') : null
}

async function patchQuestion(testId: string, questionId: string, body: Json, jar = adminJar) {
	return call(ctx, 'PATCH', `/api/tests/${testId}/questions/${questionId}`, { cookies: jar, body })
}

async function postQuestion(testId: string, body: Json, jar = adminJar) {
	return call(ctx, 'POST', `/api/tests/${testId}/questions`, { cookies: jar, body })
}

async function withFailingTrigger(table: 'answer_keys' | 'questions', condition: string, run: () => Promise<void>) {
	const name = `qcon_write_fail_${table}`
	await ctx.pgPool.query(
		`CREATE OR REPLACE FUNCTION qcon_write_fail() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'qcon write failure'; END $$ LANGUAGE plpgsql`
	)
	await ctx.pgPool.query(
		`CREATE TRIGGER ${name} BEFORE INSERT ON ${table} FOR EACH ROW WHEN (${condition}) EXECUTE FUNCTION qcon_write_fail()`
	)
	try {
		await run()
	} finally {
		await ctx.pgPool.query(`DROP TRIGGER IF EXISTS ${name} ON ${table}`)
	}
}

beforeAll(async () => {
	ctx = await startAuthApp('test_qcon_write')
	await seedUser(ctx, { login: 'qcon_write_admin', roles: ['admin'], password: PASSWORD })
	await seedUser(ctx, { login: 'qcon_write_student', roles: ['user'], password: PASSWORD })
	const admin = await login(ctx, 'qcon_write_admin', PASSWORD)
	assert.equal(admin.status, 200)
	adminJar = admin.jar
	const student = await login(ctx, 'qcon_write_student', PASSWORD)
	assert.equal(student.status, 200)
	studentJar = student.jar
	mem = await memoryStorage()
	qc = await import('./index.js')
	const topic = await call(ctx, 'POST', '/api/tests/topics', {
		cookies: adminJar,
		body: { slug: TOPIC_SLUG, title: 'Тема записи содержимого' },
	})
	assert.equal(topic.status, 201)
	topicId = (topic.body.topic as Json).id as string
}, 60_000)

afterEach(() => {
	mem?.clearFailures()
	vi.restoreAllMocks()
})

afterAll(async () => {
	await ctx?.stop()
})

describe('порядок: lockTest, resequenceQuestions, insertAt', () => {
	test('insertAt ставит id на позицию и ограничивает её границами', () => {
		assert.deepEqual(qc.insertAt(['a', 'b'], 'x', 0), ['x', 'a', 'b'])
		assert.deepEqual(qc.insertAt(['a', 'b'], 'x', 1), ['a', 'x', 'b'])
		assert.deepEqual(qc.insertAt(['a', 'b'], 'x', 9), ['a', 'b', 'x'])
		assert.deepEqual(qc.insertAt(['a', 'x', 'b'], 'x', -3), ['x', 'a', 'b'])
	})

	test('порядок [0, 5, 7] перенумеровывается в [0, 1, 2]', async () => {
		const testId = await saveTest(nextSlug('gaps'), [
			radio('Один', { order: 0 }),
			radio('Два', { order: 1 }),
			radio('Три', { order: 2 }),
		])
		const before = await questionRows(testId)
		await ctx.pgPool.query('UPDATE questions SET "order" = $2 WHERE id = $1', [before[1]?.id, 5])
		await ctx.pgPool.query('UPDATE questions SET "order" = $2 WHERE id = $1', [before[2]?.id, 7])
		await ctx.db.transaction(async (tx) => {
			await qc.lockTest(tx, testId)
			await qc.resequenceQuestions(tx, testId)
		})
		const after = await questionRows(testId)
		assert.deepEqual(
			after.map((row) => row.id),
			before.map((row) => row.id)
		)
		assert.deepEqual(
			after.map((row) => row.order),
			[0, 1, 2]
		)
	})

	test('дубли [1, 1, 2] получают 0, 1, 2 по (created_at, id)', async () => {
		const testId = await saveTest(nextSlug('dups'), [
			radio('Первый', { order: 0 }),
			radio('Второй', { order: 1 }),
			radio('Третий', { order: 2 }),
		])
		const [first, second, third] = await questionRows(testId)
		assert.ok(first && second && third)
		await ctx.pgPool.query(`UPDATE questions SET "order" = 1, created_at = now() - interval '1 minute' WHERE id = $1`, [
			first.id,
		])
		await ctx.pgPool.query(
			`UPDATE questions SET "order" = 1, created_at = now() - interval '2 minutes' WHERE id = $1`,
			[second.id]
		)
		await ctx.pgPool.query(`UPDATE questions SET "order" = 2 WHERE id = $1`, [third.id])
		await ctx.db.transaction((tx) => qc.resequenceQuestions(tx, testId))
		const after = await questionRows(testId)
		assert.deepEqual(
			after.map((row) => [row.id, row.order]),
			[
				[second.id, 0],
				[first.id, 1],
				[third.id, 2],
			]
		)
	})

	test('arrange с другим набором id отклоняется, порядок не меняется', async () => {
		const testId = await saveTest(nextSlug('arrange'), [radio('А', { order: 0 }), radio('Б', { order: 1 })])
		const before = await questionRows(testId)
		await assert.rejects(ctx.db.transaction((tx) => qc.resequenceQuestions(tx, testId, (ids) => [...ids, MISSING_ID])))
		assert.deepEqual(await questionRows(testId), before)
	})

	test('lockTest для несуществующего теста: 404 Test not found', async () => {
		await assert.rejects(
			ctx.db.transaction((tx) => qc.lockTest(tx, MISSING_ID)),
			(error: unknown) => {
				const failure = error as { statusCode?: unknown; message?: unknown }
				assert.equal(failure.statusCode, 404)
				assert.equal(failure.message, 'Test not found')
				return true
			}
		)
	})
})

describe('создание вопроса', () => {
	test('order 0 в тесте из двух вопросов: новый на 0, прежние на 1 и 2', async () => {
		const testId = await saveTest(nextSlug('first'), [radio('Первый', { order: 0 }), radio('Второй', { order: 1 })])
		const before = await questionRows(testId)
		const reply = await postQuestion(testId, radio('Новый', { order: 0 }))
		assert.equal(reply.status, 201)
		assert.deepEqual(reply.body, { ok: true, questionId: reply.body.questionId, order: 0 })
		const after = await questionRows(testId)
		assert.deepEqual(
			after.map((row) => [row.id, row.order]),
			[
				[reply.body.questionId, 0],
				[before[0]?.id, 1],
				[before[1]?.id, 2],
			]
		)
		const created = after[0]
		assert.match(created?.prompt_path ?? '', REVISION_PROMPT)
		assert.equal(stored(created?.prompt_path), 'Новый')
		assert.equal(await searchPrompt(String(reply.body.questionId)), 'Новый')
	})

	test('order больше числа вопросов: вопрос в конец', async () => {
		const testId = await saveTest(nextSlug('tail'), [radio('Первый', { order: 0 }), radio('Второй', { order: 1 })])
		const reply = await postQuestion(testId, radio('Хвост', { order: 40 }))
		assert.equal(reply.status, 201)
		assert.equal(reply.body.order, 2)
		const after = await questionRows(testId)
		assert.deepEqual(
			after.map((row) => row.order),
			[0, 1, 2]
		)
		assert.equal(after[2]?.id, reply.body.questionId)
	})

	test('параллельные POST дают порядок 0…n-1 без повторов', async () => {
		const testId = await saveTest(nextSlug('parallel'), [
			radio('Первый', { order: 0 }),
			radio('Второй', { order: 1 }),
			radio('Третий', { order: 2 }),
		])
		const replies = await Promise.all(
			Array.from({ length: PARALLEL_POSTS }, (_, index) => postQuestion(testId, radio(`Параллельный ${index + 1}`)))
		)
		for (const reply of replies) assert.equal(reply.status, 201)
		const after = await questionRows(testId)
		assert.deepEqual(
			after.map((row) => row.order),
			Array.from({ length: 3 + PARALLEL_POSTS }, (_, index) => index)
		)
		assert.deepEqual(
			replies.map((reply) => Number(reply.body.order)).sort((a, b) => a - b),
			[3, 4, 5, 6, 7, 8]
		)
		assert.equal(new Set(after.map((row) => row.id)).size, 3 + PARALLEL_POSTS)
	})

	test('сбой транзакции: объектов под префиксом нового вопроса нет, строки нет', async () => {
		const testSlug = nextSlug('create-fail')
		const testId = await saveTest(testSlug, [radio('Единственный', { order: 0 })])
		const keysBefore = mem.keys(`topics/${TOPIC_SLUG}/${testSlug}`)
		await withFailingTrigger('questions', `NEW.test_id = '${testId}'`, async () => {
			const reply = await postQuestion(testId, radio('Не сохранится', { order: 0, explanationText: 'Пояснение' }))
			assert.equal(reply.status, 500)
		})
		assert.deepEqual(mem.keys(`topics/${TOPIC_SLUG}/${testSlug}`), keysBefore)
		const rows = await questionRows(testId)
		assert.equal(rows.length, 1)
		assert.equal(rows[0]?.order, 0)
	})

	test('POST /api/tests/save не пишет settings.json', async () => {
		const testSlug = nextSlug('no-settings')
		await saveTest(testSlug, [radio('Без настроек', { order: 0 })])
		const keys = mem.keys(`topics/${TOPIC_SLUG}/${testSlug}`)
		assert.equal(
			keys.some((key) => key.endsWith('/settings.json')),
			false
		)
		assert.ok(keys.every((key) => REVISION_PROMPT.test(key)))
	})
})

describe('правка вопроса', () => {
	test('две правки подряд дают разные ключи ревизии, прежний промпт удалён', async () => {
		const testSlug = nextSlug('revisions')
		const testId = await saveTest(testSlug, [radio('Версия 0', { order: 0 })])
		const [row] = await questionRows(testId)
		assert.ok(row?.prompt_path)
		const first = await patchQuestion(testId, row.id, radio('Версия 1', { order: 0 }))
		assert.equal(first.status, 200)
		assert.deepEqual(first.body, { ok: true, questionId: row.id })
		const afterFirst = await questionRow(row.id)
		const second = await patchQuestion(testId, row.id, radio('Версия 2', { order: 0 }))
		assert.equal(second.status, 200)
		const afterSecond = await questionRow(row.id)
		assert.match(afterFirst?.prompt_path ?? '', REVISION_PROMPT)
		assert.match(afterSecond?.prompt_path ?? '', REVISION_PROMPT)
		assert.notEqual(afterFirst?.prompt_path, afterSecond?.prompt_path)
		assert.notEqual(row.prompt_path, afterFirst?.prompt_path)
		assert.equal(mem.get(row.prompt_path), null)
		assert.equal(mem.get(afterFirst?.prompt_path ?? ''), null)
		assert.equal(stored(afterSecond?.prompt_path), 'Версия 2')
		assert.deepEqual(mem.keys(questionDir(testSlug, row.id)), [afterSecond?.prompt_path])
		assert.equal(await searchPrompt(row.id), 'Версия 2')
	})

	test('правка с пустым explanationText: explanation_path = null, прежний объект пояснения удалён', async () => {
		const testSlug = nextSlug('drop-explanation')
		const testId = await saveTest(testSlug, [radio('С пояснением', { order: 0, explanationText: 'Старое пояснение' })])
		const [row] = await questionRows(testId)
		assert.ok(row?.explanation_path)
		assert.equal(stored(row.explanation_path), 'Старое пояснение')
		const reply = await patchQuestion(testId, row.id, radio('Без пояснения', { order: 0, explanationText: '' }))
		assert.equal(reply.status, 200)
		const after = await questionRow(row.id)
		assert.equal(after?.explanation_path, null)
		assert.equal(mem.get(row.explanation_path), null)
	})

	test('сбой транзакции: 500, новых prompt-*.md нет, строка, ключ ответа и документ поиска прежние', async () => {
		const testSlug = nextSlug('update-fail')
		const testId = await saveTest(testSlug, [radio('Прежний текст', { order: 0 })])
		const [row] = await questionRows(testId)
		assert.ok(row?.prompt_path)
		await withFailingTrigger('answer_keys', `NEW.question_id = '${row.id}'`, async () => {
			const reply = await patchQuestion(testId, row.id, radio('Новый текст', { order: 0, correct: 'c' }))
			assert.equal(reply.status, 500)
		})
		assert.deepEqual(mem.keys(questionDir(testSlug, row.id)), [row.prompt_path])
		assert.equal(stored(row.prompt_path), 'Прежний текст')
		const after = await questionRow(row.id)
		assert.equal(after?.prompt_path, row.prompt_path)
		assert.deepEqual(await keyRows(row.id), [{ version: 1, is_active: true, key: 'b' }])
		assert.equal(await searchPrompt(row.id), 'Прежний текст')
	})

	test('сбой удаления прежнего объекта после commit: 200, объект на месте, запись orphan в лог', async () => {
		const testSlug = nextSlug('orphan')
		const testId = await saveTest(testSlug, [radio('Останется сиротой', { order: 0 })])
		const [row] = await questionRows(testId)
		assert.ok(row?.prompt_path)
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
		mem.failOn({ op: 'remove', key: row.prompt_path })
		const reply = await patchQuestion(testId, row.id, radio('Новый после сироты', { order: 0 }))
		assert.equal(reply.status, 200)
		assert.equal(stored(row.prompt_path), 'Останется сиротой')
		const after = await questionRow(row.id)
		assert.equal(stored(after?.prompt_path), 'Новый после сироты')
		const logged = warn.mock.calls.find((args) => args[0] === ORPHAN_LOG)
		assert.ok(logged, 'console.warn orphan objects')
		assert.ok(Array.isArray(logged[1]) && (logged[1] as string[]).includes(row.prompt_path))
	})

	test('гонка с переименованием: 409, объекта правки нет, указатель и ключ ответа прежние', async () => {
		const testSlug = nextSlug('rename-race')
		const renamed = `${testSlug}-renamed`
		const testId = await saveTest(testSlug, [radio('До гонки', { order: 0 })])
		const [row] = await questionRows(testId)
		assert.ok(row?.prompt_path)
		const original = mem.write.bind(mem)
		let renamedOnce = false
		vi.spyOn(mem, 'write').mockImplementation(async (key, data, options) => {
			await original(key, data, options)
			if (!renamedOnce && REVISION_PROMPT.test(key)) {
				renamedOnce = true
				await ctx.pgPool.query('UPDATE tests SET slug = $2 WHERE id = $1', [testId, renamed])
			}
		})
		const reply = await patchQuestion(testId, row.id, radio('После гонки', { order: 0, correct: 'c' }))
		assert.equal(renamedOnce, true)
		assert.equal(reply.status, 409)
		assert.equal(reply.body.error, 'Содержимое изменилось, повторите')
		assert.deepEqual(mem.keys(questionDir(testSlug, row.id)), [row.prompt_path])
		assert.deepEqual(mem.keys(`topics/${TOPIC_SLUG}/${renamed}`), [])
		const after = await questionRow(row.id)
		assert.equal(after?.prompt_path, row.prompt_path)
		assert.deepEqual(await keyRows(row.id), [{ version: 1, is_active: true, key: 'b' }])
	})

	test('прежний указатель читается внутри транзакции: удаляется объект по новому значению', async () => {
		const testSlug = nextSlug('pointer-race')
		const testId = await saveTest(testSlug, [radio('Исходный', { order: 0 })])
		const [row] = await questionRows(testId)
		assert.ok(row?.prompt_path)
		const swapped = `${questionDir(testSlug, row.id)}/prompt-aaaaaaaaaaaa.md`
		mem.put(swapped, 'Подменённый', 'text/markdown')
		const original = mem.write.bind(mem)
		let swappedOnce = false
		vi.spyOn(mem, 'write').mockImplementation(async (key, data, options) => {
			await original(key, data, options)
			if (!swappedOnce && REVISION_PROMPT.test(key) && key !== swapped) {
				swappedOnce = true
				await ctx.pgPool.query('UPDATE questions SET prompt_path = $2 WHERE id = $1', [row.id, swapped])
			}
		})
		const reply = await patchQuestion(testId, row.id, radio('Итоговый', { order: 0 }))
		assert.equal(swappedOnce, true)
		assert.equal(reply.status, 200)
		assert.equal(mem.get(swapped), null)
		assert.equal(stored(row.prompt_path), 'Исходный')
		const after = await questionRow(row.id)
		assert.equal(stored(after?.prompt_path), 'Итоговый')
	})
})

describe('гонка одинакового slug при создании теста', () => {
	test('второй POST /save с тем же slug во время записи файлов первого: первый 409 «slug занят», не 500, его файлы удалены', async () => {
		const slug = nextSlug('dup')
		const original = mem.write.bind(mem)
		let fired = false
		let second: Awaited<ReturnType<typeof call>> | null = null
		vi.spyOn(mem, 'write').mockImplementation(async (key, data, options) => {
			await original(key, data, options)
			if (!fired) {
				fired = true
				second = await call(ctx, 'POST', '/api/tests/save', {
					cookies: adminJar,
					body: { topicId, title: `Тест ${slug}`, slug, isPublished: true, questions: [radio('Второй', { order: 0 })] },
				})
			}
		})
		const first = await call(ctx, 'POST', '/api/tests/save', {
			cookies: adminJar,
			body: { topicId, title: `Тест ${slug}`, slug, isPublished: true, questions: [radio('Первый', { order: 0 })] },
		})
		assert.equal(fired, true)
		assert.equal(second!.status, 201, JSON.stringify(second!.body))
		assert.equal(first.status, 409, JSON.stringify(first.body))
		assert.equal(first.body.error, 'Test with this slug already exists in this topic')
		const testId = (second!.body.test as Json).id as string
		const rows = await questionRows(testId)
		assert.equal(rows.length, 1)
		assert.equal(stored(rows[0]?.prompt_path), 'Второй')
		assert.deepEqual(
			mem.keys(`topics/${TOPIC_SLUG}/${slug}`).filter((key) => key !== rows[0]?.prompt_path),
			[]
		)
	})
})

describe('доступ к записи через scope.ts', () => {
	test('студент: /save, создание и правка вопроса → 403, в БД и хранилище ничего не меняется', async () => {
		const testSlug = nextSlug('student')
		const testId = await saveTest(testSlug, [radio('Только чтение', { order: 0 })])
		const [row] = await questionRows(testId)
		assert.ok(row)
		const keysBefore = mem.keys()
		const { rows: countsBefore } = await ctx.pgPool.query(
			'SELECT (SELECT count(*) FROM tests) AS tests, (SELECT count(*) FROM questions) AS questions, (SELECT count(*) FROM answer_keys) AS keys'
		)
		const attempts = [
			call(ctx, 'POST', '/api/tests/save', {
				cookies: studentJar,
				body: { topicId, title: 'Чужой', slug: nextSlug('student-save'), questions: [radio('x', { order: 0 })] },
			}),
			call(ctx, 'POST', '/api/tests/save', { cookies: studentJar, body: { nonsense: true } }),
			postQuestion(testId, radio('Попытка', { order: 0 }), studentJar),
			postQuestion(testId, { broken: true }, studentJar),
			postQuestion(MISSING_ID, radio('Попытка', { order: 0 }), studentJar),
			patchQuestion(testId, row.id, radio('Попытка', { order: 0 }), studentJar),
			patchQuestion(testId, row.id, { broken: true }, studentJar),
			patchQuestion(MISSING_ID, MISSING_ID, radio('Попытка', { order: 0 }), studentJar),
		]
		for (const reply of await Promise.all(attempts)) {
			assert.equal(reply.status, 403)
			assert.equal(reply.body.error, 'Forbidden')
		}
		const { rows: countsAfter } = await ctx.pgPool.query(
			'SELECT (SELECT count(*) FROM tests) AS tests, (SELECT count(*) FROM questions) AS questions, (SELECT count(*) FROM answer_keys) AS keys'
		)
		assert.deepEqual(countsAfter, countsBefore)
		assert.deepEqual(mem.keys(), keysBefore)
		assert.equal((await questionRow(row.id))?.prompt_path, row.prompt_path)
	})
})

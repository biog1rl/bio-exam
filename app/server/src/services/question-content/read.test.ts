import assert from 'node:assert/strict'
import { afterAll, afterEach, beforeAll, describe, test } from 'vitest'

import { call, login, seedUser, startAuthApp, type AuthApp, type CookieJar } from '../../test-support/auth-app.js'
import { memoryStorage } from '../../test-support/storage.js'
import type { MemoryStorageAdapter } from '../storage/adapters/memory.js'

type QuestionContentModule = typeof import('./index.js')

type Json = Record<string, unknown>

const PASSWORD = 'qcon-read-password-1'
const TOPIC_SLUG = 'qcon-read-topic'
const TEST_SLUG = 'qcon-read-test'
const MISSING_ID = '00000000-0000-4000-8000-000000000000'

let ctx: AuthApp
let mem: MemoryStorageAdapter
let qc: QuestionContentModule
let adminJar: CookieJar
let studentJar: CookieJar
let testId = ''

async function expectRejection(promise: Promise<unknown>, status: number, message: string): Promise<void> {
	await assert.rejects(promise, (error: unknown) => {
		const failure = error as { statusCode?: unknown; message?: unknown }
		assert.equal(failure.statusCode, status)
		assert.equal(failure.message, message)
		return true
	})
}

beforeAll(async () => {
	ctx = await startAuthApp('test_qcon_read')
	await seedUser(ctx, { login: 'qcon_read_admin', roles: ['admin'], password: PASSWORD })
	await seedUser(ctx, { login: 'qcon_read_student', roles: ['user'], password: PASSWORD })
	const admin = await login(ctx, 'qcon_read_admin', PASSWORD)
	assert.equal(admin.status, 200)
	adminJar = admin.jar
	const student = await login(ctx, 'qcon_read_student', PASSWORD)
	assert.equal(student.status, 200)
	studentJar = student.jar
	mem = await memoryStorage()
	qc = await import('./index.js')
	const topic = await call(ctx, 'POST', '/api/tests/topics', {
		cookies: adminJar,
		body: { slug: TOPIC_SLUG, title: 'Тема чтения содержимого' },
	})
	assert.equal(topic.status, 201)
	const topicId = (topic.body.topic as Json).id
	const saved = await call(ctx, 'POST', '/api/tests/save', {
		cookies: adminJar,
		body: {
			topicId,
			title: 'Тест чтения содержимого',
			slug: TEST_SLUG,
			isPublished: true,
			questions: [
				{
					type: 'radio',
					promptText: 'Первый промпт',
					options: [
						{ id: 'a', text: 'Да' },
						{ id: 'b', text: 'Нет' },
					],
					correct: 'a',
					points: 1,
					order: 0,
				},
				{
					type: 'radio',
					promptText: 'Второй промпт',
					explanationText: 'Пояснение второго',
					options: [
						{ id: 'a', text: 'Да' },
						{ id: 'b', text: 'Нет' },
					],
					correct: 'b',
					points: 2,
					order: 1,
				},
			],
		},
	})
	assert.equal(saved.status, 201)
	testId = (saved.body.test as Json).id as string
}, 60_000)

afterEach(() => {
	mem?.clearFailures()
})

afterAll(async () => {
	await ctx?.stop()
})

describe('questionMarkdownCandidates', () => {
	test('сохранённый путь равен каноническому: 4 уникальных кандидата в прежнем порядке', () => {
		const canonical = 'topics/t/s/questions/q1/prompt.md'
		assert.deepEqual(
			qc.questionMarkdownCandidates({
				storedPath: canonical,
				topicSlug: 't',
				testSlug: 's',
				testId: 'tid',
				questionId: 'q1',
				fileName: 'prompt.md',
			}),
			[
				canonical,
				'topics/t/s/questions/tid/prompt.md',
				'topics/t/tid/questions/q1/prompt.md',
				'topics/t/tid/questions/tid/prompt.md',
			]
		)
	})

	test('префиксы темы, теста и вопроса', () => {
		assert.equal(qc.topicPrefix('t'), 'topics/t')
		assert.equal(qc.testPrefix('t', 's'), 'topics/t/s')
		assert.equal(qc.questionPrefix('t', 's', 'q1'), 'topics/t/s/questions/q1')
	})
})

describe('readFirstMarkdown', () => {
	const base = 'topics/qcon-read-first/s/questions'

	test('пропускает отсутствующий объект и пробельный текст, отдаёт первый непустой', async () => {
		mem.put(`${base}/blank/prompt.md`, '  ')
		mem.put(`${base}/text/prompt.md`, 'Текст')
		const content = await qc.readFirstMarkdown([
			`${base}/absent/prompt.md`,
			`${base}/blank/prompt.md`,
			`${base}/text/prompt.md`,
		])
		assert.equal(content, 'Текст')
	})

	test('ни одного кандидата нет: пустая строка', async () => {
		assert.equal(await qc.readFirstMarkdown([`${base}/none-1/prompt.md`, `${base}/none-2/prompt.md`]), '')
		assert.equal(await qc.readFirstMarkdown([]), '')
	})

	test('ключ вне пространства имён пропускается', async () => {
		mem.put(`${base}/after-bad/prompt.md`, 'После плохого ключа')
		assert.equal(await qc.readFirstMarkdown(['main/x.md']), '')
		assert.equal(await qc.readFirstMarkdown(['main/x.md', `${base}/after-bad/prompt.md`]), 'После плохого ключа')
	})

	test('сбой чтения хранилища пробрасывается как StorageUnavailableError', async () => {
		mem.put(`${base}/outage/prompt.md`, 'Недоступно')
		mem.failOn({ op: 'read', prefix: 'topics' })
		await assert.rejects(qc.readFirstMarkdown([`${base}/outage/prompt.md`]), (error: unknown) => {
			const failure = error as { name?: unknown; statusCode?: unknown }
			assert.equal(failure.name, 'StorageUnavailableError')
			assert.equal(failure.statusCode, 503)
			return true
		})
	})

	test('readQuestionMarkdown читает пояснение по запасному пути', async () => {
		mem.put('topics/qcon-read-first/tid/questions/q9/explanation.md', 'Пояснение по старому пути')
		const content = await qc.readQuestionMarkdown({
			storedPath: null,
			topicSlug: 'qcon-read-first',
			testSlug: 's',
			testId: 'tid',
			questionId: 'q9',
			kind: 'explanation',
		})
		assert.equal(content, 'Пояснение по старому пути')
	})
})

describe('readAdminTest', () => {
	test('по slug и по id одинаковый массив questions', async () => {
		const bySlug = await qc.readAdminTest({ topicSlug: TOPIC_SLUG, testSlug: TEST_SLUG })
		const byId = await qc.readAdminTest({ testId })
		assert.ok('questions' in bySlug && 'questions' in byId)
		assert.deepEqual(bySlug.questions, byId.questions)
		assert.deepEqual(
			byId.questions.map((q) => ({ promptText: q.promptText, explanationText: q.explanationText, correct: q.correct })),
			[
				{ promptText: 'Первый промпт', explanationText: '', correct: 'a' },
				{ promptText: 'Второй промпт', explanationText: 'Пояснение второго', correct: 'b' },
			]
		)
		assert.equal(bySlug.test.topicSlug, TOPIC_SLUG)
		assert.equal(byId.test.topicSlug, TOPIC_SLUG)
	})

	test('view summary: тест и число вопросов', async () => {
		const summary = await qc.readAdminTest({ topicSlug: TOPIC_SLUG, testSlug: TEST_SLUG }, { view: 'summary' })
		assert.ok('questionsCount' in summary)
		assert.equal(summary.questionsCount, 2)
		assert.equal(summary.test.id, testId)
		assert.equal('questions' in summary, false)
	})

	test('нет темы или теста: 404 с прежними текстами', async () => {
		await expectRejection(
			qc.readAdminTest({ topicSlug: 'qcon-read-absent', testSlug: TEST_SLUG }),
			404,
			'Topic not found'
		)
		await expectRejection(
			qc.readAdminTest({ topicSlug: TOPIC_SLUG, testSlug: 'qcon-read-absent' }),
			404,
			'Test not found'
		)
		await expectRejection(qc.readAdminTest({ testId: MISSING_ID }), 404, 'Test not found')
	})

	test('canRead отказывает после поиска теста: 403 Forbidden', async () => {
		const seen: string[] = []
		await expectRejection(
			qc.readAdminTest(
				{ topicSlug: TOPIC_SLUG, testSlug: TEST_SLUG },
				{
					canRead: async (id) => {
						seen.push(id)
						return false
					},
				}
			),
			403,
			'Forbidden'
		)
		assert.deepEqual(seen, [testId])
	})

	test('сбой чтения хранилища пробрасывается', async () => {
		mem.failOn({ op: 'read', prefix: 'topics' })
		await assert.rejects(qc.readAdminTest({ testId }), (error: unknown) => {
			assert.equal((error as { statusCode?: unknown }).statusCode, 503)
			return true
		})
	})
})

describe('доступ к чтению администратора через маршруты', () => {
	test('студент: GET /api/tests/:id → 403', async () => {
		const reply = await call(ctx, 'GET', `/api/tests/${testId}`, { cookies: studentJar })
		assert.equal(reply.status, 403)
		assert.equal(reply.body.error, 'Forbidden')
	})

	test('студент: by-slug → 403 для существующего и несуществующего теста', async () => {
		for (const path of [
			`/api/tests/by-slug/${TOPIC_SLUG}/${TEST_SLUG}`,
			'/api/tests/by-slug/qcon-read-absent/nothing',
		]) {
			const reply = await call(ctx, 'GET', path, { cookies: studentJar })
			assert.equal(reply.status, 403)
			assert.equal(reply.body.error, 'Forbidden')
		}
	})

	test('администратор: оба маршрута → 200', async () => {
		const byId = await call(ctx, 'GET', `/api/tests/${testId}`, { cookies: adminJar })
		const bySlug = await call(ctx, 'GET', `/api/tests/by-slug/${TOPIC_SLUG}/${TEST_SLUG}`, { cookies: adminJar })
		assert.equal(byId.status, 200)
		assert.equal(bySlug.status, 200)
		assert.deepEqual(byId.body.questions, bySlug.body.questions)
	})
})

import { minOptionsMessage } from '@bio-exam/exam-core'

import { and, count, eq, type SQL } from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { afterAll, beforeAll, describe, test, vi } from 'vitest'

import { sessionCookieFor, startTestServer } from '../../test-support/http.js'
import {
	createScratchDatabase,
	migrateTestDatabase,
	requireTestDatabaseUrl,
	type ScratchDatabase,
} from '../../test-support/test-database.js'

const files = vi.hoisted(() => new Map<string, string>())

vi.mock('../../services/storage/storage.js', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../../services/storage/storage.js')>()
	const fake = Object.create(actual.storageService) as typeof actual.storageService
	fake.isConfigured = () => true
	fake.writeFile = async (path: string, content: string) => {
		files.set(path, content)
	}
	fake.writeJson = async (path: string, data: unknown) => {
		files.set(path, JSON.stringify(data))
	}
	fake.readFile = async (path: string) => files.get(path) ?? ''
	fake.deleteFiles = async (paths: string[]) => {
		for (const path of paths) files.delete(path)
	}
	fake.moveDirectory = async () => {}
	fake.listFiles = async () => []
	return { ...actual, storageService: fake }
})

type DbModule = typeof import('../../db/index.js')
type SchemaModule = typeof import('../../db/schema.js')
type Json = Record<string, unknown>
type Reply = { status: number; body: Json }
type ResultItem = {
	questionId: string
	isCorrect: boolean
	points: number
	earnedPoints: number
	userAnswer: unknown
	correctAnswer: unknown
}

let scratch: ScratchDatabase | null = null
let previousTestDatabaseUrl: string | undefined
let server: { baseUrl: string; close: () => Promise<void> } | null = null
let dbModule: DbModule
let schema: SchemaModule
let topicId = ''
let adminCookie = ''
let studentCookie = ''
let studentId = ''

beforeAll(async () => {
	requireTestDatabaseUrl()
	scratch = await createScratchDatabase('test_exam_flow')
	await migrateTestDatabase(scratch.url)
	previousTestDatabaseUrl = process.env.TEST_DATABASE_URL
	process.env.TEST_DATABASE_URL = scratch.url
	vi.resetModules()
	const app = (await import('../../app.js')).default
	dbModule = await import('../../db/index.js')
	schema = await import('../../db/schema.js')
	const { db } = dbModule

	await db
		.insert(schema.roles)
		.values([{ key: 'admin' }, { key: 'user' }])
		.onConflictDoNothing()
	const [admin] = await db
		.insert(schema.users)
		.values({ login: 'exam_flow_admin', isActive: true })
		.returning({ id: schema.users.id })
	assert.ok(admin)
	const [student] = await db
		.insert(schema.users)
		.values({ login: 'exam_flow_student', isActive: true })
		.returning({ id: schema.users.id })
	assert.ok(student)
	studentId = student.id
	await db.insert(schema.userRoles).values([
		{ userId: admin.id, roleKey: 'admin' },
		{ userId: student.id, roleKey: 'user' },
	])
	const [topic] = await db
		.insert(schema.topics)
		.values({ slug: 'exam-flow', title: 'Экзамен' })
		.returning({ id: schema.topics.id })
	assert.ok(topic)
	topicId = topic.id

	server = await startTestServer(app)
	adminCookie = sessionCookieFor({ id: admin.id, roles: ['admin'] })
	studentCookie = sessionCookieFor({ id: student.id, roles: ['user'] })
}, 60_000)

afterAll(async () => {
	await server?.close()
	await dbModule?.pgPool.end()
	await scratch?.drop()
	if (previousTestDatabaseUrl === undefined) delete process.env.TEST_DATABASE_URL
	else process.env.TEST_DATABASE_URL = previousTestDatabaseUrl
})

function baseUrl(): string {
	assert.ok(server, 'test server is not running')
	return server.baseUrl
}

async function request(method: string, path: string, body: unknown, cookie: string): Promise<Reply> {
	const res = await fetch(`${baseUrl()}${path}`, {
		method,
		headers: { cookie, 'content-type': 'application/json' },
		body: body === undefined ? undefined : JSON.stringify(body),
	})
	const text = await res.text()
	let parsed: Json
	try {
		parsed = JSON.parse(text) as Json
	} catch {
		parsed = { raw: text }
	}
	return { status: res.status, body: parsed }
}

async function countRows(table: PgTable, where: SQL | undefined): Promise<number> {
	const [row] = await dbModule.db.select({ value: count() }).from(table).where(where)
	return Number(row?.value ?? 0)
}

let testCounter = 0

async function createTest(options: { showCorrectAnswer?: boolean } = {}): Promise<string> {
	testCounter += 1
	const [created] = await dbModule.db
		.insert(schema.tests)
		.values({
			topicId,
			slug: `exam-flow-${testCounter}`,
			title: `Экзамен ${testCounter}`,
			isPublished: true,
			showCorrectAnswer: options.showCorrectAnswer ?? true,
		})
		.returning({ id: schema.tests.id })
	assert.ok(created)
	return created.id
}

async function createQuestion(testId: string, payload: Json): Promise<string> {
	const reply = await request('POST', `/api/tests/${testId}/questions`, payload, adminCookie)
	assert.equal(reply.status, 201)
	assert.equal(typeof reply.body.questionId, 'string')
	return reply.body.questionId as string
}

async function submit(testId: string, payload: Json): Promise<Reply> {
	return request('POST', `/api/tests/public/tests/${testId}/submit`, payload, studentCookie)
}

function findResult(body: Json, questionId: string): ResultItem {
	assert.ok(Array.isArray(body.results))
	const found = (body.results as ResultItem[]).find((item) => item.questionId === questionId)
	assert.ok(found, `no result for ${questionId}`)
	return found
}

type KeyRow = { version: number; is_active: boolean; kind: string; key: string }

async function keyRows(questionId: string): Promise<KeyRow[]> {
	const { rows } = await dbModule.pgPool.query<KeyRow>(
		"SELECT version, is_active, jsonb_typeof(correct_answer) AS kind, correct_answer #>> '{}' AS key FROM answer_keys WHERE question_id = $1 ORDER BY version",
		[questionId]
	)
	return rows
}

async function questionCount(testId: string): Promise<number> {
	return countRows(schema.questions, eq(schema.questions.testId, testId))
}

const OPTIONS = [
	{ id: 'a', text: 'Митоз' },
	{ id: 'b', text: 'Мейоз' },
	{ id: 'c', text: 'Амитоз' },
]

const MATCHING_PAIRS = {
	left: [
		{ id: 'l1', text: 'Хлоропласт' },
		{ id: 'l2', text: 'Митохондрия' },
		{ id: 'l3', text: 'Рибосома' },
	],
	right: [
		{ id: 'r1', text: 'Фотосинтез' },
		{ id: 'r2', text: 'Дыхание' },
		{ id: 'r3', text: 'Синтез белка' },
	],
}

const VALID_QUESTIONS: Record<string, Json> = {
	radio: { type: 'radio', promptText: 'Как делится соматическая клетка?', options: OPTIONS, correct: 'b' },
	checkbox: { type: 'checkbox', promptText: 'Выберите способы деления', options: OPTIONS, correct: ['a', 'c'] },
	matching: {
		type: 'matching',
		promptText: 'Сопоставьте органоид и функцию',
		matchingPairs: MATCHING_PAIRS,
		correct: { l1: 'r1', l2: 'r2', l3: 'r3' },
	},
	short_answer: { type: 'short_answer', promptText: 'Назовите деление соматической клетки', correct: 'Митоз' },
	short_answer_variants: {
		type: 'short_answer_variants',
		promptText: 'Назовите метод исследования',
		correct: ['эксперимент', 'моделирование'],
	},
	sequence: { type: 'sequence', promptText: 'Расположите стадии по порядку', correct: '2314' },
}

function validQuestion(type: string, overrides: Json = {}): Json {
	const base = VALID_QUESTIONS[type]
	assert.ok(base, `no valid payload for ${type}`)
	return { ...base, points: 1, ...overrides }
}

function optionsOf(size: number): Array<{ id: string; text: string }> {
	return Array.from({ length: size }, (_, index) => ({ id: `o${index + 1}`, text: `Вариант ${index + 1}` }))
}

function correctOf(size: number): string[] {
	return Array.from({ length: size }, (_, index) => `o${index + 1}`)
}

const D13_EMPTY_OPTION_TEXT: Json = {
	options: [
		{ id: 'a', text: '' },
		{ id: 'b', text: 'Мейоз' },
		{ id: 'c', text: 'Амитоз' },
	],
}

const D13_BLANK_LEFT_ITEM: Json = {
	matchingPairs: {
		left: [{ id: 'l1', text: '  ' }, ...MATCHING_PAIRS.left.slice(1)],
		right: MATCHING_PAIRS.right,
	},
}

const D13_BLANK_PROMPT: Json = { promptText: '   ' }

describe('сквозной путь через app.ts', () => {
	test('последовательность: сохранение, submit и сохранённый результат', async () => {
		const testId = await createTest()
		const questionId = await createQuestion(testId, {
			type: 'sequence',
			promptText: 'Расположите стадии митоза по порядку',
			correct: '2314',
			points: 2,
			order: 0,
		})
		assert.equal(
			await countRows(
				schema.answerKeys,
				and(eq(schema.answerKeys.questionId, questionId), eq(schema.answerKeys.isActive, true))
			),
			1
		)

		const reply = await submit(testId, { answers: { [questionId]: '2314' } })
		assert.equal(reply.status, 200)
		const result = findResult(reply.body, questionId)
		assert.equal(result.isCorrect, true)
		assert.equal(result.earnedPoints, 2)
		assert.equal(result.points, 2)
		assert.equal(result.correctAnswer, null)

		const attempts = await dbModule.db
			.select({ id: schema.testAttempts.id, results: schema.testAttempts.results })
			.from(schema.testAttempts)
			.where(and(eq(schema.testAttempts.testId, testId), eq(schema.testAttempts.userId, studentId)))
		assert.equal(attempts.length, 1)
		const [attempt] = attempts
		assert.ok(attempt)
		assert.equal(attempt.id, reply.body.attemptId)
		const stored = findResult({ results: attempt.results }, questionId)
		assert.equal(stored.earnedPoints, 2)
		assert.equal(stored.isCorrect, true)
	})
})

describe('POST /api/tests/:id/questions: успешное сохранение', () => {
	const cases = [
		{ type: 'radio', kind: 'string' },
		{ type: 'checkbox', kind: 'array' },
		{ type: 'matching', kind: 'object' },
		{ type: 'short_answer', kind: 'string' },
		{ type: 'short_answer_variants', kind: 'array' },
		{ type: 'sequence', kind: 'string' },
	]
	let testId = ''

	beforeAll(async () => {
		testId = await createTest()
	})

	for (const item of cases) {
		test(`${item.type}: 201, одна активная строка answer_keys, jsonb_typeof ключа ${item.kind}`, async () => {
			const before = await questionCount(testId)
			const questionId = await createQuestion(testId, validQuestion(item.type))
			assert.equal(await questionCount(testId), before + 1)
			const rows = await keyRows(questionId)
			assert.equal(rows.length, 1)
			const [row] = rows
			assert.ok(row)
			assert.equal(row.is_active, true)
			assert.equal(row.kind, item.kind)
		})
	}
})

describe('POST /api/tests/:id/questions: отказы', () => {
	const cases: Array<{ name: string; payload: Json }> = [
		{ name: 'radio с ключом вне вариантов', payload: validQuestion('radio', { correct: 'z' }) },
		{ name: 'radio с одним вариантом', payload: validQuestion('radio', { options: [OPTIONS[0]], correct: 'a' }) },
		{ name: 'checkbox с пустым ключом', payload: validQuestion('checkbox', { correct: [] }) },
		{
			name: 'matching без пары для одного левого элемента',
			payload: validQuestion('matching', { correct: { l1: 'r1', l2: 'r2' } }),
		},
		{ name: "short_answer с ключом ''", payload: validQuestion('short_answer', { correct: '' }) },
		{
			name: 'short_answer_variants со строковым ключом',
			payload: validQuestion('short_answer_variants', { correct: 'эксперимент' }),
		},
		{
			name: 'short_answer_variants с повтором после нормализации',
			payload: validQuestion('short_answer_variants', { correct: ['Митоз', ' митоз'] }),
		},
		{ name: "sequence с ключом '12a4'", payload: validQuestion('sequence', { correct: '12a4' }) },
		{ name: 'неизвестный ключ типа no_such_type', payload: validQuestion('sequence', { type: 'no_such_type' }) },
	]
	let testId = ''

	beforeAll(async () => {
		testId = await createTest()
	})

	for (const item of cases) {
		test(`${item.name}: 400, строк questions не прибавилось`, async () => {
			const before = await questionCount(testId)
			const reply = await request('POST', `/api/tests/${testId}/questions`, item.payload, adminCookie)
			assert.equal(reply.status, 400)
			assert.equal(await questionCount(testId), before)
		})
	}

	test("radio с одним вариантом и ключом '': 400 с первой ошибкой по порядку пакета", async () => {
		const before = await questionCount(testId)
		const payload = validQuestion('radio', { options: [OPTIONS[0]], correct: '' })
		const reply = await request('POST', `/api/tests/${testId}/questions`, payload, adminCookie)
		assert.equal(reply.status, 400)
		assert.equal(reply.body.error, minOptionsMessage(2))
		assert.equal(await questionCount(testId), before)
	})
})

describe('пользовательский тип custom_multi_3 с validationSchema', () => {
	const scoringRule = {
		formula: 'one_mistake_partial',
		mistakeMetric: 'set_distance',
		correctPoints: 2,
		oneMistakePoints: 1,
	}
	const cases = [
		{ options: 2, correct: 2, status: 400 },
		{ options: 3, correct: 3, status: 201 },
		{ options: 4, correct: 3, status: 201 },
		{ options: 5, correct: 3, status: 400 },
		{ options: 3, correct: 2, status: 400 },
		{ options: 4, correct: 4, status: 400 },
	]
	let testId = ''

	beforeAll(async () => {
		const reply = await request(
			'POST',
			'/api/tests/question-types',
			{
				key: 'custom_multi_3',
				title: 'Три верных из трёх-четырёх',
				uiTemplate: 'multi_choice',
				validationSchema: { minOptions: 3, maxOptions: 4, exactChoiceCount: 3 },
				scoringRule,
			},
			adminCookie
		)
		assert.equal(reply.status, 201)
		testId = await createTest()
	})

	test('тип с exactChoiceCount меньше minOptions не создаётся: 400, строки question_types нет', async () => {
		const reply = await request(
			'POST',
			'/api/tests/question-types',
			{
				key: 'custom_multi_2',
				title: 'Два верных из трёх-четырёх',
				uiTemplate: 'multi_choice',
				validationSchema: { minOptions: 3, maxOptions: 4, exactChoiceCount: 2 },
				scoringRule,
			},
			adminCookie
		)
		assert.equal(reply.status, 400)
		assert.equal(await countRows(schema.questionTypes, eq(schema.questionTypes.key, 'custom_multi_2')), 0)
	})

	for (const item of cases) {
		test(`${item.options} вариантов и ${item.correct} верных: ${item.status}`, async () => {
			const before = await questionCount(testId)
			const reply = await request(
				'POST',
				`/api/tests/${testId}/questions`,
				{
					type: 'custom_multi_3',
					promptText: 'Выберите три верных утверждения',
					options: optionsOf(item.options),
					correct: correctOf(item.correct),
				},
				adminCookie
			)
			assert.equal(reply.status, item.status)
			assert.equal(await questionCount(testId), item.status === 201 ? before + 1 : before)
		})
	}
})

describe('правила, которые меняет D-13', () => {
	let testId = ''

	beforeAll(async () => {
		testId = await createTest()
	})

	test('D-13: radio с пустым текстом одного варианта: 400, строк questions не прибавилось', async () => {
		const before = await questionCount(testId)
		const payload = validQuestion('radio', {
			options: [
				{ id: 'a', text: '' },
				{ id: 'b', text: 'Мейоз' },
				{ id: 'c', text: 'Амитоз' },
			],
		})
		const reply = await request('POST', `/api/tests/${testId}/questions`, payload, adminCookie)
		assert.equal(reply.status, 400)
		assert.equal(await questionCount(testId), before)
	})

	test('D-13: matching с текстом левого элемента из пробелов: 400, строк questions не прибавилось', async () => {
		const before = await questionCount(testId)
		const payload = validQuestion('matching', {
			matchingPairs: {
				left: [{ id: 'l1', text: '  ' }, ...MATCHING_PAIRS.left.slice(1)],
				right: MATCHING_PAIRS.right,
			},
		})
		const reply = await request('POST', `/api/tests/${testId}/questions`, payload, adminCookie)
		assert.equal(reply.status, 400)
		assert.equal(await questionCount(testId), before)
	})

	test('D-13: формулировка из одних пробелов: 400, строк questions не прибавилось', async () => {
		const before = await questionCount(testId)
		const payload = validQuestion('sequence', { promptText: '   ' })
		const reply = await request('POST', `/api/tests/${testId}/questions`, payload, adminCookie)
		assert.equal(reply.status, 400)
		assert.equal(await questionCount(testId), before)
	})
})

describe('PATCH /api/tests/:id/questions/:questionId', () => {
	let testId = ''

	beforeAll(async () => {
		testId = await createTest()
	})

	test("правка ключа sequence '2314' → '4321': 200, новая активная версия, прежняя неактивна", async () => {
		const questionId = await createQuestion(testId, validQuestion('sequence'))
		const reply = await request(
			'PATCH',
			`/api/tests/${testId}/questions/${questionId}`,
			validQuestion('sequence', { correct: '4321' }),
			adminCookie
		)
		assert.equal(reply.status, 200)
		assert.equal(reply.body.ok, true)
		assert.equal(reply.body.questionId, questionId)
		const rows = await keyRows(questionId)
		assert.deepEqual(
			rows.map((row) => ({ version: row.version, isActive: row.is_active, key: row.key })),
			[
				{ version: 1, isActive: false, key: '2314' },
				{ version: 2, isActive: true, key: '4321' },
			]
		)
	})

	async function expectPatchRejected(type: string, bad: Json): Promise<void> {
		const questionId = await createQuestion(testId, validQuestion(type))
		const before = await keyRows(questionId)
		assert.equal(before.length, 1)
		const reply = await request(
			'PATCH',
			`/api/tests/${testId}/questions/${questionId}`,
			validQuestion(type, bad),
			adminCookie
		)
		assert.equal(reply.status, 400)
		assert.deepEqual(await keyRows(questionId), before)
	}

	test('D-13 PATCH: radio с пустым текстом одного варианта: 400, активный ключ не изменился', async () => {
		await expectPatchRejected('radio', D13_EMPTY_OPTION_TEXT)
	})

	test('D-13 PATCH: matching с текстом левого элемента из пробелов: 400, активный ключ не изменился', async () => {
		await expectPatchRejected('matching', D13_BLANK_LEFT_ITEM)
	})

	test('D-13 PATCH: формулировка из одних пробелов: 400, активный ключ не изменился', async () => {
		await expectPatchRejected('sequence', D13_BLANK_PROMPT)
	})

	test("некорректная правка ключа '12a4': 400, активный ключ не изменился", async () => {
		const questionId = await createQuestion(testId, validQuestion('sequence'))
		const reply = await request(
			'PATCH',
			`/api/tests/${testId}/questions/${questionId}`,
			validQuestion('sequence', { correct: '12a4' }),
			adminCookie
		)
		assert.equal(reply.status, 400)
		const rows = await keyRows(questionId)
		assert.deepEqual(
			rows.map((row) => ({ version: row.version, isActive: row.is_active, key: row.key })),
			[{ version: 1, isActive: true, key: '2314' }]
		)
	})
})

describe('POST /api/tests/save', () => {
	const TYPES = ['radio', 'checkbox', 'matching', 'short_answer', 'short_answer_variants', 'sequence']

	function savePayload(slug: string, questions: Json[]): Json {
		return {
			topicId,
			title: `Сохранение ${slug}`,
			slug,
			isPublished: true,
			showCorrectAnswer: true,
			questions,
		}
	}

	function validQuestions(): Json[] {
		return TYPES.map((type, index) => validQuestion(type, { order: index }))
	}

	async function testIdBySlug(slug: string): Promise<string | null> {
		const [row] = await dbModule.db
			.select({ id: schema.tests.id })
			.from(schema.tests)
			.where(and(eq(schema.tests.topicId, topicId), eq(schema.tests.slug, slug)))
		return row?.id ?? null
	}

	test('новый тест с шестью корректными вопросами: 201, шесть вопросов и шесть активных ключей', async () => {
		const reply = await request('POST', '/api/tests/save', savePayload('save-ok', validQuestions()), adminCookie)
		assert.equal(reply.status, 201)
		const testId = await testIdBySlug('save-ok')
		assert.ok(testId)
		assert.equal(await questionCount(testId), 6)
		const { rows } = await dbModule.pgPool.query<{ total: number }>(
			'SELECT count(*)::int AS total FROM answer_keys ak JOIN questions q ON q.id = ak.question_id WHERE q.test_id = $1 AND ak.is_active',
			[testId]
		)
		assert.equal(rows[0]?.total, 6)
	})

	async function expectSaveRejected(slug: string, type: string, bad: Json): Promise<void> {
		const questions = validQuestions()
		const index = TYPES.indexOf(type)
		assert.ok(index >= 0)
		questions[index] = { ...questions[index], ...bad }
		const reply = await request('POST', '/api/tests/save', savePayload(slug, questions), adminCookie)
		assert.equal(reply.status, 400)
		assert.equal(await testIdBySlug(slug), null)
	}

	test('D-13 /save: radio с пустым текстом одного варианта: 400, теста нет', async () => {
		await expectSaveRejected('save-d13-option', 'radio', D13_EMPTY_OPTION_TEXT)
	})

	test('D-13 /save: matching с текстом левого элемента из пробелов: 400, теста нет', async () => {
		await expectSaveRejected('save-d13-matching', 'matching', D13_BLANK_LEFT_ITEM)
	})

	test('D-13 /save: формулировка из одних пробелов: 400, теста нет', async () => {
		await expectSaveRejected('save-d13-prompt', 'sequence', D13_BLANK_PROMPT)
	})

	const rejected = [
		{ name: "sequence с ключом '12a4'", slug: 'save-bad-key', bad: { type: 'sequence', correct: '12a4' } },
		{ name: 'неизвестный ключ типа no_such_type', slug: 'save-bad-type', bad: { type: 'no_such_type' } },
	]

	for (const item of rejected) {
		test(`тот же набор с одним некорректным вопросом (${item.name}): 400, теста нет`, async () => {
			const questions = validQuestions()
			questions[5] = { ...questions[5], ...item.bad }
			const reply = await request('POST', '/api/tests/save', savePayload(item.slug, questions), adminCookie)
			assert.equal(reply.status, 400)
			assert.equal(await testIdBySlug(item.slug), null)
		})
	}
})

describe('оценка submit по шаблонам', () => {
	const ids: Record<string, string> = {}
	let testId = ''

	beforeAll(async () => {
		testId = await createTest()
		const payloads: Record<string, Json> = {
			radio: validQuestion('radio'),
			checkbox: validQuestion('checkbox'),
			matching: validQuestion('matching'),
			short_answer: validQuestion('short_answer'),
			short_answer_variants: validQuestion('short_answer_variants'),
			sequence: validQuestion('sequence'),
			sequence1243: validQuestion('sequence', { correct: '1243' }),
			sequence123: validQuestion('sequence', { correct: '123' }),
			sequence3142: validQuestion('sequence', { correct: '3142' }),
		}
		for (const [name, payload] of Object.entries(payloads)) {
			ids[name] = await createQuestion(testId, payload)
		}
	})

	function idOf(name: string): string {
		const id = ids[name]
		assert.ok(id, `no question ${name}`)
		return id
	}

	const cases: Array<{
		name: string
		question: string
		answer: unknown
		earned: number
		points: number
		isCorrect: boolean
	}> = [
		{ name: "radio: верный 'b'", question: 'radio', answer: 'b', earned: 1, points: 1, isCorrect: true },
		{ name: 'checkbox: a и c', question: 'checkbox', answer: ['a', 'c'], earned: 2, points: 2, isCorrect: true },
		{ name: 'checkbox: только a', question: 'checkbox', answer: ['a'], earned: 1, points: 2, isCorrect: false },
		{ name: 'checkbox: только b', question: 'checkbox', answer: ['b'], earned: 0, points: 2, isCorrect: false },
		{
			name: 'matching: все три пары',
			question: 'matching',
			answer: { l1: 'r1', l2: 'r2', l3: 'r3' },
			earned: 2,
			points: 2,
			isCorrect: true,
		},
		{
			name: 'matching: одна неверная пара',
			question: 'matching',
			answer: { l1: 'r1', l2: 'r3', l3: 'r3' },
			earned: 1,
			points: 2,
			isCorrect: false,
		},
		{
			name: 'matching: две неверные пары',
			question: 'matching',
			answer: { l1: 'r2', l2: 'r1', l3: 'r3' },
			earned: 0,
			points: 2,
			isCorrect: false,
		},
		{
			name: "short_answer: ' митоз ' против 'Митоз'",
			question: 'short_answer',
			answer: ' митоз ',
			earned: 1,
			points: 1,
			isCorrect: true,
		},
		{
			name: "short_answer: 'мейоз'",
			question: 'short_answer',
			answer: 'мейоз',
			earned: 0,
			points: 1,
			isCorrect: false,
		},
		{
			name: "short_answer_variants: 'Моделирование'",
			question: 'short_answer_variants',
			answer: 'Моделирование',
			earned: 1,
			points: 1,
			isCorrect: true,
		},
		{
			name: "short_answer_variants: 'эксперимент'",
			question: 'short_answer_variants',
			answer: 'эксперимент',
			earned: 1,
			points: 1,
			isCorrect: true,
		},
		{
			name: "short_answer_variants: 'наблюдение'",
			question: 'short_answer_variants',
			answer: 'наблюдение',
			earned: 0,
			points: 1,
			isCorrect: false,
		},
		{ name: "sequence: '2314'", question: 'sequence', answer: '2314', earned: 2, points: 2, isCorrect: true },
		{ name: "sequence: '2315'", question: 'sequence', answer: '2315', earned: 1, points: 2, isCorrect: false },
		{ name: "sequence: '2415'", question: 'sequence', answer: '2415', earned: 0, points: 2, isCorrect: false },
		{
			name: "sequence D2: ключ '1243', ответ '1234' — одна соседняя перестановка",
			question: 'sequence1243',
			answer: '1234',
			earned: 1,
			points: 2,
			isCorrect: false,
		},
		{
			name: "sequence: ключ '123', ответ '132' — длина 3, исключения для перестановки нет",
			question: 'sequence123',
			answer: '132',
			earned: 0,
			points: 2,
			isCorrect: false,
		},
		{
			name: "sequence с цифровым ключом '3142': ответ '3142'",
			question: 'sequence3142',
			answer: '3142',
			earned: 2,
			points: 2,
			isCorrect: true,
		},
	]

	for (const item of cases) {
		test(`${item.name} → ${item.earned} из ${item.points}`, async () => {
			const questionId = idOf(item.question)
			const reply = await submit(testId, { answers: { [questionId]: item.answer } })
			assert.equal(reply.status, 200)
			const result = findResult(reply.body, questionId)
			assert.equal(result.earnedPoints, item.earned)
			assert.equal(result.points, item.points)
			assert.equal(result.isCorrect, item.isCorrect)
			assert.deepEqual(result.userAnswer, item.answer)
		})
	}

	test("radio: неверный 'a' → 0 из 1, correctAnswer 'b'", async () => {
		const questionId = idOf('radio')
		const reply = await submit(testId, { answers: { [questionId]: 'a' } })
		assert.equal(reply.status, 200)
		const result = findResult(reply.body, questionId)
		assert.equal(result.earnedPoints, 0)
		assert.equal(result.points, 1)
		assert.equal(result.isCorrect, false)
		assert.equal(result.correctAnswer, 'b')
	})

	test("sequence с цифровым ключом '3142': ответ '3141' → 1 из 2, ключ в результате читается как 3142", async () => {
		const questionId = idOf('sequence3142')
		const reply = await submit(testId, { answers: { [questionId]: '3141' } })
		assert.equal(reply.status, 200)
		const result = findResult(reply.body, questionId)
		assert.equal(result.earnedPoints, 1)
		assert.equal(result.points, 2)
		assert.equal(result.isCorrect, false)
		assert.equal(String(result.correctAnswer), '3142')
	})

	test('неотвеченный вопрос: 0 баллов, isCorrect false, userAnswer null', async () => {
		const reply = await submit(testId, { answers: {} })
		assert.equal(reply.status, 200)
		for (const name of Object.keys(ids)) {
			const result = findResult(reply.body, idOf(name))
			assert.equal(result.earnedPoints, 0)
			assert.equal(result.isCorrect, false)
			assert.equal(result.userAnswer, null)
		}
	})
})

describe('D-11: ключи answer_keys читаются как записаны', () => {
	const ids: Record<string, string> = {}
	let testId = ''

	beforeAll(async () => {
		testId = await createTest()
		const payloads: Record<string, Json> = {
			key150: validQuestion('short_answer', { correct: '1.50' }),
			key1e3: validQuestion('short_answer', { correct: '1e3' }),
			key100: validQuestion('short_answer', { correct: '10.0' }),
			keyTrue: validQuestion('short_answer', { correct: 'true' }),
			keyFalse: validQuestion('short_answer', { correct: 'false' }),
			keyNull: validQuestion('short_answer', { correct: 'null' }),
			sequence3142: validQuestion('sequence', { correct: '3142' }),
		}
		for (const [name, payload] of Object.entries(payloads)) {
			ids[name] = await createQuestion(testId, payload)
		}
	})

	function idOf(name: string): string {
		const id = ids[name]
		assert.ok(id, `no question ${name}`)
		return id
	}

	const cases: Array<{ name: string; question: string; answer: string; earned: number; isCorrect: boolean }> = [
		{ name: "ключ '1.50', ответ '1.50'", question: 'key150', answer: '1.50', earned: 1, isCorrect: true },
		{ name: "ключ '1.50', ответ '1.5'", question: 'key150', answer: '1.5', earned: 0, isCorrect: false },
		{ name: "ключ '1e3', ответ '1e3'", question: 'key1e3', answer: '1e3', earned: 1, isCorrect: true },
		{ name: "ключ '1e3', ответ '1000'", question: 'key1e3', answer: '1000', earned: 0, isCorrect: false },
		{ name: "ключ '10.0', ответ '10.0'", question: 'key100', answer: '10.0', earned: 1, isCorrect: true },
		{ name: "ключ '10.0', ответ '10'", question: 'key100', answer: '10', earned: 0, isCorrect: false },
		{ name: "ключ 'true', ответ 'true'", question: 'keyTrue', answer: 'true', earned: 1, isCorrect: true },
		{ name: "ключ 'false', ответ 'false'", question: 'keyFalse', answer: 'false', earned: 1, isCorrect: true },
		{ name: "ключ 'null', ответ 'null'", question: 'keyNull', answer: 'null', earned: 1, isCorrect: true },
	]

	for (const item of cases) {
		test(`short_answer: ${item.name} → ${item.earned} из 1`, async () => {
			const questionId = idOf(item.question)
			const reply = await submit(testId, { answers: { [questionId]: item.answer } })
			assert.equal(reply.status, 200)
			const result = findResult(reply.body, questionId)
			assert.equal(result.earnedPoints, item.earned)
			assert.equal(result.points, 1)
			assert.equal(result.isCorrect, item.isCorrect)
		})
	}

	test("sequence с ключом '3142': ответ '3141', correctAnswer строго строка '3142'", async () => {
		const questionId = idOf('sequence3142')
		const reply = await submit(testId, { answers: { [questionId]: '3141' } })
		assert.equal(reply.status, 200)
		const result = findResult(reply.body, questionId)
		assert.equal(result.earnedPoints, 1)
		assert.equal(result.isCorrect, false)
		assert.equal(result.correctAnswer, '3142')
	})
})

describe('скрытие ключа в results', () => {
	test('showCorrectAnswer=false и неверный ответ: correctAnswer null', async () => {
		const testId = await createTest({ showCorrectAnswer: false })
		const questionId = await createQuestion(testId, validQuestion('radio'))
		const reply = await submit(testId, { answers: { [questionId]: 'a' } })
		assert.equal(reply.status, 200)
		const result = findResult(reply.body, questionId)
		assert.equal(result.isCorrect, false)
		assert.equal(result.correctAnswer, null)
	})

	test('showCorrectAnswer=true и верный ответ: correctAnswer null', async () => {
		const testId = await createTest({ showCorrectAnswer: true })
		const questionId = await createQuestion(testId, validQuestion('radio'))
		const reply = await submit(testId, { answers: { [questionId]: 'b' } })
		assert.equal(reply.status, 200)
		const result = findResult(reply.body, questionId)
		assert.equal(result.isCorrect, true)
		assert.equal(result.correctAnswer, null)
	})
})

describe('идемпотентность submit по clientAttemptId', () => {
	test('повторный submit с тем же clientAttemptId: тот же attemptId и results, одна строка test_attempts', async () => {
		const testId = await createTest()
		const questionId = await createQuestion(testId, validQuestion('sequence'))
		const clientAttemptId = crypto.randomUUID()
		const payload = { answers: { [questionId]: '2315' }, clientAttemptId }
		const first = await submit(testId, payload)
		const second = await submit(testId, payload)
		assert.equal(first.status, 200)
		assert.equal(second.status, 200)
		assert.equal(second.body.attemptId, first.body.attemptId)
		assert.deepEqual(second.body.results, first.body.results)
		assert.equal(await countRows(schema.testAttempts, eq(schema.testAttempts.clientAttemptId, clientAttemptId)), 1)
	})
})

describe('черновик и телеметрия', () => {
	test('draftTelemetry сливается по максимуму, submit добавляет телеметрию к черновику', async () => {
		const testId = await createTest()
		const questionId = await createQuestion(testId, validQuestion('sequence'))
		const started = await request('POST', `/api/tests/public/tests/${testId}/start`, {}, studentCookie)
		assert.equal(started.status, 200)
		const sessionId = started.body.sessionId
		assert.equal(typeof sessionId, 'string')

		const draftPath = `/api/tests/public/tests/${testId}/sessions/${String(sessionId)}/answers`
		const firstDraft = await request(
			'PATCH',
			draftPath,
			{ telemetry: { [questionId]: { timeSpentMs: 100, focusLossCount: 2, visitCount: 1 } } },
			studentCookie
		)
		assert.equal(firstDraft.status, 200)
		const secondDraft = await request(
			'PATCH',
			draftPath,
			{ telemetry: { [questionId]: { timeSpentMs: 50, focusLossCount: 3, visitCount: 1 } } },
			studentCookie
		)
		assert.equal(secondDraft.status, 200)

		const [session] = await dbModule.db
			.select({ draftTelemetry: schema.testSessions.draftTelemetry })
			.from(schema.testSessions)
			.where(eq(schema.testSessions.id, String(sessionId)))
		assert.ok(session)
		assert.deepEqual(session.draftTelemetry, {
			[questionId]: { timeSpentMs: 100, focusLossCount: 3, visitCount: 1 },
		})

		const reply = await submit(testId, {
			answers: { [questionId]: '2314' },
			telemetry: { [questionId]: { timeSpentMs: 300, focusLossCount: 0, visitCount: 2 } },
		})
		assert.equal(reply.status, 200)
		const [attempt] = await dbModule.db
			.select({ telemetry: schema.testAttempts.telemetry })
			.from(schema.testAttempts)
			.where(eq(schema.testAttempts.id, String(reply.body.attemptId)))
		assert.ok(attempt)
		assert.deepEqual(attempt.telemetry, {
			[questionId]: { timeSpentMs: 300, focusLossCount: 3, visitCount: 2 },
		})
	})
})

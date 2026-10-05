import assert from 'node:assert/strict'
import { afterAll, beforeAll, describe, test } from 'vitest'

import { call, login, seedUser, startAuthApp, type AuthApp, type CookieJar } from '../../test-support/auth-app.js'

type Json = Record<string, unknown>

type Profile = 'admin' | 'student' | 'admin_deny_tests_read'

const PASSWORD = 'registration-password-1'

let ctx: AuthApp
let testId = ''
let questionId = ''
const jars = new Map<Profile, CookieJar>()

function jarOf(name: Profile): CookieJar {
	const jar = jars.get(name)
	assert.ok(jar, `no session for ${name}`)
	return jar
}

function fieldErrorsOf(body: Json): string[] {
	const details = body.details as { fieldErrors?: Record<string, unknown> } | undefined
	return Object.keys(details?.fieldErrors ?? {}).sort()
}

beforeAll(async () => {
	ctx = await startAuthApp('test_registration')
	const { db, schema } = ctx

	const [topic] = await db
		.insert(schema.topics)
		.values({ slug: 'registration-topic', title: 'Тема регистрации', isActive: true })
		.returning({ id: schema.topics.id })
	assert.ok(topic)
	const [created] = await db
		.insert(schema.tests)
		.values({ topicId: topic.id, slug: 'registration-test', title: 'Тест регистрации', isPublished: true })
		.returning({ id: schema.tests.id })
	assert.ok(created)
	testId = created.id
	const [question] = await db
		.insert(schema.questions)
		.values({ testId, type: 'radio', order: 0 })
		.returning({ id: schema.questions.id })
	assert.ok(question)
	questionId = question.id

	const profiles: Array<[Profile, string[]]> = [
		['admin', ['admin']],
		['student', ['user']],
		['admin_deny_tests_read', ['admin']],
	]
	for (const [name, roles] of profiles) {
		const id = await seedUser(ctx, { login: `registration_${name}`, roles, password: PASSWORD })
		if (name === 'admin_deny_tests_read') {
			await db.insert(schema.rbacUserGrants).values({ userId: id, domain: 'tests', action: 'read', allow: false })
		}
		const reply = await login(ctx, `registration_${name}`, PASSWORD)
		assert.equal(reply.status, 200, `login ${name}`)
		jars.set(name, reply.jar)
	}
}, 60_000)

afterAll(async () => {
	await ctx?.stop()
})

describe('порядок регистрации /api/tests', () => {
	test('GET /api/tests/topics доходит до списка тем, а не до GET /:id', async () => {
		const reply = await call(ctx, 'GET', '/api/tests/topics', { cookies: jarOf('admin') })
		assert.equal(reply.status, 200)
		assert.ok(Array.isArray(reply.body.topics))
	})

	test('GET /api/tests/<не-uuid> отвечает 400 от validateUUID', async () => {
		const reply = await call(ctx, 'GET', '/api/tests/not-a-uuid', { cookies: jarOf('admin') })
		assert.equal(reply.status, 400)
		assert.equal(reply.body.error, 'Invalid UUID format: id')
	})

	test('validateUUID стоит раньше sessionRequired: без сессии на <не-uuid> тоже 400', async () => {
		const reply = await call(ctx, 'GET', '/api/tests/not-a-uuid')
		assert.equal(reply.status, 400)
		assert.equal(reply.body.error, 'Invalid UUID format: id')
	})

	test('GET /api/tests/public/tests доходит до публичного роутера', async () => {
		const reply = await call(ctx, 'GET', '/api/tests/public/tests', { cookies: jarOf('admin') })
		assert.equal(reply.status, 200)
		assert.ok(Array.isArray(reply.body.tests))
		assert.equal('topics' in reply.body, false)
	})

	test('GET /api/tests/public без второго сегмента перехватывает GET /:id', async () => {
		const reply = await call(ctx, 'GET', '/api/tests/public', { cookies: jarOf('admin') })
		assert.equal(reply.status, 400)
		assert.equal(reply.body.error, 'Invalid UUID format: id')
	})

	test('GET /api/tests/admin/dashboard достижим', async () => {
		const reply = await call(ctx, 'GET', '/api/tests/admin/dashboard', { cookies: jarOf('admin') })
		assert.equal(reply.status, 200)
		assert.equal(typeof reply.body, 'object')
		assert.equal('error' in reply.body, false)
	})

	test('GET /api/tests/admin/attempts достижим', async () => {
		const reply = await call(ctx, 'GET', '/api/tests/admin/attempts', { cookies: jarOf('admin') })
		assert.equal(reply.status, 200)
		assert.equal('error' in reply.body, false)
	})

	test('GET /api/tests/:id отдаёт тест мира', async () => {
		const reply = await call(ctx, 'GET', `/api/tests/${testId}`, { cookies: jarOf('admin') })
		assert.equal(reply.status, 200)
		assert.equal('error' in reply.body, false)
	})
})

describe('вопросы: PUT /:id/questions/reorder и PATCH /:id/questions/:questionId не путаются', () => {
	test('PUT reorder с пустым списком — 400 от схемы порядка (поле questionIds)', async () => {
		const reply = await call(ctx, 'PUT', `/api/tests/${testId}/questions/reorder`, {
			cookies: jarOf('admin'),
			body: { questionIds: [] },
		})
		assert.equal(reply.status, 400)
		assert.deepEqual(fieldErrorsOf(reply.body), ['questionIds'])
	})

	test('PUT reorder с полным набором вопросов — 200 { ok: true } без questionId', async () => {
		const reply = await call(ctx, 'PUT', `/api/tests/${testId}/questions/reorder`, {
			cookies: jarOf('admin'),
			body: { questionIds: [questionId] },
		})
		assert.equal(reply.status, 200)
		assert.deepEqual(reply.body, { ok: true })
	})

	test('PATCH вопроса с пустым телом — 400 от схемы вопроса (поле type)', async () => {
		const reply = await call(ctx, 'PATCH', `/api/tests/${testId}/questions/${questionId}`, {
			cookies: jarOf('admin'),
			body: {},
		})
		assert.equal(reply.status, 400)
		const fields = fieldErrorsOf(reply.body)
		assert.ok(fields.includes('type'), `поля ошибок: ${fields.join(', ')}`)
		assert.equal(fields.includes('questionIds'), false)
	})

	test('PATCH /:id/questions/reorder — 400 от validateUUID(questionId), обработчика reorder для PATCH нет', async () => {
		const reply = await call(ctx, 'PATCH', `/api/tests/${testId}/questions/reorder`, {
			cookies: jarOf('admin'),
			body: { questionIds: [questionId] },
		})
		assert.equal(reply.status, 400)
		assert.equal(reply.body.error, 'Invalid UUID format: questionId')
	})

	test('PUT /:id/questions/<uuid> — 404, маршрута нет', async () => {
		const reply = await call(ctx, 'PUT', `/api/tests/${testId}/questions/${questionId}`, {
			cookies: jarOf('admin'),
			body: {},
		})
		assert.equal(reply.status, 404)
	})
})

describe('монтирование /:testId/assignments и /:testId/question-drafts', () => {
	test('GET /api/tests/:testId/assignments — 200 у администратора', async () => {
		const reply = await call(ctx, 'GET', `/api/tests/${testId}/assignments`, { cookies: jarOf('admin') })
		assert.equal(reply.status, 200)
		assert.equal('error' in reply.body, false)
	})

	test('GET /api/tests/:testId/question-drafts — 200 и список черновиков', async () => {
		const reply = await call(ctx, 'GET', `/api/tests/${testId}/question-drafts`, { cookies: jarOf('admin') })
		assert.equal(reply.status, 200)
		assert.ok(Array.isArray(reply.body.drafts))
	})

	test('GET /api/tests/<не-uuid>/assignments — 400 от validateUUID(testId) вложенного роутера', async () => {
		const reply = await call(ctx, 'GET', '/api/tests/not-a-uuid/assignments', { cookies: jarOf('admin') })
		assert.equal(reply.status, 400)
		assert.equal(reply.body.error, 'Invalid UUID format: testId')
	})
})

type GuardRow = {
	area: string
	method: string
	path: () => string
	denied: Profile[]
}

const GUARD_ROWS: GuardRow[] = [
	{ area: 'темы', method: 'GET', path: () => '/api/tests/topics', denied: ['student', 'admin_deny_tests_read'] },
	{ area: 'тесты', method: 'GET', path: () => '/api/tests', denied: ['student', 'admin_deny_tests_read'] },
	{
		area: 'типы вопросов',
		method: 'GET',
		path: () => '/api/tests/question-types',
		denied: ['student', 'admin_deny_tests_read'],
	},
	{
		area: 'правила баллов',
		method: 'GET',
		path: () => '/api/tests/scoring-rules/global',
		denied: ['student', 'admin_deny_tests_read'],
	},
	{
		area: 'черновики',
		method: 'GET',
		path: () => `/api/tests/${testId}/question-drafts`,
		denied: ['student'],
	},
	{
		area: 'вопросы',
		method: 'PUT',
		path: () => `/api/tests/${testId}/questions/reorder`,
		denied: ['student'],
	},
	{ area: 'ассеты', method: 'POST', path: () => `/api/tests/${testId}/assets`, denied: ['student'] },
	{ area: 'экспорт', method: 'GET', path: () => `/api/tests/${testId}/export`, denied: ['student'] },
	{
		area: 'дашборд',
		method: 'GET',
		path: () => '/api/tests/admin/dashboard',
		denied: ['student', 'admin_deny_tests_read'],
	},
	{
		area: 'попытки',
		method: 'GET',
		path: () => '/api/tests/admin/attempts',
		denied: ['student', 'admin_deny_tests_read'],
	},
	{
		area: 'назначения',
		method: 'GET',
		path: () => `/api/tests/${testId}/assignments`,
		denied: ['student'],
	},
]

describe('будущие суброутеры: 401 без сессии и 403 без права', () => {
	for (const row of GUARD_ROWS) {
		test(`${row.area}: ${row.method} без сессии → 401`, async () => {
			const reply = await call(ctx, row.method, row.path())
			assert.equal(reply.status, 401)
		})

		for (const profile of row.denied) {
			test(`${row.area}: ${row.method} у ${profile} → 403`, async () => {
				const reply = await call(ctx, row.method, row.path(), { cookies: jarOf(profile) })
				assert.equal(reply.status, 403)
			})
		}
	}

	test('экспорт темы GET /api/tests/topics/:slug/export: без сессии 401, у ученика вне зоны 403', async () => {
		const anonymous = await call(ctx, 'GET', '/api/tests/topics/registration-topic/export')
		assert.equal(anonymous.status, 401)
		const student = await call(ctx, 'GET', '/api/tests/topics/registration-topic/export', {
			cookies: jarOf('student'),
		})
		assert.equal(student.status, 403)
	})
})

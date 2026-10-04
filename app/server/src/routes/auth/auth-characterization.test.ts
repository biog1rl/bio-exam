import assert from 'node:assert/strict'
import { afterAll, beforeAll, describe, test } from 'vitest'

import {
	call,
	mergeCookies,
	login,
	seedUser,
	startAuthApp,
	type AuthApp,
	type CookieJar,
	type ParsedCookie,
} from '../../test-support/auth-app.js'

const PASSWORD = 'char-password-1'

const SEARCH_WORD = 'хлоропласт'

let ctx: AuthApp
let userId = ''
let topicSlug = ''
let assignedTestId = ''
let freeTestId = ''
const jars = new Map<string, CookieJar>()

beforeAll(async () => {
	ctx = await startAuthApp('test_auth_char')
	await seedUser(ctx, { login: 'char_admin', roles: ['admin'], password: PASSWORD })
	userId = await seedUser(ctx, { login: 'char_user', roles: ['user'], password: PASSWORD })
	const studentId = await seedUser(ctx, { login: 'd04_student', roles: ['user'], password: PASSWORD })
	await seedUser(ctx, { login: 'd04_stranger', roles: ['user'], password: PASSWORD })

	const { db, schema } = ctx
	const [topic] = await db
		.insert(schema.topics)
		.values({ slug: 'd04-topic', title: 'Тема D-04', isActive: true })
		.returning({ id: schema.topics.id, slug: schema.topics.slug })
	assert.ok(topic)
	topicSlug = topic.slug
	const [assigned] = await db
		.insert(schema.tests)
		.values({ topicId: topic.id, slug: 'd04-assigned', title: `${SEARCH_WORD} назначенный`, isPublished: true })
		.returning({ id: schema.tests.id })
	const [free] = await db
		.insert(schema.tests)
		.values({ topicId: topic.id, slug: 'd04-free', title: `${SEARCH_WORD} свободный`, isPublished: true })
		.returning({ id: schema.tests.id })
	assert.ok(assigned)
	assert.ok(free)
	assignedTestId = assigned.id
	freeTestId = free.id
	await db.insert(schema.testAssignments).values({ testId: assigned.id, userId: studentId })

	for (const name of ['char_admin', 'char_user', 'd04_student', 'd04_stranger']) {
		const reply = await login(ctx, name, PASSWORD)
		assert.equal(reply.status, 200, `login ${name}`)
		jars.set(name, reply.jar)
	}
}, 60_000)

function jarOf(name: string): CookieJar {
	const jar = jars.get(name)
	assert.ok(jar, `no session for ${name}`)
	return jar
}

async function testIdsFrom(path: string, name: string): Promise<string[]> {
	const reply = await call(ctx, 'GET', path, { cookies: jarOf(name) })
	assert.equal(reply.status, 200)
	const rows = reply.body.tests as Array<{ id: string }>
	return rows.map((row) => row.id).filter((id) => id === assignedTestId || id === freeTestId)
}

async function searchTestsFor(name: string): Promise<Array<{ id: string; href: string }>> {
	const reply = await call(ctx, 'GET', `/api/search?q=${encodeURIComponent(SEARCH_WORD)}&scope=tests`, {
		cookies: jarOf(name),
	})
	assert.equal(reply.status, 200)
	const categories = reply.body.categories as Array<{
		scope: string
		items: Array<{ type: string; id: string; href: string }>
	}>
	return categories
		.flatMap((category) => category.items)
		.filter((item) => item.type === 'test' && (item.id === assignedTestId || item.id === freeTestId))
		.map((item) => ({ id: item.id, href: item.href }))
}

afterAll(async () => {
	await ctx?.stop()
})

function assertSessionCookie(cookie: ParsedCookie | undefined, name: string): void {
	assert.ok(cookie, `${name} is not set`)
	assert.notEqual(cookie.value, '')
	assert.equal(cookie.attributes.get('path'), '/')
	assert.ok(cookie.attributes.has('httponly'), `${name} is not HttpOnly`)
	assert.equal(cookie.attributes.get('samesite')?.toLowerCase(), 'lax')
	assert.ok(cookie.attributes.has('max-age'), `${name} has no Max-Age`)
}

describe('вход, текущий пользователь, refresh, выход', () => {
	test('один пользователь проходит login → me → refresh → me → logout → me', async () => {
		const loggedIn = await login(ctx, 'char_user', PASSWORD)
		assert.equal(loggedIn.status, 200)
		assertSessionCookie(loggedIn.setCookies.get('bio_exam_session'), 'bio_exam_session')
		assertSessionCookie(loggedIn.setCookies.get('refresh_token'), 'refresh_token')
		let jar = loggedIn.jar

		const me = await call(ctx, 'GET', '/api/auth/me', { cookies: jar })
		assert.equal(me.status, 200)
		assert.equal(me.body.ok, true)
		const user = me.body.user as { id: string; roles: string[]; perms: unknown[] }
		assert.equal(user.id, userId)
		assert.ok(user.roles.includes('user'))
		assert.ok(Array.isArray(user.perms))
		assert.ok(user.perms.every((perm) => typeof perm === 'string'))

		const previousRefresh = jar.get('refresh_token')
		const refreshed = await call(ctx, 'POST', '/api/auth/refresh', { cookies: jar })
		assert.equal(refreshed.status, 200)
		const nextRefresh = refreshed.setCookies.get('refresh_token')
		assertSessionCookie(nextRefresh, 'refresh_token')
		assert.notEqual(nextRefresh?.value, previousRefresh)
		jar = mergeCookies(jar, refreshed.setCookies)

		const meAfterRefresh = await call(ctx, 'GET', '/api/auth/me', { cookies: jar })
		assert.equal(meAfterRefresh.status, 200)
		assert.equal((meAfterRefresh.body.user as { id: string }).id, userId)

		const loggedOut = await call(ctx, 'POST', '/api/auth/logout', { cookies: jar })
		assert.equal(loggedOut.status, 200)
		assert.equal(loggedOut.setCookies.get('bio_exam_session')?.attributes.get('max-age'), '0')
		assert.equal(loggedOut.setCookies.get('refresh_token')?.attributes.get('max-age'), '0')
		jar = mergeCookies(jar, loggedOut.setCookies)
		assert.equal(jar.size, 0)

		const meAfterLogout = await call(ctx, 'GET', '/api/auth/me', { cookies: jar })
		assert.equal(meAfterLogout.status, 401)
	})
})

describe('requirePerm на GET /api/rbac/roles', () => {
	test('без сессии 401', async () => {
		const reply = await call(ctx, 'GET', '/api/rbac/roles')
		assert.equal(reply.status, 401)
	})

	test('роль user 403', async () => {
		const reply = await call(ctx, 'GET', '/api/rbac/roles', { cookies: jarOf('char_user') })
		assert.equal(reply.status, 403)
	})

	test('роль admin 200', async () => {
		const reply = await call(ctx, 'GET', '/api/rbac/roles', { cookies: jarOf('char_admin') })
		assert.equal(reply.status, 200)
	})
})

describe('отказы refresh и /api/auth/me', () => {
	test('refresh без cookie 401', async () => {
		const reply = await call(ctx, 'POST', '/api/auth/refresh')
		assert.equal(reply.status, 401)
		assert.equal(reply.setCookies.has('refresh_token'), false)
	})

	test('refresh с выдуманным refresh_token 401', async () => {
		const reply = await call(ctx, 'POST', '/api/auth/refresh', { cookies: 'refresh_token=deadbeef' })
		assert.equal(reply.status, 401)
		assert.equal(reply.setCookies.has('refresh_token'), false)
	})

	test('refresh-токен сессии, завершённой выходом, 401', async () => {
		const loggedIn = await login(ctx, 'char_user', PASSWORD)
		assert.equal(loggedIn.status, 200)
		const loggedOut = await call(ctx, 'POST', '/api/auth/logout', { cookies: loggedIn.jar })
		assert.equal(loggedOut.status, 200)
		const refreshToken = loggedIn.jar.get('refresh_token')
		assert.ok(refreshToken)
		const reply = await call(ctx, 'POST', '/api/auth/refresh', { cookies: `refresh_token=${refreshToken}` })
		assert.equal(reply.status, 401)
		assert.equal(reply.setCookies.has('refresh_token'), false)
	})

	test('/api/auth/me с испорченным bio_exam_session 401', async () => {
		const session = jarOf('char_user').get('bio_exam_session')
		assert.ok(session)
		const reply = await call(ctx, 'GET', '/api/auth/me', { cookies: `bio_exam_session=${session}x` })
		assert.equal(reply.status, 401)
	})
})

describe('исходы маршрутов D-04 до перевода на права', () => {
	const detailCases: Array<[string, number]> = [
		['char_admin', 200],
		['d04_student', 200],
		['d04_stranger', 403],
	]

	for (const [name, status] of detailCases) {
		test(`GET /api/tests/public/topics/:topicSlug/tests/d04-assigned: ${name} → ${status}`, async () => {
			const reply = await call(ctx, 'GET', `/api/tests/public/topics/${topicSlug}/tests/d04-assigned`, {
				cookies: jarOf(name),
			})
			assert.equal(reply.status, status)
		})
	}

	for (const [name, status] of detailCases) {
		test(`GET /api/tests/public/tests/:id для d04-assigned: ${name} → ${status}`, async () => {
			const reply = await call(ctx, 'GET', `/api/tests/public/tests/${assignedTestId}`, { cookies: jarOf(name) })
			assert.equal(reply.status, status)
		})
	}

	const listCases: Array<[string, () => string[]]> = [
		['char_admin', () => [assignedTestId, freeTestId]],
		['d04_student', () => [assignedTestId]],
		['d04_stranger', () => []],
	]

	for (const [name, expected] of listCases) {
		test(`GET /api/tests/public/tests: ${name}`, async () => {
			const ids = await testIdsFrom('/api/tests/public/tests', name)
			assert.deepEqual(ids.sort(), expected().sort())
		})
	}

	for (const [name, expected] of listCases) {
		test(`GET /api/tests/public/topics/:slug/tests: ${name}`, async () => {
			const ids = await testIdsFrom(`/api/tests/public/topics/${topicSlug}/tests`, name)
			assert.deepEqual(ids.sort(), expected().sort())
		})
	}

	const settingsCases: Array<[string, number]> = [
		['char_admin', 200],
		['d04_student', 403],
	]

	for (const [name, status] of settingsCases) {
		test(`GET /api/settings/chart-default-range: ${name} → ${status}`, async () => {
			const reply = await call(ctx, 'GET', '/api/settings/chart-default-range', { cookies: jarOf(name) })
			assert.equal(reply.status, status)
		})

		test(`PUT /api/settings/chart-default-range: ${name} → ${status}`, async () => {
			const reply = await call(ctx, 'PUT', '/api/settings/chart-default-range', {
				cookies: jarOf(name),
				body: { value: 'week' },
			})
			assert.equal(reply.status, status)
		})
	}

	test('GET /api/search?scope=tests: admin видит оба теста со ссылками /admin/tests/', async () => {
		const items = await searchTestsFor('char_admin')
		assert.deepEqual(items.map((item) => item.id).sort(), [assignedTestId, freeTestId].sort())
		for (const item of items) assert.ok(item.href.startsWith('/admin/tests/'), item.href)
	})

	test('GET /api/search?scope=tests: user с назначением видит только назначенный со ссылкой /tests/', async () => {
		const items = await searchTestsFor('d04_student')
		assert.deepEqual(
			items.map((item) => item.id),
			[assignedTestId]
		)
		for (const item of items) assert.ok(item.href.startsWith('/tests/'), item.href)
	})

	test('GET /api/search?scope=tests: user без назначения не видит ни одного', async () => {
		const items = await searchTestsFor('d04_stranger')
		assert.deepEqual(items, [])
	})
})

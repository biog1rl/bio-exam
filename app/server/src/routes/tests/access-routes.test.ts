import assert from 'node:assert/strict'
import { afterAll, beforeAll, describe, test } from 'vitest'

import { call, login, seedUser, startAuthApp, type AuthApp, type CookieJar } from '../../test-support/auth-app.js'

const PASSWORD = 'access-routes-password-1'

const SEARCH_WORD = 'митохондрия'

type Profile =
	| 'admin'
	| 'student'
	| 'stranger'
	| 'allow_tests_read'
	| 'allow_tests_read_no_zone'
	| 'allow_settings_manage'
	| 'allow_tests_write'
	| 'admin_deny_tests_read'
	| 'admin_deny_settings_manage'
	| 'admin_deny_search'

type TestKey = 'assigned' | 'free'

type Grant = { domain: string; action: string; allow: boolean }

const PROFILES: Array<{ name: Profile; roles: string[]; grants: Grant[]; assigned: boolean }> = [
	{ name: 'admin', roles: ['admin'], grants: [], assigned: false },
	{ name: 'student', roles: ['user'], grants: [], assigned: true },
	{ name: 'stranger', roles: ['user'], grants: [], assigned: false },
	{
		name: 'allow_tests_read',
		roles: ['user'],
		grants: [
			{ domain: 'tests', action: 'read', allow: true },
			{ domain: 'zone', action: 'all', allow: true },
		],
		assigned: false,
	},
	{
		name: 'allow_tests_read_no_zone',
		roles: ['user'],
		grants: [{ domain: 'tests', action: 'read', allow: true }],
		assigned: false,
	},
	{
		name: 'allow_settings_manage',
		roles: ['user'],
		grants: [{ domain: 'settings', action: 'manage', allow: true }],
		assigned: false,
	},
	{
		name: 'allow_tests_write',
		roles: ['user'],
		grants: [{ domain: 'tests', action: 'write', allow: true }],
		assigned: false,
	},
	{
		name: 'admin_deny_tests_read',
		roles: ['admin'],
		grants: [{ domain: 'tests', action: 'read', allow: false }],
		assigned: true,
	},
	{
		name: 'admin_deny_settings_manage',
		roles: ['admin'],
		grants: [{ domain: 'settings', action: 'manage', allow: false }],
		assigned: false,
	},
	{
		name: 'admin_deny_search',
		roles: ['admin'],
		grants: [
			{ domain: 'tests', action: 'write', allow: false },
			{ domain: 'groups', action: 'manage_groups', allow: false },
		],
		assigned: true,
	},
]

let ctx: AuthApp
let topicSlug = ''
const testIds = new Map<TestKey, string>()
const jars = new Map<Profile, CookieJar>()

function jarOf(name: Profile): CookieJar {
	const jar = jars.get(name)
	assert.ok(jar, `no session for ${name}`)
	return jar
}

function testIdOf(key: TestKey): string {
	const id = testIds.get(key)
	assert.ok(id, `no seeded test ${key}`)
	return id
}

function idsOf(keys: TestKey[]): string[] {
	return keys.map(testIdOf).sort()
}

async function listedTestIds(path: string, name: Profile): Promise<string[]> {
	const reply = await call(ctx, 'GET', path, { cookies: jarOf(name) })
	assert.equal(reply.status, 200)
	const known = new Set(testIds.values())
	const rows = reply.body.tests as Array<{ id: string }>
	return rows
		.map((row) => row.id)
		.filter((id) => known.has(id))
		.sort()
}

async function searchTestsFor(name: Profile): Promise<Array<{ id: string; href: string }>> {
	const reply = await call(ctx, 'GET', `/api/search?q=${encodeURIComponent(SEARCH_WORD)}&scope=tests`, {
		cookies: jarOf(name),
	})
	assert.equal(reply.status, 200)
	const known = new Set(testIds.values())
	const categories = reply.body.categories as Array<{ items: Array<{ type: string; id: string; href: string }> }>
	return categories
		.flatMap((category) => category.items)
		.filter((item) => item.type === 'test' && known.has(item.id))
		.map((item) => ({ id: item.id, href: item.href }))
}

beforeAll(async () => {
	ctx = await startAuthApp('test_access_routes')
	const { db, schema } = ctx

	const [topic] = await db
		.insert(schema.topics)
		.values({ slug: 'access-topic', title: 'Тема доступа', isActive: true })
		.returning({ id: schema.topics.id, slug: schema.topics.slug })
	assert.ok(topic)
	topicSlug = topic.slug
	for (const key of ['assigned', 'free'] as const) {
		const [created] = await db
			.insert(schema.tests)
			.values({ topicId: topic.id, slug: `access-${key}`, title: `${SEARCH_WORD} ${key}`, isPublished: true })
			.returning({ id: schema.tests.id })
		assert.ok(created)
		testIds.set(key, created.id)
	}

	for (const profile of PROFILES) {
		const id = await seedUser(ctx, { login: `access_${profile.name}`, roles: profile.roles, password: PASSWORD })
		if (profile.grants.length > 0) {
			await db.insert(schema.rbacUserGrants).values(profile.grants.map((grant) => ({ userId: id, ...grant })))
		}
		if (profile.assigned) {
			await db.insert(schema.testAssignments).values({ testId: testIdOf('assigned'), userId: id })
		}
		const reply = await login(ctx, `access_${profile.name}`, PASSWORD)
		assert.equal(reply.status, 200, `login ${profile.name}`)
		jars.set(profile.name, reply.jar)
	}
}, 60_000)

afterAll(async () => {
	await ctx?.stop()
})

describe('чтение теста: GET /api/tests/public/topics/:topicSlug/tests/:testSlug и /tests/:id', () => {
	const cases: Array<[Profile, TestKey, number]> = [
		['admin', 'assigned', 200],
		['admin', 'free', 200],
		['student', 'assigned', 200],
		['student', 'free', 403],
		['stranger', 'assigned', 403],
		['allow_tests_read', 'free', 200],
		['allow_tests_read_no_zone', 'free', 403],
		['admin_deny_tests_read', 'free', 403],
		['admin_deny_tests_read', 'assigned', 200],
	]

	for (const [name, key, status] of cases) {
		test(`по slug: ${name}, тест ${key} → ${status}`, async () => {
			const reply = await call(ctx, 'GET', `/api/tests/public/topics/${topicSlug}/tests/access-${key}`, {
				cookies: jarOf(name),
			})
			assert.equal(reply.status, status)
		})

		test(`по id: ${name}, тест ${key} → ${status}`, async () => {
			const reply = await call(ctx, 'GET', `/api/tests/public/tests/${testIdOf(key)}`, { cookies: jarOf(name) })
			assert.equal(reply.status, status)
		})
	}
})

describe('списки: GET /api/tests/public/tests и /topics/:slug/tests', () => {
	const cases: Array<[Profile, TestKey[]]> = [
		['admin', ['assigned', 'free']],
		['student', ['assigned']],
		['stranger', []],
		['allow_tests_read', ['assigned', 'free']],
		['allow_tests_read_no_zone', []],
		['admin_deny_tests_read', ['assigned']],
	]

	for (const [name, keys] of cases) {
		test(`GET /api/tests/public/tests: ${name} → [${keys.join(', ')}]`, async () => {
			assert.deepEqual(await listedTestIds('/api/tests/public/tests', name), idsOf(keys))
		})

		test(`GET /api/tests/public/topics/:slug/tests: ${name} → [${keys.join(', ')}]`, async () => {
			assert.deepEqual(await listedTestIds(`/api/tests/public/topics/${topicSlug}/tests`, name), idsOf(keys))
		})
	}
})

describe('настройки: GET и PUT /api/settings/chart-default-range', () => {
	const cases: Array<[Profile, number]> = [
		['admin', 200],
		['student', 403],
		['allow_settings_manage', 200],
		['admin_deny_settings_manage', 403],
	]

	for (const [name, status] of cases) {
		test(`GET: ${name} → ${status}`, async () => {
			const reply = await call(ctx, 'GET', '/api/settings/chart-default-range', { cookies: jarOf(name) })
			assert.equal(reply.status, status)
		})

		test(`PUT: ${name} → ${status}`, async () => {
			const reply = await call(ctx, 'PUT', '/api/settings/chart-default-range', {
				cookies: jarOf(name),
				body: { value: 'week' },
			})
			assert.equal(reply.status, status)
		})
	}
})

describe('поиск: GET /api/search?scope=tests', () => {
	const cases: Array<[Profile, TestKey[], string]> = [
		['admin', ['assigned', 'free'], '/admin/tests/'],
		['student', ['assigned'], '/tests/'],
		['stranger', [], '/tests/'],
		['allow_tests_write', ['assigned', 'free'], '/admin/tests/'],
		['admin_deny_search', ['assigned'], '/tests/'],
	]

	for (const [name, keys, prefix] of cases) {
		test(`${name} → [${keys.join(', ')}] со ссылками ${prefix}`, async () => {
			const items = await searchTestsFor(name)
			assert.deepEqual(items.map((item) => item.id).sort(), idsOf(keys))
			for (const item of items) assert.ok(item.href.startsWith(prefix), item.href)
		})
	}
})

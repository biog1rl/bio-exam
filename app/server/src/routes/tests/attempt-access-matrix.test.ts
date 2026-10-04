import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { afterAll, beforeAll, describe, test } from 'vitest'

import {
	addQuestion,
	createAttemptTest,
	insertOpenSession,
	seedAttemptWorld,
	type AttemptWorld,
} from '../../test-support/attempt-world.js'
import { call, login, seedUser, startAuthApp, type AuthApp, type CookieJar } from '../../test-support/auth-app.js'

type Profile = 'admin' | 'student' | 'stranger' | 'allow_tests_read' | 'admin_deny_tests_read'

type TestKey = 'assigned' | 'free'

type Grant = { domain: string; action: string; allow: boolean }

type SeededTest = { id: string; slug: string; topicSlug: string; questionId: string }

type RouteName = 'по slug' | 'по id' | '/attempts/me' | '/chart-data' | '/start' | 'PATCH черновика' | 'submit'

const PROFILES: Array<{ name: Profile; roles: string[]; grants: Grant[]; assigned: boolean }> = [
	{ name: 'admin', roles: ['admin'], grants: [], assigned: false },
	{ name: 'student', roles: ['user'], grants: [], assigned: true },
	{ name: 'stranger', roles: ['user'], grants: [], assigned: false },
	{
		name: 'allow_tests_read',
		roles: ['user'],
		grants: [{ domain: 'tests', action: 'read', allow: true }],
		assigned: false,
	},
	{
		name: 'admin_deny_tests_read',
		roles: ['admin'],
		grants: [{ domain: 'tests', action: 'read', allow: false }],
		assigned: true,
	},
]

const EXPECTED: Array<[Profile, TestKey, number]> = [
	['admin', 'assigned', 200],
	['admin', 'free', 200],
	['student', 'assigned', 200],
	['student', 'free', 403],
	['stranger', 'assigned', 403],
	['stranger', 'free', 403],
	['allow_tests_read', 'assigned', 200],
	['allow_tests_read', 'free', 200],
	['admin_deny_tests_read', 'assigned', 200],
	['admin_deny_tests_read', 'free', 403],
]

let ctx: AuthApp
let world: AttemptWorld
const seeded = new Map<TestKey, SeededTest>()
const jars = new Map<Profile, CookieJar>()
const userIds = new Map<Profile, string>()
let unpublished: SeededTest
let inactiveTopic: SeededTest

function jarOf(name: Profile): CookieJar {
	const jar = jars.get(name)
	assert.ok(jar, `no session for ${name}`)
	return jar
}

function userIdOf(name: Profile): string {
	const id = userIds.get(name)
	assert.ok(id, `no user for ${name}`)
	return id
}

function seededOf(key: TestKey): SeededTest {
	const item = seeded.get(key)
	assert.ok(item, `no seeded test ${key}`)
	return item
}

async function walkRoutes(
	name: Profile,
	target: SeededTest,
	sessionFor: (startBody: Record<string, unknown>) => Promise<string>
): Promise<Array<[RouteName, number]>> {
	const cookies = jarOf(name)
	const base = `/api/tests/public/tests/${target.id}`
	const statuses: Array<[RouteName, number]> = []
	const bySlug = await call(ctx, 'GET', `/api/tests/public/topics/${target.topicSlug}/tests/${target.slug}`, {
		cookies,
	})
	statuses.push(['по slug', bySlug.status])
	statuses.push(['по id', (await call(ctx, 'GET', base, { cookies })).status])
	statuses.push(['/attempts/me', (await call(ctx, 'GET', `${base}/attempts/me`, { cookies })).status])
	statuses.push(['/chart-data', (await call(ctx, 'GET', `${base}/chart-data`, { cookies })).status])
	const started = await call(ctx, 'POST', `${base}/start`, { cookies })
	statuses.push(['/start', started.status])
	const sessionId = await sessionFor(started.body)
	const patched = await call(ctx, 'PATCH', `${base}/sessions/${sessionId}/answers`, {
		cookies,
		body: { questionId: target.questionId, value: 'a' },
	})
	statuses.push(['PATCH черновика', patched.status])
	const submitted = await call(ctx, 'POST', `${base}/submit`, {
		cookies,
		body: { sessionId, clientAttemptId: crypto.randomUUID(), answers: { [target.questionId]: 'b' } },
	})
	statuses.push(['submit', submitted.status])
	return statuses
}

function expectAll(statuses: Array<[RouteName, number]>, status: number): void {
	assert.deepEqual(
		statuses,
		statuses.map(([route]) => [route, status])
	)
}

beforeAll(async () => {
	ctx = await startAuthApp('test_attempt_access')
	world = await seedAttemptWorld(ctx, 'access_matrix')
	const { db, schema } = ctx

	for (const key of ['assigned', 'free'] as const) {
		const slug = `matrix-${key}`
		const id = await createAttemptTest(world, { slug })
		const questionId = await addQuestion(world, id, 'radio')
		seeded.set(key, { id, slug, topicSlug: world.topicSlug, questionId })
	}

	const unpublishedId = await createAttemptTest(world, { slug: 'matrix-unpublished', isPublished: false })
	unpublished = {
		id: unpublishedId,
		slug: 'matrix-unpublished',
		topicSlug: world.topicSlug,
		questionId: await addQuestion(world, unpublishedId, 'radio'),
	}

	const [hiddenTopic] = await db
		.insert(schema.topics)
		.values({ slug: 'access-matrix-hidden', title: 'Скрытая тема', isActive: false })
		.returning({ id: schema.topics.id, slug: schema.topics.slug })
	assert.ok(hiddenTopic)
	const [hiddenTest] = await db
		.insert(schema.tests)
		.values({ topicId: hiddenTopic.id, slug: 'matrix-hidden', title: 'Тест скрытой темы', isPublished: true })
		.returning({ id: schema.tests.id })
	assert.ok(hiddenTest)
	inactiveTopic = {
		id: hiddenTest.id,
		slug: 'matrix-hidden',
		topicSlug: hiddenTopic.slug,
		questionId: await addQuestion(world, hiddenTest.id, 'radio'),
	}

	for (const profile of PROFILES) {
		const userLogin = `matrix_${profile.name}`
		const id = await seedUser(ctx, { login: userLogin, roles: profile.roles, password: world.password })
		userIds.set(profile.name, id)
		if (profile.grants.length > 0) {
			await db.insert(schema.rbacUserGrants).values(profile.grants.map((grant) => ({ userId: id, ...grant })))
		}
		if (profile.assigned) {
			await db.insert(schema.testAssignments).values({ testId: seededOf('assigned').id, userId: id })
		}
		const reply = await login(ctx, userLogin, world.password)
		assert.equal(reply.status, 200, `login ${profile.name}`)
		jars.set(profile.name, reply.jar)
	}
}, 60_000)

afterAll(async () => {
	await ctx?.stop()
})

describe('доступ к попытке: семь маршрутов по профилям', () => {
	for (const [name, key, status] of EXPECTED) {
		test(`${name}, тест ${key} → ${status} на всех семи маршрутах`, async () => {
			const target = seededOf(key)
			const statuses = await walkRoutes(name, target, async (startBody) => {
				if (status === 200) {
					assert.equal(typeof startBody.sessionId, 'string')
					return startBody.sessionId as string
				}
				return insertOpenSession(world, target.id, userIdOf(name))
			})
			expectAll(statuses, status)
		})
	}
})

describe('доступ к попытке: невидимый тест', () => {
	test('неопубликованный тест → 404 у admin на всех семи маршрутах', async () => {
		const statuses = await walkRoutes('admin', unpublished, () =>
			insertOpenSession(world, unpublished.id, userIdOf('admin'))
		)
		expectAll(statuses, 404)
	})

	test('тест в неактивной теме → 404 у admin на всех семи маршрутах', async () => {
		const statuses = await walkRoutes('admin', inactiveTopic, () =>
			insertOpenSession(world, inactiveTopic.id, userIdOf('admin'))
		)
		expectAll(statuses, 404)
	})
})

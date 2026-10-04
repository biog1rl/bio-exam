import assert from 'node:assert/strict'
import { afterAll, beforeAll, describe, test } from 'vitest'

import { call, startAuthApp, type AuthApp } from '../test-support/auth-app.js'
import {
	seedTeacherZoneWorld,
	type TeacherZoneWorld,
	type ZoneAttemptKey,
	type ZoneGroupKey,
	type ZoneProfile,
	type ZoneTestKey,
	type ZoneTopicKey,
} from '../test-support/teacher-zone-world.js'

const KNOWN_DEFECTS = new Set<string>([])

function check(id: string, title: string, fn: () => Promise<void>): void {
	const run = KNOWN_DEFECTS.has(id) ? test.fails : test
	run(`${id}: ${title}`, fn)
}

type Row = { profile: ZoneProfile; route: string; title: string; run: (profile: ZoneProfile) => Promise<void> }

type Scope = 'tests' | 'questions' | 'users' | 'groups' | 'attempts'

type SearchItem = { type: string; id: string; href: string }

type Category = { scope: string; available: boolean; items: SearchItem[] }

const SCOPES: Scope[] = ['tests', 'questions', 'users', 'groups', 'attempts']

const QUESTION_QUERY = 'половая клетка'

const WORLD_PEOPLE: ZoneProfile[] = [
	'admin',
	'teacherA',
	'teacherB',
	'teacherOff',
	's1',
	's2',
	's3',
	'invited',
	'readTests',
	'readTestsAll',
	'readUsers',
	'readUsersAll',
	'adminNoZone',
]

let ctx: AuthApp
let w: TeacherZoneWorld

function keysOf<K extends string>(ids: Record<K, string>, items: SearchItem[]): K[] {
	const byId = new Map(Object.entries(ids).map(([key, id]) => [id as string, key as K]))
	return items
		.map((item) => byId.get(item.id))
		.filter((key): key is K => key !== undefined)
		.sort()
}

function ofType(items: SearchItem[], type: string): SearchItem[] {
	return items.filter((item) => item.type === type)
}

function topicKeys(items: SearchItem[]): ZoneTopicKey[] {
	const ids = Object.fromEntries(Object.entries(w.topics).map(([key, value]) => [key, value.id])) as Record<
		ZoneTopicKey,
		string
	>
	return keysOf(ids, ofType(items, 'topic'))
}

function testKeys(items: SearchItem[]): ZoneTestKey[] {
	const ids = Object.fromEntries(Object.entries(w.tests).map(([key, value]) => [key, value.id])) as Record<
		ZoneTestKey,
		string
	>
	return keysOf(ids, ofType(items, 'test'))
}

function questionKeys(items: SearchItem[]): ZoneTestKey[] {
	const ids = Object.fromEntries(Object.entries(w.tests).map(([key, value]) => [key, value.questionId])) as Record<
		ZoneTestKey,
		string
	>
	return keysOf(ids, ofType(items, 'question'))
}

function personKeys(items: SearchItem[]): ZoneProfile[] {
	const ids = Object.fromEntries(WORLD_PEOPLE.map((profile) => [profile, w.users[profile].id])) as Record<
		ZoneProfile,
		string
	>
	return keysOf(ids, ofType(items, 'user'))
}

function groupKeys(items: SearchItem[]): ZoneGroupKey[] {
	return keysOf(w.groups, ofType(items, 'group'))
}

function attemptKeys(items: SearchItem[]): ZoneAttemptKey[] {
	return keysOf(w.attempts, ofType(items, 'attempt'))
}

function worldItems(items: SearchItem[]): SearchItem[] {
	const ids = new Set<string>([
		...Object.values(w.topics).map((topic) => topic.id),
		...Object.values(w.tests).flatMap((item) => [item.id, item.questionId]),
		...WORLD_PEOPLE.map((profile) => w.users[profile].id),
		...Object.values(w.groups),
		...Object.values(w.attempts),
	])
	return items.filter((item) => ids.has(item.id))
}

async function searchAll(profile: ZoneProfile, scope: Scope | 'all', q: string): Promise<Category[]> {
	const reply = await call(ctx, 'GET', `/api/search?q=${encodeURIComponent(q)}&scope=${scope}&limit=25`, {
		cookies: w.users[profile].cookie,
	})
	assert.equal(reply.status, 200, `поиск ${scope}: ${reply.status} ${JSON.stringify(reply.body)}`)
	const categories = reply.body.categories
	assert.ok(Array.isArray(categories), `нет categories: ${JSON.stringify(reply.body)}`)
	return categories as Category[]
}

async function search(profile: ZoneProfile, scope: Scope, q = w.prefix): Promise<Category> {
	const categories = await searchAll(profile, scope, q)
	assert.equal(categories.length, 1, `категорий ${categories.length}`)
	const category = categories[0]
	assert.ok(category, 'нет категории')
	assert.equal(category.scope, scope)
	return category
}

function expectHrefs(items: SearchItem[], prefix: string): void {
	for (const item of worldItems(items)) {
		assert.ok(item.href.startsWith(prefix), `${item.type} ${item.id}: ${item.href}`)
	}
}

const ROWS: Row[] = []

function row(profiles: ZoneProfile[], route: string, title: string, run: (profile: ZoneProfile) => Promise<void>) {
	for (const profile of profiles) ROWS.push({ profile, route, title, run })
}

function unavailable(profiles: ZoneProfile[], scope: Scope, q?: string): void {
	row(profiles, `GET /search ${scope}`, 'категория недоступна', async (p) => {
		const category = await search(p, scope, q)
		assert.equal(category.available, false)
		assert.deepEqual(category.items, [])
	})
}

row(['admin'], 'GET /search tests', 'разделы X Y Z и все тесты со ссылками /admin/tests/', async (p) => {
	const { items } = await search(p, 'tests')
	assert.deepEqual(topicKeys(items), ['X', 'Y', 'Z'])
	assert.deepEqual(testKeys(items), ['tX', 'tX2', 'tY', 'tZ'])
	expectHrefs(items, '/admin/tests/')
})
row(['teacherA'], 'GET /search tests', 'только раздел X и тесты tX tX2', async (p) => {
	const { items } = await search(p, 'tests')
	assert.deepEqual(topicKeys(items), ['X'])
	assert.deepEqual(testKeys(items), ['tX', 'tX2'])
	expectHrefs(items, '/admin/tests/')
})
row(['s1'], 'GET /search tests', 'только назначенные опубликованные тесты со ссылками /tests/', async (p) => {
	const { items } = await search(p, 'tests')
	assert.deepEqual(topicKeys(items), [])
	assert.deepEqual(testKeys(items), ['tX', 'tX2'])
	expectHrefs(items, '/tests/')
})
row(['readTests'], 'GET /search tests', 'пусто', async (p) => {
	const { items } = await search(p, 'tests')
	assert.deepEqual(worldItems(items), [])
})

row(['admin'], 'GET /search questions', 'вопросы всех тестов', async (p) => {
	const category = await search(p, 'questions', QUESTION_QUERY)
	assert.equal(category.available, true)
	assert.deepEqual(questionKeys(category.items), ['tX', 'tX2', 'tY', 'tZ'])
})
row(['teacherA'], 'GET /search questions', 'только вопросы tX и tX2', async (p) => {
	const category = await search(p, 'questions', QUESTION_QUERY)
	assert.equal(category.available, true)
	assert.deepEqual(questionKeys(category.items), ['tX', 'tX2'])
})
unavailable(['s1'], 'questions', QUESTION_QUERY)

row(['admin'], 'GET /search users', 'все люди мира', async (p) => {
	const { items } = await search(p, 'users')
	assert.deepEqual(personKeys(items), [...WORLD_PEOPLE].sort())
})
row(['teacherA'], 'GET /search users', 'только s1 и invited', async (p) => {
	const { items } = await search(p, 'users')
	assert.deepEqual(personKeys(items), ['invited', 's1'])
})
unavailable(['s1'], 'users')

row(['admin'], 'GET /search groups', 'G GB GA', async (p) => {
	const { items } = await search(p, 'groups')
	assert.deepEqual(groupKeys(items), ['G', 'GA', 'GB'])
})
row(['teacherA'], 'GET /search groups', 'только G', async (p) => {
	const { items } = await search(p, 'groups')
	assert.deepEqual(groupKeys(items), ['G'])
})
unavailable(['s1'], 'groups')

row(['admin'], 'GET /search attempts', 'все попытки мира со ссылками /admin/attempts/', async (p) => {
	const { items } = await search(p, 'attempts')
	assert.deepEqual(attemptKeys(items), ['s1X', 's2X', 's2Y', 's3Y', 'teacherAX'])
	expectHrefs(items, '/admin/attempts/')
})
row(['teacherA'], 'GET /search attempts', 'только попытки по тестам раздела X', async (p) => {
	const { items } = await search(p, 'attempts')
	assert.deepEqual(attemptKeys(items), ['s1X', 's2X', 'teacherAX'])
})
row(['s3'], 'GET /search attempts', 'пусто: назначение tY снято', async (p) => {
	const { items } = await search(p, 'attempts')
	assert.deepEqual(worldItems(items), [])
})
row(['s1'], 'GET /search attempts', 'только своя s1X', async (p) => {
	const { items } = await search(p, 'attempts')
	assert.deepEqual(attemptKeys(items), ['s1X'])
	assert.deepEqual(
		worldItems(items).map((item) => item.id),
		[w.attempts.s1X]
	)
})

row(['admin'], 'GET /search all', 'порядок категорий tests questions users groups attempts', async (p) => {
	const categories = await searchAll(p, 'all', w.prefix)
	assert.deepEqual(
		categories.map((category) => category.scope),
		SCOPES
	)
})

beforeAll(async () => {
	ctx = await startAuthApp('test_tz_search')
	w = await seedTeacherZoneWorld(ctx, 'tzsrch')
	await ctx.pgPool.query('DELETE FROM test_assignments WHERE test_id = $1 AND user_id = $2', [
		w.tests.tY.id,
		w.users.s3.id,
	])
}, 180_000)

afterAll(async () => {
	await ctx?.stop()
})

describe('матрица зоны учителя: поиск', () => {
	const seen = new Set<string>()
	for (const item of ROWS) {
		const id = `${item.profile} ${item.route}`
		assert.ok(!seen.has(id), `повтор id ${id}`)
		seen.add(id)
		check(id, item.title, () => item.run(item.profile))
	}
	for (const id of KNOWN_DEFECTS) assert.ok(seen.has(id), `KNOWN_DEFECTS без строки ${id}`)
})

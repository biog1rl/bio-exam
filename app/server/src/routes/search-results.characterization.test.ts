import assert from 'node:assert/strict'
import { afterAll, beforeAll, describe, test } from 'vitest'

import { call, startAuthApp, type AuthApp } from '../test-support/auth-app.js'
import { seedTeacherZoneWorld, type TeacherZoneWorld, type ZoneProfile } from '../test-support/teacher-zone-world.js'

type SearchItem = { type: string; id: string }

type Category = { scope: string; available: boolean; items: SearchItem[] }

type Snapshot = [scope: string, available: boolean, keys: string[]]

type QueryKey = 'question' | 'surname'

type Profile = Extract<
	ZoneProfile,
	'admin' | 'teacherA' | 'teacherB' | 's1' | 'readTests' | 'readUsers' | 'adminNoZone'
>

const PROFILES: Profile[] = ['admin', 'teacherA', 'teacherB', 's1', 'readTests', 'readUsers', 'adminNoZone']

const QUERY_KEYS: QueryKey[] = ['question', 'surname']

const EXPECTED: Record<Profile, Record<QueryKey, Snapshot[]>> = {
	admin: {
		question: [
			['tests', true, []],
			['questions', true, ['question:tX', 'question:tX2', 'question:tY', 'question:tZ']],
			['users', true, []],
			['groups', true, []],
			['attempts', true, []],
		],
		surname: [
			['tests', true, ['topic:X', 'topic:Y', 'topic:Z', 'test:tX', 'test:tY', 'test:tZ', 'test:tX2']],
			['questions', true, []],
			[
				'users',
				true,
				[
					'user:s1',
					'user:s2',
					'user:s3',
					'user:admin',
					'user:invited',
					'user:teacherA',
					'user:teacherB',
					'user:readTests',
					'user:readUsers',
					'user:teacherOff',
					'user:adminNoZone',
					'user:readTestsAll',
					'user:readUsersAll',
				],
			],
			['groups', true, ['group:GA', 'group:GB', 'group:G']],
			['attempts', true, ['attempt:teacherAX', 'attempt:s3Y', 'attempt:s2Y', 'attempt:s2X', 'attempt:s1X']],
		],
	},
	teacherA: {
		question: [
			['tests', true, []],
			['questions', true, ['question:tX', 'question:tX2']],
			['users', true, []],
			['groups', true, []],
			['attempts', true, []],
		],
		surname: [
			['tests', true, ['topic:X', 'test:tX', 'test:tX2']],
			['questions', true, []],
			['users', true, ['user:s1', 'user:invited']],
			['groups', true, ['group:G']],
			['attempts', true, ['attempt:s1X', 'attempt:s2X']],
		],
	},
	teacherB: {
		question: [
			['tests', true, []],
			['questions', true, ['question:tY']],
			['users', true, []],
			['groups', true, []],
			['attempts', true, []],
		],
		surname: [
			['tests', true, ['topic:Y', 'test:tY']],
			['questions', true, []],
			['users', true, ['user:s3']],
			['groups', true, ['group:GB']],
			['attempts', true, ['attempt:s3Y', 'attempt:s2Y']],
		],
	},
	s1: {
		question: [
			['tests', true, []],
			['questions', false, []],
			['users', false, []],
			['groups', false, []],
			['attempts', true, []],
		],
		surname: [
			['tests', true, ['test:tX', 'test:tX2']],
			['questions', false, []],
			['users', false, []],
			['groups', false, []],
			['attempts', true, ['attempt:s1X']],
		],
	},
	readTests: {
		question: [
			['tests', true, []],
			['questions', false, []],
			['users', false, []],
			['groups', false, []],
			['attempts', true, []],
		],
		surname: [
			['tests', true, []],
			['questions', false, []],
			['users', false, []],
			['groups', false, []],
			['attempts', true, []],
		],
	},
	readUsers: {
		question: [
			['tests', true, []],
			['questions', false, []],
			['users', true, []],
			['groups', false, []],
			['attempts', true, []],
		],
		surname: [
			['tests', true, []],
			['questions', false, []],
			['users', true, []],
			['groups', false, []],
			['attempts', true, []],
		],
	},
	adminNoZone: {
		question: [
			['tests', true, []],
			['questions', false, []],
			['users', true, []],
			['groups', true, []],
			['attempts', true, []],
		],
		surname: [
			['tests', true, []],
			['questions', false, []],
			['users', true, []],
			['groups', true, []],
			['attempts', true, []],
		],
	},
}

let ctx: AuthApp
let w: TeacherZoneWorld
let worldKeys: Map<string, string>

function queryText(key: QueryKey): string {
	if (key === 'question') return 'половая клетка'
	return `Фамилия ${w.prefix} s1`
}

function buildWorldKeys(): Map<string, string> {
	const keys = new Map<string, string>()
	for (const [key, topic] of Object.entries(w.topics)) keys.set(`topic:${topic.id}`, `topic:${key}`)
	for (const [key, item] of Object.entries(w.tests)) {
		keys.set(`test:${item.id}`, `test:${key}`)
		keys.set(`question:${item.questionId}`, `question:${key}`)
	}
	for (const [key, user] of Object.entries(w.users)) keys.set(`user:${user.id}`, `user:${key}`)
	for (const [key, id] of Object.entries(w.groups)) keys.set(`group:${id}`, `group:${key}`)
	for (const [key, id] of Object.entries(w.attempts)) keys.set(`attempt:${id}`, `attempt:${key}`)
	return keys
}

function snapshotOf(categories: Category[]): Snapshot[] {
	return categories.map((category) => [
		category.scope,
		category.available,
		category.items.map((item) => {
			const key = worldKeys.get(`${item.type}:${item.id}`)
			assert.ok(key, `строка вне мира в ${category.scope}: ${item.type}:${item.id}`)
			return key
		}),
	])
}

async function searchAll(profile: ZoneProfile, q: string): Promise<{ categories: Category[]; total: number }> {
	const reply = await call(ctx, 'GET', `/api/search?q=${encodeURIComponent(q)}&scope=all&limit=25`, {
		cookies: w.users[profile].cookie,
	})
	assert.equal(reply.status, 200, `поиск ${profile}: ${reply.status} ${JSON.stringify(reply.body)}`)
	const categories = reply.body.categories
	assert.ok(Array.isArray(categories), `нет categories: ${JSON.stringify(reply.body)}`)
	return { categories: categories as Category[], total: reply.body.total as number }
}

beforeAll(async () => {
	ctx = await startAuthApp('test_search_char')
	w = await seedTeacherZoneWorld(ctx, 'srchchr')
	worldKeys = buildWorldKeys()
}, 180_000)

afterAll(async () => {
	await ctx?.stop()
})

describe('характеризация выдачи GET /api/search по профилям мира 07.1', () => {
	for (const profile of PROFILES) {
		for (const key of QUERY_KEYS) {
			test(`${profile} ${key}`, async () => {
				const { categories, total } = await searchAll(profile, queryText(key))
				assert.equal(
					total,
					categories.reduce((sum, category) => sum + category.items.length, 0)
				)
				assert.deepEqual(snapshotOf(categories), EXPECTED[profile][key])
			})
		}
	}
})

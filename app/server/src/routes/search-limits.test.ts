import assert from 'node:assert/strict'
import { afterAll, beforeAll, describe, test } from 'vitest'

import { call, login, seedUser, startAuthApp, type AuthApp, type CookieJar } from '../test-support/auth-app.js'
import { instrumentPool } from '../test-support/probes.js'

const PASSWORD = 'search-limits-password-1'
const LIMIT = 60

let ctx: AuthApp
let adminJar: CookieJar
let otherJar: CookieJar

beforeAll(async () => {
	ctx = await startAuthApp('test_search_limits')
	await seedUser(ctx, { login: 'srchlim_admin', roles: ['admin'], password: PASSWORD })
	await seedUser(ctx, { login: 'srchlim_other', roles: ['admin'], password: PASSWORD })
	const admin = await login(ctx, 'srchlim_admin', PASSWORD)
	assert.equal(admin.status, 200)
	const other = await login(ctx, 'srchlim_other', PASSWORD)
	assert.equal(other.status, 200)
	adminJar = admin.jar
	otherJar = other.jar
}, 60_000)

afterAll(async () => {
	await ctx?.stop()
})

describe('GET /api/search: нагрузка на пул и частота', () => {
	test('вызов поиска администратора делает пять запросов к пулу, одновременно не больше двух', async () => {
		const { searchDatabase } = await import('../services/search/database-search.js')
		const probe = instrumentPool(ctx.pgPool)
		try {
			probe.reset()
			await searchDatabase({
				query: 'клетка',
				scope: 'all',
				limit: 10,
				access: {
					userId: '00000000-0000-4000-8000-000000000001',
					permissions: new Set(['tests.write', 'users.read', 'groups.manage_groups']),
					tests: { all: true },
					groups: { all: true },
					users: { all: true },
				},
			})
			assert.deepEqual(probe.snapshot(), { queries: 5, maxConcurrent: 2 })
		} finally {
			probe.restore()
		}
	})

	test(`${LIMIT} запросов в минуту проходят, ${LIMIT + 1}-й получает 429, другой пользователь не задет`, async () => {
		for (let index = 0; index < LIMIT; index += 1) {
			const reply = await call(ctx, 'GET', '/api/search?q=%D0%BA%D0%BB&scope=tests', { cookies: adminJar })
			assert.equal(reply.status, 200, `запрос ${index + 1}: ${reply.status}`)
		}
		const limited = await call(ctx, 'GET', '/api/search?q=%D0%BA%D0%BB&scope=tests', { cookies: adminJar })
		assert.equal(limited.status, 429)
		assert.ok(Number(limited.headers.get('retry-after')) > 0)
		const other = await call(ctx, 'GET', '/api/search?q=%D0%BA%D0%BB&scope=tests', { cookies: otherJar })
		assert.equal(other.status, 200)
	}, 60_000)
})

import assert from 'node:assert/strict'
import { afterAll, beforeAll, describe, test } from 'vitest'

import { call, login, seedUser, startAuthApp, type AuthApp, type CookieJar } from '../../test-support/auth-app.js'

type Json = Record<string, unknown>

const PASSWORD = 'users-list-password-1'
const PERSONAL_KEYS = ['login', 'phone', 'email', 'telegram', 'birthdate', 'roles', 'isActive']

const KNOWN_DEFECTS = new Set<string>()

function defectTest(id: string, title: string, fn: () => Promise<void>, timeout?: number): void {
	const run = KNOWN_DEFECTS.has(id) ? test.fails : test
	run(`${id}: ${title}`, fn, timeout)
}

let ctx: AuthApp
let adminJar: CookieJar
let userJar: CookieJar

beforeAll(async () => {
	ctx = await startAuthApp('test_users_list_char')
	await seedUser(ctx, { login: 'users_list_admin', roles: ['admin'], password: PASSWORD })
	await seedUser(ctx, { login: 'users_list_user', roles: ['user'], password: PASSWORD })
	const admin = await login(ctx, 'users_list_admin', PASSWORD)
	assert.equal(admin.status, 200)
	adminJar = admin.jar
	const user = await login(ctx, 'users_list_user', PASSWORD)
	assert.equal(user.status, 200)
	userJar = user.jar
}, 60_000)

afterAll(async () => {
	await ctx?.stop()
})

describe('GET /api/users', () => {
	test('без cookie сессии ответ 401', async () => {
		const reply = await call(ctx, 'GET', '/api/users')
		assert.equal(reply.status, 401)
		assert.equal(reply.body.error, 'Unauthorized')
	})

	test('администратор получает 200 с полным набором полей пользователя', async () => {
		const reply = await call(ctx, 'GET', '/api/users', { cookies: adminJar })
		assert.equal(reply.status, 200)
		const rows = reply.body.rows as Json[]
		assert.ok(Array.isArray(rows))
		assert.ok(rows.length >= 2)
		for (const row of rows) {
			for (const key of PERSONAL_KEYS) assert.ok(key in row, `нет поля ${key}`)
		}
		const logins = rows.map((row) => row.login)
		assert.ok(logins.includes('users_list_admin'))
		assert.ok(logins.includes('users_list_user'))
	})

	test('?limit=1 отдаёт одну строку, total не меньше 2', async () => {
		const reply = await call(ctx, 'GET', '/api/users?limit=1', { cookies: adminJar })
		assert.equal(reply.status, 200)
		assert.equal((reply.body.rows as Json[]).length, 1)
		assert.ok(Number(reply.body.total) >= 2)
	})
})

describe('известные дефекты списка пользователей (D-23)', () => {
	defectTest('PRIV-user-gets-users', 'пользователь с ролью user не получает список пользователей', async () => {
		const reply = await call(ctx, 'GET', '/api/users', { cookies: userJar })
		assert.equal(reply.status, 403)
	})
})

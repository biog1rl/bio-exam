import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { afterAll, beforeAll, describe, test } from 'vitest'

import { call, login, seedUser, startAuthApp, type AuthApp, type CookieJar } from '../../test-support/auth-app.js'

type Json = Record<string, unknown>

const PASSWORD = 'user-lookup-password-1'
const BULK_COUNT = 150
const NOT_FOUND = { error: 'Пользователь не найден' }

let ctx: AuthApp
let adminJar: CookieJar
let denyJar: CookieJar
let lastId: string
const ids = new Map<string, string>()

function idOf(login: string): string {
	const value = ids.get(login)
	assert.ok(value, `нет пользователя ${login}`)
	return value
}

async function seedBulk(): Promise<void> {
	const result = await ctx.pgPool.query<{ id: string; login: string }>(
		`INSERT INTO users (login, first_name, last_name, is_active, created_at)
		SELECT 'd7-user-' || lpad(n::text, 3, '0'), 'Имя ' || n, 'Фамилия ' || n, true, now() - make_interval(mins => n)
		FROM generate_series(1, $1::int) AS n
		RETURNING id, login`,
		[BULK_COUNT]
	)
	for (const row of result.rows) ids.set(row.login, row.id)
	lastId = idOf('d7-user-150')
	const [group] = await ctx.db
		.insert(ctx.schema.studentGroups)
		.values({ name: 'Группа d7' })
		.returning({ id: ctx.schema.studentGroups.id })
	assert.ok(group)
	await ctx.db.insert(ctx.schema.userGroups).values({ groupId: group.id, userId: lastId })
	await ctx.db.insert(ctx.schema.roles).values({ key: 'user' }).onConflictDoNothing()
	await ctx.db.insert(ctx.schema.userRoles).values({ userId: lastId, roleKey: 'user' })
	await ctx.pgPool.query(
		`UPDATE users SET avatar_cropped = 'avatars/d7-user-150-cropped.webp', phone = '+70000000150', created_by = $2 WHERE id = $1`,
		[lastId, idOf('lookup_admin')]
	)
}

async function seedPlain(login: string): Promise<void> {
	const result = await ctx.pgPool.query<{ id: string }>(
		'INSERT INTO users (login, is_active) VALUES ($1, true) RETURNING id',
		[login]
	)
	ids.set(login, result.rows[0].id)
}

async function listRow(id: string): Promise<Json> {
	const reply = await call(ctx, 'GET', '/api/users?limit=500', { cookies: adminJar })
	assert.equal(reply.status, 200)
	const rows = reply.body.rows as Json[]
	const row = rows.find((item) => item.id === id)
	assert.ok(row, `нет строки ${id} в списке`)
	return row
}

beforeAll(async () => {
	ctx = await startAuthApp('test_user_lookup')
	ids.set('lookup_admin', await seedUser(ctx, { login: 'lookup_admin', roles: ['admin'], password: PASSWORD }))
	const denyId = await seedUser(ctx, { login: 'lookup_admin_deny', roles: ['admin'], password: PASSWORD })
	await ctx.pgPool.query('INSERT INTO rbac_user_grants (user_id, domain, action, allow) VALUES ($1, $2, $3, $4)', [
		denyId,
		'users',
		'read',
		false,
	])
	await seedBulk()
	await seedPlain('Ivan.Petrov')
	await seedPlain('Dup.User')
	await seedPlain('dup.user')
	const admin = await login(ctx, 'lookup_admin', PASSWORD)
	assert.equal(admin.status, 200)
	adminJar = admin.jar
	const deny = await login(ctx, 'lookup_admin_deny', PASSWORD)
	assert.equal(deny.status, 200)
	denyJar = deny.jar
}, 120_000)

afterAll(async () => {
	await ctx?.stop()
})

describe('GET /api/users/:id', () => {
	test('150-й пользователь вне первой страницы списка находится по id, тело равно строке списка', async () => {
		const page = await call(ctx, 'GET', '/api/users', { cookies: adminJar })
		assert.equal(page.status, 200)
		assert.ok(!(page.body.rows as Json[]).some((item) => item.id === lastId), '150-й попал в первую страницу')
		const reply = await call(ctx, 'GET', `/api/users/${lastId}`, { cookies: adminJar })
		assert.equal(reply.status, 200, JSON.stringify(reply.body))
		assert.deepEqual(Object.keys(reply.body), ['user'])
		const row = await listRow(lastId)
		assert.deepEqual(reply.body.user, row)
		const user = reply.body.user as Json
		assert.equal(user.login, 'd7-user-150')
		assert.equal(typeof user.avatarCropped, 'string')
		assert.notEqual(user.avatarCropped, 'avatars/d7-user-150-cropped.webp')
		assert.equal(user.createdByName, 'lookup_admin')
		assert.equal((user.groups as Json[]).length, 1)
	})

	test('несуществующий id у администратора: 404 с текстом', async () => {
		const reply = await call(ctx, 'GET', `/api/users/${crypto.randomUUID()}`, { cookies: adminJar })
		assert.equal(reply.status, 404)
		assert.deepEqual(reply.body, NOT_FOUND)
	})

	test('id не UUID: 400', async () => {
		const reply = await call(ctx, 'GET', '/api/users/not-a-uuid', { cookies: adminJar })
		assert.equal(reply.status, 400)
	})

	test('без cookie: 401', async () => {
		const reply = await call(ctx, 'GET', `/api/users/${lastId}`)
		assert.equal(reply.status, 401)
		assert.equal(reply.body.error, 'Unauthorized')
	})

	test('администратор с запретом users.read: 403', async () => {
		const reply = await call(ctx, 'GET', `/api/users/${lastId}`, { cookies: denyJar })
		assert.equal(reply.status, 403)
	})
})

describe('GET /api/users/by-login/:login', () => {
	test('логин в другом регистре находит 150-го, тело равно ответу по id', async () => {
		const byId = await call(ctx, 'GET', `/api/users/${lastId}`, { cookies: adminJar })
		assert.equal(byId.status, 200)
		const reply = await call(ctx, 'GET', '/api/users/by-login/D7-USER-150', { cookies: adminJar })
		assert.equal(reply.status, 200, JSON.stringify(reply.body))
		assert.deepEqual(reply.body, byId.body)
	})

	test('логин со смешанным регистром находится по точному написанию, в нижнем регистре и с пробелами', async () => {
		const expected = await listRow(idOf('Ivan.Petrov'))
		for (const path of ['Ivan.Petrov', 'ivan.petrov', '%20Ivan.Petrov%20']) {
			const reply = await call(ctx, 'GET', `/api/users/by-login/${path}`, { cookies: adminJar })
			assert.equal(reply.status, 200, `${path}: ${JSON.stringify(reply.body)}`)
			assert.deepEqual(reply.body.user, expected, path)
		}
	})

	test('два логина, различающиеся регистром: точное совпадение находит своего, иначе не найден', async () => {
		const exact = await call(ctx, 'GET', '/api/users/by-login/dup.user', { cookies: adminJar })
		assert.equal(exact.status, 200)
		assert.equal((exact.body.user as Json).id, idOf('dup.user'))
		const upper = await call(ctx, 'GET', '/api/users/by-login/Dup.User', { cookies: adminJar })
		assert.equal(upper.status, 200)
		assert.equal((upper.body.user as Json).id, idOf('Dup.User'))
		const ambiguous = await call(ctx, 'GET', '/api/users/by-login/DUP.USER', { cookies: adminJar })
		assert.equal(ambiguous.status, 404)
		assert.deepEqual(ambiguous.body, NOT_FOUND)
	})

	test('несуществующий логин у администратора: 404 с текстом', async () => {
		const reply = await call(ctx, 'GET', '/api/users/by-login/no-such-login', { cookies: adminJar })
		assert.equal(reply.status, 404)
		assert.deepEqual(reply.body, NOT_FOUND)
	})

	test('администратор с запретом users.read: 403', async () => {
		const reply = await call(ctx, 'GET', '/api/users/by-login/d7-user-150', { cookies: denyJar })
		assert.equal(reply.status, 403)
	})

	test('без cookie: 401', async () => {
		const reply = await call(ctx, 'GET', '/api/users/by-login/d7-user-150')
		assert.equal(reply.status, 401)
		assert.equal(reply.body.error, 'Unauthorized')
	})
})

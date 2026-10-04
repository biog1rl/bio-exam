import assert from 'node:assert/strict'
import { afterAll, beforeAll, describe, test } from 'vitest'

import { call, login, seedUser, startAuthApp, type AuthApp, type CookieJar } from '../../test-support/auth-app.js'

type Json = Record<string, unknown>

const PASSWORD = 'users-directory-password-1'
const DIRECTORY_KEYS = ['avatarColor', 'avatarCropped', 'firstName', 'id', 'initials', 'lastName', 'name']
const FULL_KEYS = ['login', 'phone', 'email', 'telegram', 'birthdate', 'roles', 'isActive']
const BULK_COUNT = 25

let ctx: AuthApp
const jars = new Map<string, CookieJar>()
const ids = new Map<string, string>()

function jar(name: string): CookieJar {
	const value = jars.get(name)
	assert.ok(value, `no session for ${name}`)
	return value
}

function idOf(name: string): string {
	const value = ids.get(name)
	assert.ok(value, `no seeded user ${name}`)
	return value
}

async function person(
	key: string,
	fields: { name: string | null; firstName?: string; lastName?: string; isActive?: boolean; avatarCropped?: string }
): Promise<string> {
	const id = await seedUser(ctx, {
		login: `dir_${key}`,
		roles: ['user'],
		password: PASSWORD,
		isActive: fields.isActive ?? true,
	})
	await ctx.pgPool.query(
		`UPDATE users SET name = $2, first_name = $3, last_name = $4, initials = 'ИП', avatar_color = '#123456', avatar_cropped = $5,
		 phone = '+70000000000', email = $6, telegram = '@dir', birthdate = '2000-01-01' WHERE id = $1`,
		[
			id,
			fields.name,
			fields.firstName ?? null,
			fields.lastName ?? null,
			fields.avatarCropped?.replace('<id>', id) ?? null,
			`${key}@example.test`,
		]
	)
	ids.set(key, id)
	return id
}

async function profile(name: string, roles: string[], grant?: boolean): Promise<void> {
	const id = await seedUser(ctx, { login: name, roles, password: PASSWORD })
	ids.set(name, id)
	if (grant !== undefined) {
		await ctx.pgPool.query(
			"INSERT INTO rbac_user_grants (user_id, domain, action, allow) VALUES ($1, 'users', 'read', $2)",
			[id, grant]
		)
	}
	const reply = await login(ctx, name, PASSWORD)
	assert.equal(reply.status, 200, `login ${name}`)
	jars.set(name, reply.jar)
}

async function directory(query: string, who = 'dir_user'): Promise<{ status: number; body: Json; users: Json[] }> {
	const reply = await call(ctx, 'GET', `/api/users/directory${query}`, { cookies: jar(who) })
	return { status: reply.status, body: reply.body, users: (reply.body.users as Json[] | undefined) ?? [] }
}

beforeAll(async () => {
	ctx = await startAuthApp('test_users_directory')
	await profile('dir_admin', ['admin'])
	await profile('dir_user', ['user'])
	await profile('dir_user_allow_users_read', ['user'], true)
	await profile('dir_admin_deny_users_read', ['admin'], false)

	await person('ivanov', {
		name: 'Иванов Пётр',
		firstName: 'Пётр',
		lastName: 'Иванов',
		avatarCropped: 'avatars/<id>/a.png',
	})
	await ctx.pgPool.query(
		`INSERT INTO users (login, name, is_active)
		 SELECT 'dir_bulk_' || g, 'Бурундуков ' || lpad(g::text, 2, '0'), true FROM generate_series(1, $1::int) AS g`,
		[BULK_COUNT]
	)
	await person('hidden_inactive', { name: 'Затаённый Призрак', isActive: false })
	await person('hidden_active', { name: 'Затаённый Видимый' })
	await person('percent', { name: 'Процент%_Подчерк' })
	await person('percent_plain', { name: 'Процентный Подчерк' })
	await person('backslash', { name: 'Слэш\\Тест' })
	await person('backslash_plain', { name: 'Слэш Тест' })
	await person('zzloginonly', { name: 'Обычное Имя' })
	await person('fox_contains', { name: 'Алиса Лис' })
	await person('fox_prefix', { name: 'Лиса Алиса' })
	await person('fox_exact', { name: 'Лис' })
	await person('full_name', { name: 'Петров', firstName: 'Семён', lastName: 'Кузькин' })
}, 120_000)

afterAll(async () => {
	await ctx?.stop()
})

describe('без сессии', () => {
	test('GET /api/users → 401', async () => {
		const reply = await call(ctx, 'GET', '/api/users')
		assert.equal(reply.status, 401)
	})

	test('GET /api/users/directory?q=Ив → 401', async () => {
		const reply = await call(ctx, 'GET', '/api/users/directory?q=%D0%98%D0%B2')
		assert.equal(reply.status, 401)
	})
})

describe('матрица прав GET /api/users', () => {
	test('user → 403', async () => {
		const reply = await call(ctx, 'GET', '/api/users', { cookies: jar('dir_user') })
		assert.equal(reply.status, 403)
	})

	test('admin → 200 с полным набором полей', async () => {
		const reply = await call(ctx, 'GET', '/api/users?limit=500', { cookies: jar('dir_admin') })
		assert.equal(reply.status, 200)
		const rows = reply.body.rows as Json[]
		assert.ok(rows.length > 0)
		for (const row of rows) {
			for (const key of FULL_KEYS) assert.ok(key in row, `нет поля ${key}`)
		}
		const ivanov = rows.find((row) => row.id === idOf('ivanov'))
		assert.ok(ivanov)
		assert.equal(ivanov.login, 'dir_ivanov')
		assert.equal(ivanov.phone, '+70000000000')
		assert.equal(ivanov.email, 'ivanov@example.test')
	})

	test('user + allow users.read → 200 с полным набором полей', async () => {
		const reply = await call(ctx, 'GET', '/api/users', { cookies: jar('dir_user_allow_users_read') })
		assert.equal(reply.status, 200)
		const rows = reply.body.rows as Json[]
		assert.ok(rows.length > 0)
		for (const row of rows) {
			for (const key of FULL_KEYS) assert.ok(key in row, `нет поля ${key}`)
		}
	})

	test('admin + deny users.read → 403', async () => {
		const reply = await call(ctx, 'GET', '/api/users', { cookies: jar('dir_admin_deny_users_read') })
		assert.equal(reply.status, 403)
	})

	test('admin получает все засеянные строки: число строк равно min(limit, число пользователей)', async () => {
		const { rows: counted } = await ctx.pgPool.query<{ n: number }>('SELECT count(*)::int AS n FROM users')
		const total = counted[0]?.n ?? 0
		for (const limit of [500, 7]) {
			const reply = await call(ctx, 'GET', `/api/users?limit=${limit}`, { cookies: jar('dir_admin') })
			assert.equal(reply.status, 200)
			assert.equal((reply.body.rows as Json[]).length, Math.min(limit, total))
			assert.equal(Number(reply.body.total), total)
		}
	})

	test('avatar и avatarCropped отдаются URL маршрута proxy', async () => {
		const reply = await call(ctx, 'GET', '/api/users?limit=500', { cookies: jar('dir_admin') })
		const ivanov = (reply.body.rows as Json[]).find((row) => row.id === idOf('ivanov'))
		assert.ok(ivanov)
		const key = `avatars/${idOf('ivanov')}/a.png`
		assert.ok(String(ivanov.avatarCropped).startsWith(`/api/docs/assets/proxy?path=${encodeURIComponent(key)}&`))
		assert.equal(ivanov.avatar, null)
	})
})

describe('GET /api/users/directory', () => {
	test('user → 200, у каждого элемента ровно семь ключей', async () => {
		const reply = await directory('?q=%D0%98%D0%B2')
		assert.equal(reply.status, 200)
		assert.deepEqual(Object.keys(reply.body), ['users'])
		assert.ok(reply.users.length > 0)
		for (const item of reply.users) assert.deepEqual(Object.keys(item).sort(), DIRECTORY_KEYS)
		assert.ok(reply.users.some((item) => item.id === idOf('ivanov')))
	})

	test('admin получает тот же минимальный набор ключей', async () => {
		const reply = await directory('?q=%D0%98%D0%B2', 'dir_admin')
		assert.equal(reply.status, 200)
		for (const item of reply.users) assert.deepEqual(Object.keys(item).sort(), DIRECTORY_KEYS)
	})

	test('без q → 400', async () => {
		const reply = await directory('')
		assert.equal(reply.status, 400)
		assert.equal(reply.body.error, 'Укажите не меньше 2 символов для поиска')
	})

	test('q из одного символа → 400, в том числе после trim', async () => {
		assert.equal((await directory(`?q=${encodeURIComponent('И')}`)).status, 400)
		assert.equal((await directory(`?q=${encodeURIComponent('  И  ')}`)).status, 400)
	})

	test('неактивный пользователь с подходящим именем не возвращается', async () => {
		const reply = await directory(`?q=${encodeURIComponent('Затаён')}`)
		assert.equal(reply.status, 200)
		assert.deepEqual(
			reply.users.map((item) => item.id),
			[idOf('hidden_active')]
		)
	})

	test('limit=50 при 25 подходящих → 20 элементов', async () => {
		const reply = await directory(`?q=${encodeURIComponent('Бурундук')}&limit=50`)
		assert.equal(reply.status, 200)
		assert.equal(reply.users.length, 20)
	})

	test('без limit → 10 элементов', async () => {
		const reply = await directory(`?q=${encodeURIComponent('Бурундук')}`)
		assert.equal(reply.status, 200)
		assert.equal(reply.users.length, 10)
	})

	test("q '%_' находит только имя, содержащее буквально '%_'", async () => {
		const reply = await directory(`?q=${encodeURIComponent('%_')}`)
		assert.equal(reply.status, 200)
		assert.deepEqual(
			reply.users.map((item) => item.id),
			[idOf('percent')]
		)
	})

	test('обратный слеш в q ищется буквально', async () => {
		const reply = await directory(`?q=${encodeURIComponent('ш\\Т')}`)
		assert.equal(reply.status, 200)
		assert.deepEqual(
			reply.users.map((item) => item.id),
			[idOf('backslash')]
		)
	})

	test('поиск по login не находит пользователя', async () => {
		const reply = await directory(`?q=${encodeURIComponent('zzloginonly')}`)
		assert.equal(reply.status, 200)
		assert.deepEqual(reply.users, [])
	})

	test('поиск по «first_name last_name» находит пользователя', async () => {
		const reply = await directory(`?q=${encodeURIComponent('Семён Кузь')}`)
		assert.equal(reply.status, 200)
		assert.deepEqual(
			reply.users.map((item) => item.id),
			[idOf('full_name')]
		)
	})

	test('точное совпадение name идёт первым, затем начало name', async () => {
		const reply = await directory(`?q=${encodeURIComponent('Лис')}`)
		assert.equal(reply.status, 200)
		assert.deepEqual(
			reply.users.map((item) => item.id),
			[idOf('fox_exact'), idOf('fox_prefix'), idOf('fox_contains')]
		)
	})

	test('avatarCropped с ключом avatars/<id>/a.png → URL маршрута proxy', async () => {
		const reply = await directory('?q=%D0%98%D0%B2')
		const ivanov = reply.users.find((item) => item.id === idOf('ivanov'))
		assert.ok(ivanov)
		const key = `avatars/${idOf('ivanov')}/a.png`
		assert.ok(String(ivanov.avatarCropped).startsWith(`/api/docs/assets/proxy?path=${encodeURIComponent(key)}&`))
	})
})

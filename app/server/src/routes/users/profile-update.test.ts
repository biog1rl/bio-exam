import assert from 'node:assert/strict'
import { afterAll, beforeAll, describe, test } from 'vitest'

import { call, login, seedUser, startAuthApp, type AuthApp, type CookieJar } from '../../test-support/auth-app.js'

type ProfileRow = {
	login: string | null
	first_name: string | null
	last_name: string | null
	avatar_color: string | null
	initials: string | null
	telegram: string | null
	phone: string | null
}

type Account = { id: string; login: string; jar: CookieJar }

const PASSWORD = 'profile-update-password-1'

let ctx: AuthApp
let accountCounter = 0

async function account(): Promise<Account> {
	accountCounter += 1
	const name = `profile_update_${accountCounter}`
	const id = await seedUser(ctx, { login: name, roles: ['user'], password: PASSWORD })
	const reply = await login(ctx, name, PASSWORD)
	assert.equal(reply.status, 200)
	return { id, login: name, jar: reply.jar }
}

async function profileRow(userId: string): Promise<ProfileRow> {
	const { rows } = await ctx.pgPool.query<ProfileRow>(
		'SELECT login, first_name, last_name, avatar_color, initials, telegram, phone FROM users WHERE id = $1',
		[userId]
	)
	const [row] = rows
	assert.ok(row)
	return row
}

beforeAll(async () => {
	ctx = await startAuthApp('test_profile_update')
}, 60_000)

afterAll(async () => {
	await ctx?.stop()
})

describe('PATCH /api/users/profile с пустыми полями', () => {
	test('null в необязательных полях сохраняется: профиль без фамилии, цвета и инициалов', async () => {
		const user = await account()
		const reply = await call(ctx, 'PATCH', '/api/users/profile', {
			cookies: user.jar,
			body: {
				firstName: 'Анна',
				lastName: null,
				login: user.login,
				avatar: null,
				avatarColor: null,
				initials: null,
				birthdate: null,
				telegram: null,
				phone: null,
				email: null,
			},
		})
		assert.equal(reply.status, 200, JSON.stringify(reply.body))
		const row = await profileRow(user.id)
		assert.equal(row.first_name, 'Анна')
		assert.equal(row.last_name, null)
		assert.equal(row.avatar_color, null)
		assert.equal(row.initials, null)
		assert.equal(row.login, user.login)
	})

	test('null очищает ранее заполненные поля', async () => {
		const user = await account()
		const filled = await call(ctx, 'PATCH', '/api/users/profile', {
			cookies: user.jar,
			body: { lastName: 'Иванова', avatarColor: '#3B82F6', initials: 'АИ', telegram: '@anna', phone: '+70000000000' },
		})
		assert.equal(filled.status, 200, JSON.stringify(filled.body))
		const cleared = await call(ctx, 'PATCH', '/api/users/profile', {
			cookies: user.jar,
			body: { lastName: null, avatarColor: null, initials: null, telegram: null, phone: null },
		})
		assert.equal(cleared.status, 200, JSON.stringify(cleared.body))
		const row = await profileRow(user.id)
		assert.equal(row.last_name, null)
		assert.equal(row.avatar_color, null)
		assert.equal(row.initials, null)
		assert.equal(row.telegram, null)
		assert.equal(row.phone, null)
	})

	test('login: null не стирает логин', async () => {
		const user = await account()
		const reply = await call(ctx, 'PATCH', '/api/users/profile', {
			cookies: user.jar,
			body: { login: null, firstName: 'Олег' },
		})
		assert.equal(reply.status, 200, JSON.stringify(reply.body))
		const row = await profileRow(user.id)
		assert.equal(row.login, user.login)
		assert.equal(row.first_name, 'Олег')
	})

	test('проверка формата остаётся: некорректный цвет даёт 400', async () => {
		const user = await account()
		const reply = await call(ctx, 'PATCH', '/api/users/profile', {
			cookies: user.jar,
			body: { avatarColor: 'red' },
		})
		assert.equal(reply.status, 400)
		assert.equal(reply.body.error, 'Ошибка валидации')
		assert.equal((await profileRow(user.id)).avatar_color, null)
	})
})

import assert from 'node:assert/strict'
import sharp from 'sharp'
import { afterAll, afterEach, beforeAll, beforeEach, describe, test, vi } from 'vitest'

import type { MemoryStorageAdapter } from '../../services/storage/adapters/memory.js'
import { storedAvatarValue } from '../../services/storage/links.js'
import {
	call,
	cookieHeader,
	login,
	nextIp,
	seedUser,
	startAuthApp,
	type AuthApp,
	type CookieJar,
} from '../../test-support/auth-app.js'
import { memoryStorage } from '../../test-support/storage.js'

type Json = Record<string, unknown>

type Reply = { status: number; body: Json }

type AvatarRow = {
	avatar: string | null
	avatar_cropped: string | null
	avatar_crop_x: number | null
	avatar_crop_rotation: number | null
}

type Account = { id: string; jar: CookieJar }

const PASSWORD = 'avatar-urls-password-1'
const SUPABASE_URL = 'https://x.supabase.co'
const CROP = {
	cropX: '0',
	cropY: '0',
	cropWidth: '32',
	cropHeight: '32',
	cropZoom: '1',
	cropRotation: '0',
}

let ctx: AuthApp
let mem: MemoryStorageAdapter
let tinyPng: Buffer
let accountCounter = 0

async function account(): Promise<Account> {
	accountCounter += 1
	const name = `avatar_urls_${accountCounter}`
	const id = await seedUser(ctx, { login: name, roles: ['user'], password: PASSWORD })
	const reply = await login(ctx, name, PASSWORD)
	assert.equal(reply.status, 200)
	return { id, jar: reply.jar }
}

async function postAvatar(jar: CookieJar, fields: Record<string, string>, withFile: boolean): Promise<Reply> {
	const form = new FormData()
	for (const [key, value] of Object.entries(fields)) form.append(key, value)
	if (withFile) form.append('avatar', new Blob([new Uint8Array(tinyPng)], { type: 'image/png' }), 'a.png')
	const response = await fetch(`${ctx.baseUrl}/api/users/avatar`, {
		method: 'POST',
		body: form,
		headers: { cookie: cookieHeader(jar), 'x-forwarded-for': nextIp() },
	})
	return { status: response.status, body: (await response.json()) as Json }
}

async function avatarRow(userId: string): Promise<AvatarRow> {
	const { rows } = await ctx.pgPool.query<AvatarRow>(
		'SELECT avatar, avatar_cropped, avatar_crop_x, avatar_crop_rotation FROM users WHERE id = $1',
		[userId]
	)
	const [row] = rows
	assert.ok(row)
	return row
}

async function setAvatar(userId: string, avatar: string | null, cropped: string | null = null): Promise<void> {
	await ctx.pgPool.query('UPDATE users SET avatar = $2, avatar_cropped = $3 WHERE id = $1', [userId, avatar, cropped])
}

function proxyUrlOf(key: string): string {
	return `/api/docs/assets/proxy?path=${encodeURIComponent(key)}&`
}

function supabaseUrlOf(key: string): string {
	return `${SUPABASE_URL}/storage/v1/object/public/main/${key}`
}

beforeAll(async () => {
	ctx = await startAuthApp('test_avatar_urls')
	mem = await memoryStorage()
	tinyPng = await sharp({
		create: { width: 64, height: 64, channels: 4, background: { r: 0, g: 128, b: 255, alpha: 1 } },
	})
		.png()
		.toBuffer()
}, 60_000)

beforeEach(() => {
	vi.stubEnv('SUPABASE_URL', SUPABASE_URL)
	vi.stubEnv('SUPABASE_STORAGE_BUCKET', 'main')
})

afterEach(() => {
	vi.unstubAllEnvs()
	mem?.clearFailures()
})

afterAll(async () => {
	await ctx?.stop()
})

describe('POST /api/users/avatar без файла: только кроп', () => {
	test('новый объект _cropped под avatars/<userId>/, прежний кроп удалён, в БД ключ нового кропа', async () => {
		const user = await account()
		const upload = await postAvatar(user.jar, CROP, true)
		assert.equal(upload.status, 200)
		const before = await avatarRow(user.id)
		assert.ok(before.avatar && before.avatar_cropped)

		const reply = await postAvatar(user.jar, { ...CROP, cropX: '8', cropY: '8', cropRotation: '90' }, false)
		assert.equal(reply.status, 200)
		const after = await avatarRow(user.id)
		assert.equal(after.avatar, before.avatar)
		assert.match(String(after.avatar_cropped), new RegExp(`^avatars/${user.id}/[0-9a-f]{24}_cropped\\.png$`))
		assert.notEqual(after.avatar_cropped, before.avatar_cropped)
		assert.equal(after.avatar_crop_x, 8)
		assert.equal(after.avatar_crop_rotation, 90)
		assert.deepEqual(mem.keys(`avatars/${user.id}`), [after.avatar, after.avatar_cropped].sort())
		assert.equal(mem.get(before.avatar_cropped), null)
		assert.ok(String(reply.body.avatarUrl).startsWith(proxyUrlOf(before.avatar)))
		assert.ok(String(reply.body.avatarCroppedUrl).startsWith(proxyUrlOf(String(after.avatar_cropped))))
		const meta = await sharp(mem.get(String(after.avatar_cropped))?.data).metadata()
		assert.equal(meta.width, 256)
		assert.equal(meta.height, 256)
	})

	test('оригинала по ключу нет в хранилище: 400 про отсутствие аватара', async () => {
		const user = await account()
		await setAvatar(user.id, `avatars/${user.id}/${'a'.repeat(24)}.png`)
		const reply = await postAvatar(user.jar, CROP, false)
		assert.equal(reply.status, 400)
		assert.equal(reply.body.error, 'Нет загруженного аватара для редактирования')
		assert.deepEqual(mem.keys(`avatars/${user.id}`), [])
	})

	test('в БД посторонний URL: 400 про отсутствие аватара', async () => {
		const user = await account()
		await setAvatar(user.id, 'https://example.com/a.png')
		const reply = await postAvatar(user.jar, CROP, false)
		assert.equal(reply.status, 400)
		assert.equal(reply.body.error, 'Нет загруженного аватара для редактирования')
	})
})

describe('POST /api/users/avatar с файлом: прежние объекты', () => {
	test('прежнее значение — публичный URL Supabase своего бакета: объект по ключу из URL удалён', async () => {
		const user = await account()
		const oldKey = `avatars/${user.id}/old.png`
		const oldCroppedKey = `avatars/${user.id}/old_cropped.png`
		mem.put(oldKey, tinyPng, 'image/png')
		mem.put(oldCroppedKey, tinyPng, 'image/png')
		await setAvatar(user.id, supabaseUrlOf(oldKey), supabaseUrlOf(oldCroppedKey))

		const reply = await postAvatar(user.jar, CROP, true)
		assert.equal(reply.status, 200)
		assert.equal(mem.get(oldKey), null)
		assert.equal(mem.get(oldCroppedKey), null)
		const row = await avatarRow(user.id)
		assert.deepEqual(mem.keys(`avatars/${user.id}`), [row.avatar, row.avatar_cropped].sort())
	})

	test('прежнее значение — ключ другого пользователя: чужой объект не удаляется', async () => {
		const user = await account()
		const other = await account()
		const foreignKey = `avatars/${other.id}/foreign.png`
		mem.put(foreignKey, tinyPng, 'image/png')
		await setAvatar(user.id, foreignKey)

		const reply = await postAvatar(user.jar, CROP, true)
		assert.equal(reply.status, 200)
		assert.ok(mem.get(foreignKey))
	})

	test('сбой удаления прежнего объекта: ответ 200, новое значение записано', async () => {
		const user = await account()
		const first = await postAvatar(user.jar, CROP, true)
		assert.equal(first.status, 200)
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
		mem.failOn({ op: 'remove', prefix: `avatars/${user.id}` })
		try {
			const reply = await postAvatar(user.jar, CROP, true)
			assert.equal(reply.status, 200)
			const row = await avatarRow(user.id)
			assert.ok(String(reply.body.avatarUrl).startsWith(proxyUrlOf(String(row.avatar))))
			assert.ok(warn.mock.calls.some((args) => args[0] === '[assets] orphan objects'))
		} finally {
			warn.mockRestore()
		}
	})
})

describe('DELETE /api/users/avatar', () => {
	test('удаляет свои объекты и поля аватара, объекты другого пользователя на месте', async () => {
		const user = await account()
		const other = await account()
		assert.equal((await postAvatar(user.jar, CROP, true)).status, 200)
		assert.equal((await postAvatar(other.jar, CROP, true)).status, 200)
		const otherKeys = mem.keys(`avatars/${other.id}`)
		assert.equal(otherKeys.length, 2)

		const reply = await call(ctx, 'DELETE', '/api/users/avatar', { cookies: user.jar })
		assert.equal(reply.status, 200)
		assert.deepEqual(reply.body, { message: 'Аватар удален' })
		assert.deepEqual(mem.keys(`avatars/${user.id}`), [])
		assert.deepEqual(mem.keys(`avatars/${other.id}`), otherKeys)
		const row = await avatarRow(user.id)
		assert.equal(row.avatar, null)
		assert.equal(row.avatar_cropped, null)
		assert.equal(row.avatar_crop_x, null)
		assert.equal(row.avatar_crop_rotation, null)
		const otherRow = await avatarRow(other.id)
		assert.ok(otherRow.avatar)
	})

	test('без cookie сессии: 401', async () => {
		const reply = await call(ctx, 'DELETE', '/api/users/avatar')
		assert.equal(reply.status, 401)
	})
})

describe('PATCH /api/users/profile: avatar', () => {
	test('публичный URL Supabase своего бакета записывается ключом, в ответе URL по правилу модуля', async () => {
		const user = await account()
		const key = `avatars/${user.id}/a.png`
		const reply = await call(ctx, 'PATCH', '/api/users/profile', {
			cookies: user.jar,
			body: { avatar: supabaseUrlOf(key) },
		})
		assert.equal(reply.status, 200)
		assert.equal((await avatarRow(user.id)).avatar, key)
		const body = reply.body.user as Json
		assert.ok(String(body.avatar).startsWith(proxyUrlOf(key)))
	})

	test('посторонний URL записывается как есть', async () => {
		const user = await account()
		const reply = await call(ctx, 'PATCH', '/api/users/profile', {
			cookies: user.jar,
			body: { avatar: 'https://example.com/a.png' },
		})
		assert.equal(reply.status, 200)
		assert.equal((await avatarRow(user.id)).avatar, 'https://example.com/a.png')
		assert.equal((reply.body.user as Json).avatar, 'https://example.com/a.png')
	})

	test("avatar '' записывается как null", async () => {
		const user = await account()
		await setAvatar(user.id, `avatars/${user.id}/a.png`)
		const reply = await call(ctx, 'PATCH', '/api/users/profile', { cookies: user.jar, body: { avatar: '' } })
		assert.equal(reply.status, 200)
		assert.equal((await avatarRow(user.id)).avatar, null)
		assert.equal((reply.body.user as Json).avatar, null)
	})

	test('без поля avatar значение в БД не меняется', async () => {
		const user = await account()
		const key = `avatars/${user.id}/a.png`
		await setAvatar(user.id, key)
		const reply = await call(ctx, 'PATCH', '/api/users/profile', { cookies: user.jar, body: { firstName: 'Имя' } })
		assert.equal(reply.status, 200)
		assert.equal((await avatarRow(user.id)).avatar, key)
		assert.ok(String((reply.body.user as Json).avatar).startsWith(proxyUrlOf(key)))
	})

	test('storedAvatarValue: URL своего бакета → ключ, посторонний URL как есть, пусто → null', () => {
		assert.equal(storedAvatarValue(supabaseUrlOf('avatars/u/a.png')), 'avatars/u/a.png')
		assert.equal(storedAvatarValue('https://example.com/a.png'), 'https://example.com/a.png')
		assert.equal(storedAvatarValue(''), null)
	})
})

describe('GET /api/auth/me: avatar', () => {
	async function me(jar: CookieJar): Promise<Json> {
		const reply = await call(ctx, 'GET', '/api/auth/me', { cookies: jar })
		assert.equal(reply.status, 200)
		return reply.body.user as Json
	}

	test('ключ в БД → URL proxy', async () => {
		const user = await account()
		const key = `avatars/${user.id}/a.png`
		const croppedKey = `avatars/${user.id}/a_cropped.png`
		await setAvatar(user.id, key, croppedKey)
		const body = await me(user.jar)
		assert.ok(String(body.avatar).startsWith(proxyUrlOf(key)))
		assert.ok(String(body.avatarCropped).startsWith(proxyUrlOf(croppedKey)))
	})

	test('публичный URL своего бакета и /uploads/avatars/… → URL по правилу модуля', async () => {
		const user = await account()
		await setAvatar(user.id, supabaseUrlOf(`avatars/${user.id}/a.png`), '/uploads/avatars/legacy.png')
		const body = await me(user.jar)
		assert.ok(String(body.avatar).startsWith(proxyUrlOf(`avatars/${user.id}/a.png`)))
		assert.ok(String(body.avatarCropped).startsWith(proxyUrlOf('avatars/legacy.png')))
	})

	test('посторонний URL → как есть', async () => {
		const user = await account()
		await setAvatar(user.id, 'https://example.com/a.png', 'https://example.com/a_cropped.png')
		const body = await me(user.jar)
		assert.equal(body.avatar, 'https://example.com/a.png')
		assert.equal(body.avatarCropped, 'https://example.com/a_cropped.png')
	})

	test('null → null', async () => {
		const user = await account()
		await setAvatar(user.id, null)
		const body = await me(user.jar)
		assert.equal(body.avatar, null)
		assert.equal(body.avatarCropped, null)
	})
})

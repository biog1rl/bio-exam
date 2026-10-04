import assert from 'node:assert/strict'
import sharp from 'sharp'
import { afterAll, afterEach, beforeAll, describe, test } from 'vitest'

import type { MemoryStorageAdapter } from '../../services/storage/adapters/memory.js'
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

type UploadFile = { bytes: Buffer; type: string; name: string }

type AvatarRow = { avatar: string | null; avatar_cropped: string | null }

type Account = { id: string; jar: CookieJar }

const PASSWORD = 'avatar-char-password-1'
const CROP = {
	cropX: '0',
	cropY: '0',
	cropWidth: '32',
	cropHeight: '32',
	cropZoom: '1',
	cropRotation: '0',
}

const KNOWN_DEFECTS = new Set<string>([])

function defectTest(id: string, title: string, fn: () => Promise<void>, timeout?: number): void {
	const run = KNOWN_DEFECTS.has(id) ? test.fails : test
	run(`${id}: ${title}`, fn, timeout)
}

let ctx: AuthApp
let mem: MemoryStorageAdapter
let tinyPng: Buffer
let accountCounter = 0

async function account(): Promise<Account> {
	accountCounter += 1
	const name = `avatar_user_${accountCounter}`
	const id = await seedUser(ctx, { login: name, roles: ['user'], password: PASSWORD })
	const reply = await login(ctx, name, PASSWORD)
	assert.equal(reply.status, 200)
	return { id, jar: reply.jar }
}

async function postAvatar(jar: CookieJar, fields: Record<string, string>, file?: UploadFile): Promise<Reply> {
	const form = new FormData()
	for (const [key, value] of Object.entries(fields)) form.append(key, value)
	if (file) form.append('avatar', new Blob([new Uint8Array(file.bytes)], { type: file.type }), file.name)
	const response = await fetch(`${ctx.baseUrl}/api/users/avatar`, {
		method: 'POST',
		body: form,
		headers: { cookie: cookieHeader(jar), 'x-forwarded-for': nextIp() },
	})
	const text = await response.text()
	let body: Json
	try {
		body = JSON.parse(text) as Json
	} catch {
		body = { raw: text }
	}
	return { status: response.status, body }
}

function png(): UploadFile {
	return { bytes: tinyPng, type: 'image/png', name: 'a.png' }
}

async function avatarRow(userId: string): Promise<AvatarRow> {
	const { rows } = await ctx.pgPool.query<AvatarRow>('SELECT avatar, avatar_cropped FROM users WHERE id = $1', [userId])
	const [row] = rows
	assert.ok(row)
	return row
}

beforeAll(async () => {
	ctx = await startAuthApp('test_avatar_char')
	mem = await memoryStorage()
	tinyPng = await sharp({
		create: { width: 64, height: 64, channels: 4, background: { r: 0, g: 128, b: 255, alpha: 1 } },
	})
		.png()
		.toBuffer()
}, 60_000)

afterEach(() => {
	mem?.clearFailures()
})

afterAll(async () => {
	await ctx?.stop()
})

describe('POST /api/users/avatar', () => {
	test('PNG с кропом: 200 { avatarUrl, avatarCroppedUrl, cropParams }, два объекта под avatars/<userId>/, в users ключи, avatarUrl ведёт на proxy ключа', async () => {
		const user = await account()
		const reply = await postAvatar(user.jar, CROP, png())
		assert.equal(reply.status, 200)
		assert.deepEqual(Object.keys(reply.body).sort(), ['avatarCroppedUrl', 'avatarUrl', 'cropParams'])
		assert.deepEqual(reply.body.cropParams, { x: 0, y: 0, zoom: 1, rotation: 0, viewX: null, viewY: null })
		const keys = mem.keys(`avatars/${user.id}`)
		assert.equal(keys.length, 2)
		const original = keys.find((key) => !key.includes('_cropped'))
		const cropped = keys.find((key) => key.includes('_cropped'))
		assert.ok(original && cropped)
		assert.ok(mem.get(original)?.data.equals(tinyPng))
		const meta = await sharp(mem.get(cropped)?.data).metadata()
		assert.equal(meta.width, 256)
		assert.equal(meta.height, 256)
		assert.equal(typeof reply.body.avatarUrl, 'string')
		assert.ok((reply.body.avatarUrl as string).includes(encodeURIComponent(original)))
		assert.ok((reply.body.avatarCroppedUrl as string).includes(encodeURIComponent(cropped)))
		const row = await avatarRow(user.id)
		assert.equal(row.avatar, original)
		assert.equal(row.avatar_cropped, cropped)
		assert.equal(reply.body.avatarUrl, `/api/docs/assets/proxy?path=${encodeURIComponent(original)}`)
		assert.equal(reply.body.avatarCroppedUrl, `/api/docs/assets/proxy?path=${encodeURIComponent(cropped)}`)
	})

	test('без файла у пользователя без аватара: 400 и текст про отсутствие аватара', async () => {
		const user = await account()
		const reply = await postAvatar(user.jar, CROP)
		assert.equal(reply.status, 400)
		assert.equal(reply.body.error, 'Нет загруженного аватара для редактирования')
		assert.deepEqual(mem.keys(`avatars/${user.id}`), [])
	})

	test('текст с типом image/png: 400 про недопустимый тип файла, в хранилище ничего нет', async () => {
		const user = await account()
		const reply = await postAvatar(user.jar, CROP, {
			bytes: Buffer.from('это не картинка, а обычный текст'),
			type: 'image/png',
			name: 'note.png',
		})
		assert.equal(reply.status, 400)
		assert.equal(
			reply.body.error,
			'Недопустимый тип файла. Файл не является допустимым изображением (JPEG, PNG, GIF, WebP)'
		)
		assert.deepEqual(mem.keys(`avatars/${user.id}`), [])
	})
})

describe('известные дефекты аватара (D-23)', () => {
	defectTest(
		'STOR-avatar-crop-delete-supabase',
		'кроп без файла на адаптере не local создаёт новый объект кропа',
		async () => {
			const user = await account()
			const upload = await postAvatar(user.jar, CROP, png())
			assert.equal(upload.status, 200)
			const before = mem.keys(`avatars/${user.id}`)
			const rowBefore = await avatarRow(user.id)
			const reply = await postAvatar(user.jar, { ...CROP, cropX: '8', cropY: '8' })
			assert.equal(reply.status, 200)
			const added = mem.keys(`avatars/${user.id}`).filter((key) => !before.includes(key))
			assert.equal(added.length, 1)
			assert.ok(added[0]?.includes('_cropped'))
			const rowAfter = await avatarRow(user.id)
			assert.notEqual(rowAfter.avatar_cropped, rowBefore.avatar_cropped)
		}
	)

	defectTest(
		'STOR-avatar-crop-delete-supabase',
		'удаление аватара на адаптере не local убирает объекты и поля в БД',
		async () => {
			const user = await account()
			const upload = await postAvatar(user.jar, CROP, png())
			assert.equal(upload.status, 200)
			const reply = await call(ctx, 'DELETE', '/api/users/avatar', { cookies: user.jar })
			assert.equal(reply.status, 200)
			assert.deepEqual(reply.body, { message: 'Аватар удален' })
			assert.deepEqual(mem.keys(`avatars/${user.id}`), [])
			const row = await avatarRow(user.id)
			assert.equal(row.avatar, null)
			assert.equal(row.avatar_cropped, null)
		}
	)
})

import { eq } from 'drizzle-orm'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import http from 'node:http'
import sharp from 'sharp'
import { afterAll, beforeAll, beforeEach, describe, test, vi } from 'vitest'

import { sessionCookieFor, startTestServer } from '../test-support/http.js'
import {
	createScratchDatabase,
	migrateTestDatabase,
	requireTestDatabaseUrl,
	type ScratchDatabase,
} from '../test-support/test-database.js'

const uploads = vi.hoisted(() => [] as Array<{ path: string; buffer: Buffer; contentType: string }>)
const createClientSpy = vi.hoisted(() => vi.fn())

vi.mock('@supabase/supabase-js', () => ({ createClient: createClientSpy }))

vi.mock('../services/storage/storage.js', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../services/storage/storage.js')>()
	const fake = Object.create(actual.storageService) as typeof actual.storageService
	fake.isConfigured = () => true
	fake.uploadBuffer = async (path: string, buffer: Buffer, contentType?: string) => {
		uploads.push({ path, buffer, contentType: contentType ?? '' })
	}
	fake.getPublicUrl = (path: string) => `https://storage.test/${path}`
	fake.deleteFiles = async () => {}
	return { ...actual, storageService: fake }
})

type DbModule = typeof import('../db/index.js')
type SchemaModule = typeof import('../db/schema.js')
type UploadFile = { bytes: Buffer; type: string; name: string }
type Reply = { status: number; body: Record<string, unknown> }

const FIVE_MB = 5 * 1024 * 1024

let scratch: ScratchDatabase | null = null
let previousTestDatabaseUrl: string | undefined
let server: { baseUrl: string; close: () => Promise<void> } | null = null
let dbModule: DbModule
let schema: SchemaModule
let adminId = ''
let testId = ''
let cookie = ''
let tinyPng: Buffer
let oversize: Buffer

beforeAll(async () => {
	requireTestDatabaseUrl()
	scratch = await createScratchDatabase('test_uploads')
	await migrateTestDatabase(scratch.url)
	previousTestDatabaseUrl = process.env.TEST_DATABASE_URL
	process.env.TEST_DATABASE_URL = scratch.url
	vi.resetModules()
	const app = (await import('../app.js')).default
	dbModule = await import('../db/index.js')
	schema = await import('../db/schema.js')
	const { db } = dbModule

	await db.insert(schema.roles).values({ key: 'admin' }).onConflictDoNothing()
	const [admin] = await db
		.insert(schema.users)
		.values({ login: 'uploads_admin', isActive: true })
		.returning({ id: schema.users.id })
	assert.ok(admin)
	adminId = admin.id
	await db.insert(schema.userRoles).values({ userId: adminId, roleKey: 'admin' })
	const [topic] = await db
		.insert(schema.topics)
		.values({ slug: 'biology', title: 'Биология' })
		.returning({ id: schema.topics.id })
	assert.ok(topic)
	const [created] = await db
		.insert(schema.tests)
		.values({ topicId: topic.id, slug: 'cell', title: 'Клетка' })
		.returning({ id: schema.tests.id })
	assert.ok(created)
	testId = created.id

	tinyPng = await sharp({
		create: { width: 64, height: 64, channels: 4, background: { r: 0, g: 128, b: 255, alpha: 1 } },
	})
		.png()
		.toBuffer()
	oversize = Buffer.concat([tinyPng, Buffer.alloc(FIVE_MB + 1 - tinyPng.length)])

	server = await startTestServer(app)
	cookie = await sessionCookieFor({ id: adminId })
}, 60_000)

afterAll(async () => {
	await server?.close()
	await dbModule?.pgPool.end()
	await scratch?.drop()
	if (previousTestDatabaseUrl === undefined) delete process.env.TEST_DATABASE_URL
	else process.env.TEST_DATABASE_URL = previousTestDatabaseUrl
})

beforeEach(() => {
	uploads.length = 0
})

function baseUrl(): string {
	assert.ok(server, 'test server is not running')
	return server.baseUrl
}

async function postFile(
	path: string,
	field: string,
	file: UploadFile,
	fields: Record<string, string> = {},
	sessionCookie: string | null = cookie
): Promise<Reply> {
	const form = new FormData()
	for (const [key, value] of Object.entries(fields)) form.append(key, value)
	form.append(field, new Blob([new Uint8Array(file.bytes)], { type: file.type }), file.name)
	const headers: Record<string, string> = sessionCookie ? { cookie: sessionCookie } : {}
	const res = await fetch(`${baseUrl()}${path}`, { method: 'POST', body: form, headers })
	const text = await res.text()
	let body: Record<string, unknown>
	try {
		body = JSON.parse(text) as Record<string, unknown>
	} catch {
		body = { raw: text }
	}
	return { status: res.status, body }
}

function png(): UploadFile {
	return { bytes: tinyPng, type: 'image/png', name: 'a.png' }
}

function textFile(type: string): UploadFile {
	return { bytes: Buffer.from('это не картинка, а обычный текст'), type, name: 'note.png' }
}

const IMAGE_FILTER_ERROR = 'Недопустимый тип файла. Разрешены только изображения (JPEG, PNG, GIF, WebP)'
const DOCS_FILTER_ERROR = 'Поддерживаются только JPEG, PNG и WebP'

const ROUTES = [
	{
		name: 'tests/assets',
		path: () => `/api/tests/${testId}/assets`,
		field: 'file',
		filterError: IMAGE_FILTER_ERROR,
		okStatus: 201,
	},
	{
		name: 'users/avatar',
		path: () => '/api/users/avatar',
		field: 'avatar',
		filterError: IMAGE_FILTER_ERROR,
		okStatus: 200,
	},
	{ name: 'docs/assets', path: () => '/api/docs/assets', field: 'file', filterError: DOCS_FILTER_ERROR, okStatus: 200 },
]

for (const route of ROUTES) {
	describe(`POST ${route.name}: отказы multer и сессии`, () => {
		test('MIME text/plain отклоняется фильтром multer, в хранилище ничего не попадает', async () => {
			const reply = await postFile(route.path(), route.field, textFile('text/plain'))
			assert.equal(reply.status, 500)
			assert.equal(reply.body.error, route.filterError)
			assert.equal(uploads.length, 0)
		})

		test('файл больше 5 МБ отклоняется, в хранилище ничего не попадает', async () => {
			const reply = await postFile(route.path(), route.field, { bytes: oversize, type: 'image/png', name: 'big.png' })
			assert.equal(reply.status, 500)
			assert.equal(reply.body.error, 'File too large')
			assert.equal(uploads.length, 0)
		})

		test('без cookie сессии ответ 401', async () => {
			const reply = await postFile(route.path(), route.field, png(), {}, null)
			assert.equal(reply.status, 401)
			assert.equal(reply.body.error, 'Unauthorized')
			assert.equal(uploads.length, 0)
		})
	})
}

describe('POST /api/tests/:id/assets', () => {
	const route = () => `/api/tests/${testId}/assets`

	test('PNG сохраняется в хранилище, ответ 201 с путём файла', async () => {
		const reply = await postFile(route(), 'file', png())
		assert.equal(reply.status, 201)
		assert.equal(uploads.length, 1)
		const [saved] = uploads
		assert.ok(saved)
		assert.equal(reply.body.url, saved.path)
		assert.ok(saved.path.startsWith('topics/biology/cell/assets/'))
		assert.ok(saved.buffer.equals(tinyPng))
		assert.equal(saved.contentType, 'image/png')
	})
})

describe('POST /api/users/avatar', () => {
	test('PNG с параметрами кропа проходит через Sharp: оригинал и кроп 256x256 в хранилище, users.avatar обновлён', async () => {
		const reply = await postFile('/api/users/avatar', 'avatar', png(), {
			cropX: '0',
			cropY: '0',
			cropWidth: '32',
			cropHeight: '32',
			cropZoom: '1',
			cropRotation: '90',
		})
		assert.equal(reply.status, 200)
		assert.equal(uploads.length, 2)
		const [original, cropped] = uploads
		assert.ok(original && cropped)
		assert.ok(original.path.startsWith(`avatars/${adminId}/`))
		assert.ok(original.buffer.equals(tinyPng))
		assert.equal(original.contentType, 'image/png')
		assert.equal(cropped.contentType, 'image/png')
		const meta = await sharp(cropped.buffer).metadata()
		assert.equal(meta.width, 256)
		assert.equal(meta.height, 256)
		assert.equal(reply.body.avatarUrl, `https://storage.test/${original.path}`)
		assert.equal(reply.body.avatarCroppedUrl, `https://storage.test/${cropped.path}`)
		const [row] = await dbModule.db
			.select({
				avatar: schema.users.avatar,
				avatarCropped: schema.users.avatarCropped,
				rotation: schema.users.avatarCropRotation,
			})
			.from(schema.users)
			.where(eq(schema.users.id, adminId))
		assert.ok(row)
		assert.equal(row.avatar, reply.body.avatarUrl)
		assert.equal(row.avatarCropped, reply.body.avatarCroppedUrl)
		assert.equal(row.rotation, 90)
	})

	test('текст с типом image/png отклоняется проверкой сигнатуры: 400, в хранилище ничего не попадает', async () => {
		const reply = await postFile('/api/users/avatar', 'avatar', textFile('image/png'))
		assert.equal(reply.status, 400)
		assert.equal(
			reply.body.error,
			'Недопустимый тип файла. Файл не является допустимым изображением (JPEG, PNG, GIF, WebP)'
		)
		assert.equal(uploads.length, 0)
	})
})

describe('POST /api/docs/assets', () => {
	test('PNG сжимается Sharp в WebP и сохраняется как images/<hex>.webp', async () => {
		const reply = await postFile('/api/docs/assets', 'file', png())
		assert.equal(reply.status, 200)
		assert.equal(reply.body.success, true)
		assert.equal(uploads.length, 1)
		const [saved] = uploads
		assert.ok(saved)
		assert.match(saved.path, /^images\/[0-9a-f]{32}\.webp$/)
		assert.equal(reply.body.path, saved.path)
		assert.equal(reply.body.filename, saved.path.slice('images/'.length))
		assert.equal(saved.contentType, 'image/webp')
		const meta = await sharp(saved.buffer).metadata()
		assert.equal(meta.format, 'webp')
		assert.equal(meta.width, 64)
		assert.equal(meta.height, 64)
	})

	test('image/gif отклоняется фильтром multer', async () => {
		const reply = await postFile('/api/docs/assets', 'file', { bytes: tinyPng, type: 'image/gif', name: 'a.gif' })
		assert.equal(reply.status, 500)
		assert.equal(reply.body.error, DOCS_FILTER_ERROR)
		assert.equal(uploads.length, 0)
	})

	test('текст с типом image/png отклоняется проверкой сигнатуры: 400, в хранилище ничего не попадает', async () => {
		const reply = await postFile('/api/docs/assets', 'file', textFile('image/png'))
		assert.equal(reply.status, 400)
		assert.equal(reply.body.error, DOCS_FILTER_ERROR)
		assert.equal(uploads.length, 0)
	})
})

function abortUpload(path: string, field: string): Promise<void> {
	return new Promise((resolve) => {
		const boundary = `----bioexam${crypto.randomBytes(8).toString('hex')}`
		const target = new URL(path, baseUrl())
		const req = http.request({
			host: target.hostname,
			port: Number(target.port),
			path: target.pathname,
			method: 'POST',
			headers: {
				cookie,
				'content-type': `multipart/form-data; boundary=${boundary}`,
				'content-length': '3000000',
			},
		})
		req.on('error', () => {})
		req.on('close', () => resolve())
		req.write(
			`--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n`
		)
		req.write(Buffer.concat([tinyPng, Buffer.alloc(64 * 1024 - tinyPng.length)]), () => {
			setTimeout(() => req.destroy(), 100)
		})
	})
}

async function waitForHealthz(): Promise<number> {
	const deadline = Date.now() + 2000
	let status = 0
	while (Date.now() < deadline) {
		try {
			const res = await fetch(`${baseUrl()}/healthz`)
			status = res.status
			await res.arrayBuffer()
			if (status === 200) return status
		} catch {
			status = 0
		}
		await new Promise((done) => setTimeout(done, 50))
	}
	return status
}

async function postRaw(path: string, contentType: string, body: Buffer): Promise<Reply> {
	const res = await fetch(`${baseUrl()}${path}`, {
		method: 'POST',
		body: new Uint8Array(body),
		headers: { cookie, 'content-type': contentType },
	})
	const text = await res.text()
	let parsed: Record<string, unknown>
	try {
		parsed = JSON.parse(text) as Record<string, unknown>
	} catch {
		parsed = { raw: text }
	}
	return { status: res.status, body: parsed }
}

for (const route of ROUTES) {
	describe(`POST ${route.name}: обрыв запроса посреди загрузки`, () => {
		test('сервер жив, в хранилище ничего не попадает, следующая загрузка проходит', async () => {
			await abortUpload(route.path(), route.field)
			assert.equal(await waitForHealthz(), 200)
			assert.equal(uploads.length, 0)
			const reply = await postFile(route.path(), route.field, png())
			assert.equal(reply.status, route.okStatus)
			assert.equal(uploads.length > 0, true)
		})
	})
}

describe('POST /api/docs/assets: сломанный multipart', () => {
	const boundary = '----bioexambroken'
	const contentType = `multipart/form-data; boundary=${boundary}`

	test('тело без закрывающей границы', async () => {
		const body = Buffer.concat([
			Buffer.from(
				`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n`
			),
			tinyPng,
			Buffer.from('\r\n'),
		])
		const reply = await postRaw('/api/docs/assets', contentType, body)
		assert.equal(reply.status, 500)
		assert.equal(reply.body.error, 'Unexpected end of form')
		assert.equal(uploads.length, 0)
		assert.equal(await waitForHealthz(), 200)
	})

	test('часть с пустым name', async () => {
		const body = Buffer.concat([
			Buffer.from(
				`--${boundary}\r\nContent-Disposition: form-data; name=""; filename="a.png"\r\nContent-Type: image/png\r\n\r\n`
			),
			tinyPng,
			Buffer.from(`\r\n--${boundary}--\r\n`),
		])
		const reply = await postRaw('/api/docs/assets', contentType, body)
		assert.equal(reply.status, 500)
		assert.equal(reply.body.error, 'Field name missing')
		assert.equal(uploads.length, 0)
		assert.equal(await waitForHealthz(), 200)
	})
})

test('клиент Supabase не создаётся', () => {
	assert.equal(createClientSpy.mock.calls.length, 0)
})

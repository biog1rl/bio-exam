import {
	ANSWER_PHOTO_LIMIT_MESSAGE,
	ANSWER_PHOTO_MAX_BYTES,
	AnswerPhotoListResponseSchema,
	AnswerPhotoUploadResponseSchema,
	UPLOAD_WINDOW_ERROR_CODES,
} from '@bio-exam/exam-core'

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, test } from 'vitest'

import { ANSWER_PHOTO_TYPE_MESSAGE } from '../../services/assets/image-intake.js'
import type { MemoryStorageAdapter } from '../../services/storage/adapters/memory.js'
import {
	addQuestion,
	answerPhotoPath,
	assignTest,
	countRows,
	createAttemptTest,
	insertOpenQuestion,
	putAnswerPhoto,
	seedAttemptWorld,
	seedStudent,
	startSession,
	type AttemptWorld,
} from '../../test-support/attempt-world.js'
import { call, startAuthApp, type AuthApp } from '../../test-support/auth-app.js'
import { memoryStorage } from '../../test-support/storage.js'

const UPLOAD_WINDOW_CLOSED = UPLOAD_WINDOW_ERROR_CODES.closed
const ANSWER_PHOTO_TARGET_MISSING = 'Ответ для фото не найден'
const ANSWER_PHOTO_CONFLICT = 'Это фото уже прикреплено к другому ответу'
const ANSWER_PHOTO_NOT_FOUND = 'Фото не найдено'
const FILE_MISSING = 'Файл не передан'

type Student = { id: string; cookie: string }
type Answer = { testId: string; sessionId: string; questionId: string; shortId: string }

let ctx: AuthApp
let world: AttemptWorld
let student: Student
let mem: MemoryStorageAdapter
let rotated: Buffer
let studentCounter = 0

beforeAll(async () => {
	ctx = await startAuthApp('test_session_photos', { env: { PG_POOL_MAX: '12' } })
	mem = await memoryStorage()
	world = await seedAttemptWorld(ctx, 'sphoto')
	student = await seedStudent(world, 'sphoto_student')
	rotated = await sharp({ create: { width: 800, height: 400, channels: 3, background: { r: 200, g: 100, b: 50 } } })
		.jpeg()
		.withMetadata({
			orientation: 6,
			exif: {
				IFD0: { Make: 'Apple', Model: 'iPhone' },
				IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '55/1 45/1 0/1' },
			},
		})
		.toBuffer()
}, 60_000)

afterAll(async () => {
	await ctx?.stop()
})

async function prepareTest(options: { timeLimitMinutes?: number | null } = {}) {
	const testId = await createAttemptTest(world, {
		slug: `sphoto-${crypto.randomUUID().slice(0, 8)}`,
		timeLimitMinutes: options.timeLimitMinutes ?? null,
	})
	const shortId = await addQuestion(world, testId, 'short_answer')
	const questionId = await insertOpenQuestion(ctx, testId, { order: 1 })
	return { testId, shortId, questionId }
}

async function openAnswer(owner: Student, prepared: { testId: string; shortId: string; questionId: string }) {
	await assignTest(world, prepared.testId, owner.id)
	const reply = await startSession(world, owner.cookie, prepared.testId)
	assert.equal(reply.status, 200, JSON.stringify(reply.body))
	return { ...prepared, sessionId: reply.body.sessionId as string }
}

async function answerOf(owner: Student, options: { timeLimitMinutes?: number | null } = {}): Promise<Answer> {
	return openAnswer(owner, await prepareTest(options))
}

async function newStudent(): Promise<Student> {
	studentCounter += 1
	return seedStudent(world, `sphoto_extra_${studentCounter}`)
}

function put(owner: Student, answer: Answer, photoId: string, bytes: Buffer | null = rotated, type?: string) {
	return putAnswerPhoto(world, owner.cookie, { ...answer, photoId, bytes, type })
}

function photoRows(sessionId: string): Promise<number> {
	return countRows(world, 'SELECT count(*) FROM answer_photos WHERE session_id = $1', [sessionId])
}

async function closeWindow(sessionId: string): Promise<void> {
	await ctx.pgPool.query("UPDATE test_sessions SET started_at = now() - interval '40 minutes' WHERE id = $1", [
		sessionId,
	])
}

describe('PUT …/photos/:photoId: фото ответа', () => {
	test('JPEG с Orientation 6 и GPS сохраняется вертикальным WebP без EXIF, список его отдаёт', async () => {
		const answer = await answerOf(student)
		const photoId = crypto.randomUUID()
		const reply = await put(student, answer, photoId)
		assert.equal(reply.status, 201, JSON.stringify(reply.body))
		const parsed = AnswerPhotoUploadResponseSchema.parse(reply.body)
		assert.equal(parsed.photo.id, photoId)
		assert.equal(parsed.count, 1)
		assert.equal(await photoRows(answer.sessionId), 1)
		const prefix = `answers/${answer.sessionId}/${answer.questionId}/${photoId}`
		assert.deepEqual(mem.keys(prefix).sort(), [`${prefix}/full.webp`, `${prefix}/thumb.webp`])
		const full = await sharp(mem.get(`${prefix}/full.webp`)?.data).metadata()
		assert.equal(full.format, 'webp')
		assert.ok(full.width < full.height)
		assert.equal(full.exif, undefined)
		const list = await call(ctx, 'GET', answerPhotoPath(answer), { cookies: student.cookie })
		assert.equal(list.status, 200)
		const photos = AnswerPhotoListResponseSchema.parse(list.body).photos
		assert.deepEqual(
			photos.map((photo) => photo.id),
			[photoId]
		)
	})

	test('повтор с тем же photoId отвечает 200 той же строкой без дубля', async () => {
		const answer = await answerOf(student)
		const photoId = crypto.randomUUID()
		assert.equal((await put(student, answer, photoId)).status, 201)
		const repeat = await put(student, answer, photoId)
		assert.equal(repeat.status, 200)
		assert.equal(AnswerPhotoUploadResponseSchema.parse(repeat.body).photo.id, photoId)
		assert.equal(await photoRows(answer.sessionId), 1)
		assert.equal(mem.keys(`answers/${answer.sessionId}`).length, 2)
	})

	test('шесть одновременных загрузок дают ровно пять фото и отказ шестому', async () => {
		const answer = await answerOf(student)
		const small = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#336699' } })
			.jpeg()
			.toBuffer()
		const replies = await Promise.all(Array.from({ length: 6 }, () => put(student, answer, crypto.randomUUID(), small)))
		const statuses = replies.map((reply) => reply.status).sort()
		assert.deepEqual(statuses, [201, 201, 201, 201, 201, 409])
		const refused = replies.find((reply) => reply.status === 409)
		assert.equal(refused?.body.error, ANSWER_PHOTO_LIMIT_MESSAGE)
		assert.equal(await photoRows(answer.sessionId), 5)
		assert.equal(mem.keys(`answers/${answer.sessionId}`).length, 10)
	})

	test('после закрытия окна загрузка отклоняется 422, строки и файлов нет', async () => {
		const answer = await answerOf(student, { timeLimitMinutes: 10 })
		await closeWindow(answer.sessionId)
		const reply = await put(student, answer, crypto.randomUUID())
		assert.equal(reply.status, 422)
		assert.equal(reply.body.error, UPLOAD_WINDOW_CLOSED)
		assert.equal(typeof reply.body.uploadClosesAt, 'string')
		assert.equal(await photoRows(answer.sessionId), 0)
		assert.deepEqual(mem.keys(`answers/${answer.sessionId}`), [])
	})

	test('вопрос не open, чужая сессия и несуществующий вопрос дают одинаковый 404', async () => {
		const answer = await answerOf(student)
		const other = await newStudent()
		const foreign = await openAnswer(other, answer)
		const cases: Answer[] = [
			{ ...answer, questionId: answer.shortId },
			{ ...answer, sessionId: foreign.sessionId },
			{ ...answer, questionId: crypto.randomUUID() },
		]
		for (const target of cases) {
			const reply = await put(student, target, crypto.randomUUID())
			assert.equal(reply.status, 404)
			assert.deepEqual(reply.body, { error: ANSWER_PHOTO_TARGET_MISSING })
		}
		assert.equal(await photoRows(answer.sessionId), 0)
		assert.equal(await photoRows(foreign.sessionId), 0)
	})

	test('photoId другой сессии даёт 409, файлы другой сессии на месте', async () => {
		const answer = await answerOf(student)
		const other = await newStudent()
		const foreign = await answerOf(other)
		const photoId = crypto.randomUUID()
		assert.equal((await put(other, foreign, photoId)).status, 201)
		const before = mem.keys(`answers/${foreign.sessionId}`)
		const reply = await put(student, answer, photoId)
		assert.equal(reply.status, 409)
		assert.equal(reply.body.error, ANSWER_PHOTO_CONFLICT)
		assert.deepEqual(mem.keys(`answers/${foreign.sessionId}`), before)
		assert.deepEqual(mem.keys(`answers/${answer.sessionId}`), [])
		assert.equal(await photoRows(answer.sessionId), 0)
	})

	test.each<{ name: string; bytes: () => Promise<Buffer | null>; status: number; error: string }>([
		{
			name: 'файл больше 10 МБ',
			bytes: async () => Buffer.concat([rotated, Buffer.alloc(ANSWER_PHOTO_MAX_BYTES + 1 - rotated.length)]),
			status: 413,
			error: 'Файл больше 10 МБ',
		},
		{
			name: 'настоящий GIF',
			bytes: () =>
				sharp({ create: { width: 8, height: 8, channels: 3, background: '#ff0000' } })
					.gif()
					.toBuffer(),
			status: 415,
			error: ANSWER_PHOTO_TYPE_MESSAGE,
		},
		{
			name: 'текст без сигнатуры',
			bytes: async () => Buffer.from('это не фото, а обычный текст'),
			status: 400,
			error: ANSWER_PHOTO_TYPE_MESSAGE,
		},
		{ name: 'без части file', bytes: async () => null, status: 400, error: FILE_MISSING },
	])('$name: $status, строк и файлов нет', async ({ bytes, status, error }) => {
		const answer = await answerOf(student)
		const reply = await put(student, answer, crypto.randomUUID(), await bytes())
		assert.equal(reply.status, status)
		assert.equal(reply.body.error, error)
		assert.equal(await photoRows(answer.sessionId), 0)
		assert.deepEqual(mem.keys(`answers/${answer.sessionId}`), [])
	})
})

describe('DELETE …/photos/:photoId', () => {
	function remove(owner: Student, answer: Answer, photoId: string) {
		return call(ctx, 'DELETE', `${answerPhotoPath(answer)}/${photoId}`, { cookies: owner.cookie })
	}

	test('при открытом окне удаляет строку и оба файла', async () => {
		const answer = await answerOf(student)
		const kept = crypto.randomUUID()
		const removed = crypto.randomUUID()
		assert.equal((await put(student, answer, kept)).status, 201)
		assert.equal((await put(student, answer, removed)).status, 201)
		const reply = await remove(student, answer, removed)
		assert.equal(reply.status, 200)
		assert.deepEqual(reply.body, { count: 1 })
		assert.equal(await photoRows(answer.sessionId), 1)
		assert.deepEqual(mem.keys(`answers/${answer.sessionId}/${answer.questionId}/${removed}`), [])
		assert.equal(mem.keys(`answers/${answer.sessionId}/${answer.questionId}/${kept}`).length, 2)
	})

	test('после закрытия окна удаление отклоняется 422, строка и файлы на месте', async () => {
		const answer = await answerOf(student, { timeLimitMinutes: 10 })
		const photoId = crypto.randomUUID()
		assert.equal((await put(student, answer, photoId)).status, 201)
		await closeWindow(answer.sessionId)
		const reply = await remove(student, answer, photoId)
		assert.equal(reply.status, 422)
		assert.equal(reply.body.error, UPLOAD_WINDOW_CLOSED)
		assert.equal(await photoRows(answer.sessionId), 1)
		assert.equal(mem.keys(`answers/${answer.sessionId}`).length, 2)
	})

	test('чужое фото не удаляется: 404', async () => {
		const answer = await answerOf(student)
		const other = await newStudent()
		const foreign = await answerOf(other)
		const photoId = crypto.randomUUID()
		assert.equal((await put(other, foreign, photoId)).status, 201)
		const reply = await remove(student, answer, photoId)
		assert.equal(reply.status, 404)
		assert.deepEqual(reply.body, { error: ANSWER_PHOTO_NOT_FOUND })
		assert.equal(await photoRows(foreign.sessionId), 1)
		assert.equal(mem.keys(`answers/${foreign.sessionId}`).length, 2)
	})
})

describe('DELETE /api/users/:id: фото ученика', () => {
	test('удаление ученика убирает его фото из хранилища и строки фото', async () => {
		const owner = await newStudent()
		const answer = await answerOf(owner)
		assert.equal((await put(owner, answer, crypto.randomUUID())).status, 201)
		assert.equal(mem.keys(`answers/${answer.sessionId}`).length, 2)
		const reply = await call(ctx, 'DELETE', `/api/users/${owner.id}`, { cookies: world.adminCookie })
		assert.equal(reply.status, 200, JSON.stringify(reply.body))
		assert.deepEqual(mem.keys(`answers/${answer.sessionId}`), [])
		assert.equal(await photoRows(answer.sessionId), 0)
	})
})

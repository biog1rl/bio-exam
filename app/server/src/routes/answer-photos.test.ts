import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, test } from 'vitest'

import type { MemoryStorageAdapter } from '../services/storage/adapters/memory.js'
import {
	addQuestion,
	assignTest,
	createAttemptTest,
	insertOpenQuestion,
	putAnswerPhoto,
	seedAttemptWorld,
	seedStudent,
	startSession,
	submitAttempt,
	type AttemptWorld,
} from '../test-support/attempt-world.js'
import { nextIp, startAuthApp, type AuthApp } from '../test-support/auth-app.js'
import { memoryStorage } from '../test-support/storage.js'

const NOT_FOUND = { status: 404, body: { error: 'Фото не найдено' } }

type Person = { id: string; cookie: string }
type UploadedPhoto = { testId: string; sessionId: string; questionId: string; shortId: string; photoId: string }
type PhotoReply = { status: number; headers: Headers; bytes: Buffer; body: unknown }

let ctx: AuthApp
let world: AttemptWorld
let mem: MemoryStorageAdapter
let jpeg: Buffer
let owner: Person
let classmate: Person
let teacherOfTopic: Person
let teacherOfOtherTopic: Person

beforeAll(async () => {
	ctx = await startAuthApp('test_answer_photo_read')
	mem = await memoryStorage()
	world = await seedAttemptWorld(ctx, 'aphoto')
	owner = await seedStudent(world, 'aphoto_owner')
	classmate = await seedStudent(world, 'aphoto_classmate')
	teacherOfTopic = await seedStudent(world, 'aphoto_teacher_in', { roles: ['teacher'] })
	teacherOfOtherTopic = await seedStudent(world, 'aphoto_teacher_out', { roles: ['teacher'] })
	const { db, schema } = ctx
	const [otherTopic] = await db
		.insert(schema.topics)
		.values({ slug: 'aphoto-other-topic', title: 'Другой раздел aphoto', isActive: true })
		.returning({ id: schema.topics.id })
	assert.ok(otherTopic)
	await db.insert(schema.teacherTopics).values([
		{ teacherId: teacherOfTopic.id, topicId: world.topicId, assignedBy: world.adminId },
		{ teacherId: teacherOfOtherTopic.id, topicId: otherTopic.id, assignedBy: world.adminId },
	])
	jpeg = await sharp({ create: { width: 600, height: 400, channels: 3, background: { r: 30, g: 120, b: 200 } } })
		.jpeg()
		.toBuffer()
}, 60_000)

afterAll(async () => {
	await ctx?.stop()
})

async function uploadedPhoto(): Promise<UploadedPhoto> {
	const testId = await createAttemptTest(world, { slug: `aphoto-${crypto.randomUUID().slice(0, 8)}` })
	const shortId = await addQuestion(world, testId, 'short_answer')
	const questionId = await insertOpenQuestion(ctx, testId, { order: 1 })
	await assignTest(world, testId, owner.id)
	const started = await startSession(world, owner.cookie, testId)
	assert.equal(started.status, 200, JSON.stringify(started.body))
	const sessionId = started.body.sessionId as string
	const photoId = crypto.randomUUID()
	const uploaded = await putAnswerPhoto(world, owner.cookie, { testId, sessionId, questionId, photoId, bytes: jpeg })
	assert.equal(uploaded.status, 201, JSON.stringify(uploaded.body))
	return { testId, sessionId, questionId, shortId, photoId }
}

async function getPhoto(cookie: string | null, photoId: string, variant: string): Promise<PhotoReply> {
	const headers: Record<string, string> = { 'x-forwarded-for': nextIp() }
	if (cookie) headers.cookie = cookie
	const response = await fetch(`${ctx.baseUrl}/api/answer-photos/${photoId}/${variant}`, { headers })
	const bytes = Buffer.from(await response.arrayBuffer())
	const isJson = response.headers.get('content-type')?.includes('application/json') ?? false
	return {
		status: response.status,
		headers: response.headers,
		bytes,
		body: isJson ? JSON.parse(bytes.toString()) : null,
	}
}

function outcome(reply: PhotoReply) {
	return { status: reply.status, body: reply.body }
}

function storedBytes(photo: UploadedPhoto, variant: string): Buffer {
	const stored = mem.get(`answers/${photo.sessionId}/${photo.questionId}/${photo.photoId}/${variant}.webp`)
	assert.ok(stored, `нет файла ${variant}`)
	return stored.data
}

describe('GET /api/answer-photos/:photoId/:variant', () => {
	test('владелец получает миниатюру и полное фото отдельным маршрутом с private, no-store', async () => {
		const photo = await uploadedPhoto()
		for (const variant of ['thumb', 'full']) {
			const reply = await getPhoto(owner.cookie, photo.photoId, variant)
			assert.equal(reply.status, 200, variant)
			assert.equal(reply.headers.get('content-type'), 'image/webp')
			assert.equal(reply.headers.get('cache-control'), 'private, no-store')
			assert.equal(reply.headers.get('x-content-type-options'), 'nosniff')
			assert.equal(reply.headers.get('Cross-Origin-Resource-Policy'), 'same-origin')
			assert.equal(reply.headers.get('content-disposition'), 'inline')
			assert.equal(reply.headers.get('content-length'), String(reply.bytes.length))
			assert.ok(reply.bytes.equals(storedBytes(photo, variant)), variant)
		}
	})

	test('другому ученику того же теста, случайному UUID и неизвестному варианту — тот же 404, что отсутствующему фото', async () => {
		const photo = await uploadedPhoto()
		const missing = outcome(await getPhoto(owner.cookie, crypto.randomUUID(), 'thumb'))
		assert.deepEqual(missing, NOT_FOUND)
		await assignTest(world, photo.testId, classmate.id)
		const classmateSession = await startSession(world, classmate.cookie, photo.testId)
		assert.equal(classmateSession.status, 200, JSON.stringify(classmateSession.body))
		assert.deepEqual(outcome(await getPhoto(classmate.cookie, photo.photoId, 'thumb')), missing)
		assert.deepEqual(outcome(await getPhoto(classmate.cookie, photo.photoId, 'full')), missing)
		assert.deepEqual(outcome(await getPhoto(owner.cookie, photo.photoId, 'original')), missing)
	})

	test('без входа 401, неверный идентификатор фото 400', async () => {
		const photo = await uploadedPhoto()
		assert.equal((await getPhoto(null, photo.photoId, 'thumb')).status, 401)
		assert.equal((await getPhoto(owner.cookie, 'not-a-uuid', 'thumb')).status, 400)
	})

	test('проверяющий видит фото только после сдачи и только в разделе своей зоны', async () => {
		const photo = await uploadedPhoto()
		assert.deepEqual(outcome(await getPhoto(teacherOfTopic.cookie, photo.photoId, 'thumb')), NOT_FOUND)
		assert.deepEqual(outcome(await getPhoto(world.adminCookie, photo.photoId, 'thumb')), NOT_FOUND)
		assert.deepEqual(outcome(await getPhoto(teacherOfOtherTopic.cookie, photo.photoId, 'thumb')), NOT_FOUND)

		const submitted = await submitAttempt(world, owner.cookie, photo.testId, {
			sessionId: photo.sessionId,
			clientAttemptId: crypto.randomUUID(),
			answers: { [photo.shortId]: 'Митоз' },
		})
		assert.equal(submitted.status, 200, JSON.stringify(submitted.body))
		const links = await ctx.pgPool.query<{ session_attempt: string | null; photo_attempt: string | null }>(
			`SELECT s.attempt_id AS session_attempt, p.attempt_id AS photo_attempt
			FROM answer_photos p JOIN test_sessions s ON s.id = p.session_id WHERE p.id = $1`,
			[photo.photoId]
		)
		assert.ok(links.rows[0]?.session_attempt)
		assert.equal(links.rows[0]?.photo_attempt, null)

		const reviewed = await getPhoto(teacherOfTopic.cookie, photo.photoId, 'full')
		assert.equal(reviewed.status, 200)
		assert.ok(reviewed.bytes.equals(storedBytes(photo, 'full')))
		assert.equal((await getPhoto(world.adminCookie, photo.photoId, 'thumb')).status, 200)
		assert.equal((await getPhoto(owner.cookie, photo.photoId, 'thumb')).status, 200)
		assert.deepEqual(outcome(await getPhoto(teacherOfOtherTopic.cookie, photo.photoId, 'thumb')), NOT_FOUND)
		assert.deepEqual(outcome(await getPhoto(classmate.cookie, photo.photoId, 'thumb')), NOT_FOUND)
	})
})

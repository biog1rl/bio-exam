import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, test } from 'vitest'

import {
	addQuestion,
	assignTest,
	createAttemptTest,
	insertOpenQuestion,
	putAnswerPhoto,
	seedAttemptWorld,
	seedStudent,
	startSession,
	type AttemptWorld,
} from '../../test-support/attempt-world.js'
import { startAuthApp, type AuthApp } from '../../test-support/auth-app.js'
import { memoryStorage } from '../../test-support/storage.js'

type AnswerPhotos = typeof import('./index.js')
type PhotoSlot = Awaited<ReturnType<AnswerPhotos['readPhotoSlot']>>
type Place = Parameters<AnswerPhotos['readPhotoSlot']>[1]
type Student = { id: string; cookie: string }
type Answer = { testId: string; sessionId: string; questionId: string; shortId: string }

let ctx: AuthApp
let world: AttemptWorld
let photos: AnswerPhotos
let jpeg: Buffer
let counter = 0

beforeAll(async () => {
	ctx = await startAuthApp('test_photo_slot', { env: { PG_POOL_MAX: '12' } })
	await memoryStorage()
	photos = await import('./index.js')
	world = await seedAttemptWorld(ctx, 'pslot')
	jpeg = await sharp({ create: { width: 64, height: 48, channels: 3, background: { r: 20, g: 120, b: 60 } } })
		.jpeg()
		.toBuffer()
}, 60_000)

afterAll(async () => {
	await ctx?.stop()
})

function nextName(kind: string): string {
	counter += 1
	return `pslot_${kind}_${counter}`
}

async function newStudent(roles?: string[]): Promise<Student> {
	return seedStudent(world, nextName('user'), roles ? { roles } : {})
}

async function prepareTest() {
	const testId = await createAttemptTest(world, { slug: `pslot-${crypto.randomUUID().slice(0, 8)}` })
	const shortId = await addQuestion(world, testId, 'short_answer')
	const questionId = await insertOpenQuestion(ctx, testId, { order: 1 })
	return { testId, shortId, questionId }
}

async function openAnswer(owner: Student, options: { assign?: boolean } = {}): Promise<Answer> {
	const prepared = await prepareTest()
	if (options.assign ?? true) await assignTest(world, prepared.testId, owner.id)
	const reply = await startSession(world, owner.cookie, prepared.testId)
	assert.equal(reply.status, 200, JSON.stringify(reply.body))
	return { ...prepared, sessionId: reply.body.sessionId as string }
}

function placeOf(owner: Student, answer: Answer, questionId = answer.questionId): Place {
	return { owner: { testId: answer.testId, userId: owner.id }, sessionId: answer.sessionId, questionId }
}

async function uploadedVia(photoId: string): Promise<string | undefined> {
	const result = await ctx.pgPool.query<{ uploaded_via: string }>(
		'SELECT uploaded_via FROM answer_photos WHERE id = $1',
		[photoId]
	)
	return result.rows[0]?.uploaded_via
}

describe('answer_photos.uploaded_via', () => {
	test('фото через cookie-маршрут записано с источником session', async () => {
		const owner = await newStudent()
		const answer = await openAnswer(owner)
		const photoId = crypto.randomUUID()
		const reply = await putAnswerPhoto(world, owner.cookie, { ...answer, photoId, bytes: jpeg })
		assert.equal(reply.status, 201, JSON.stringify(reply.body))
		assert.equal(await uploadedVia(photoId), 'session')
	})

	test('сервис с источником link пишет link', async () => {
		const owner = await newStudent()
		const answer = await openAnswer(owner)
		const photoId = crypto.randomUUID()
		const outcome = await photos.uploadAnswerPhoto(placeOf(owner, answer), photoId, jpeg, 'link')
		assert.equal(outcome.kind, 'created')
		assert.equal(await uploadedVia(photoId), 'link')
	})

	test('значение вне session и link отклоняет CHECK базы', async () => {
		const owner = await newStudent()
		const answer = await openAnswer(owner)
		await assert.rejects(
			ctx.pgPool.query(
				"INSERT INTO answer_photos (id, session_id, question_id, uploaded_via) VALUES ($1, $2, $3, 'other')",
				[crypto.randomUUID(), answer.sessionId, answer.questionId]
			),
			(error: { code?: string; constraint?: string }) =>
				error.code === '23514' && error.constraint === 'answer_photos_uploaded_via_check'
		)
	})
})

function outcomeOf(slot: PhotoSlot): string {
	if (slot.kind === 'refused') return slot.reason
	if (!slot.window.open) return `slot:${slot.window.reason}`
	return slot.rule.allowPhotos ? 'slot:open' : 'slot:open:no-photos'
}

async function teacherInZone(): Promise<Student> {
	const teacher = await newStudent(['teacher'])
	await ctx.db.insert(ctx.schema.teacherTopics).values({ teacherId: teacher.id, topicId: world.topicId })
	return teacher
}

async function placeAfter(change: (owner: Student, answer: Answer) => Promise<string | void>): Promise<Place> {
	const owner = await newStudent()
	const answer = await openAnswer(owner)
	const questionId = await change(owner, answer)
	return placeOf(owner, answer, questionId ?? answer.questionId)
}

const SLOT_CASES: Array<[string, () => Promise<Place>, string]> = [
	[
		'админ без назначения',
		async () => {
			const admin = { id: world.adminId, cookie: world.adminCookie }
			return placeOf(admin, await openAnswer(admin, { assign: false }))
		},
		'slot:open',
	],
	[
		'учитель в зоне без назначения',
		async () => {
			const teacher = await teacherInZone()
			return placeOf(teacher, await openAnswer(teacher, { assign: false }))
		},
		'slot:open',
	],
	[
		'ученик без назначения',
		() =>
			placeAfter(async (owner, answer) => {
				await ctx.pgPool.query('DELETE FROM test_assignments WHERE test_id = $1 AND user_id = $2', [
					answer.testId,
					owner.id,
				])
			}),
		'not_assigned',
	],
	[
		'заблокированный ученик',
		() =>
			placeAfter(async (owner) => {
				await ctx.pgPool.query('UPDATE users SET is_active = false WHERE id = $1', [owner.id])
			}),
		'user_inactive',
	],
	[
		'вопрос другого теста',
		() =>
			placeAfter(async () => {
				const other = await prepareTest()
				return other.questionId
			}),
		'slot_missing',
	],
	['вопрос не open', () => placeAfter(async (_owner, answer) => answer.shortId), 'slot_missing'],
	[
		'закрытая без сдачи сессия',
		() =>
			placeAfter(async (_owner, answer) => {
				await ctx.pgPool.query("UPDATE test_sessions SET closed_at = now(), close_reason = 'expired' WHERE id = $1", [
					answer.sessionId,
				])
			}),
		'slot:session_closed',
	],
	[
		'allow_photos = false',
		() =>
			placeAfter(async (_owner, answer) => {
				await ctx.pgPool.query('UPDATE questions SET allow_photos = false WHERE id = $1', [answer.questionId])
			}),
		'slot:open:no-photos',
	],
]

describe('readPhotoSlot', () => {
	test.each(SLOT_CASES)('%s', async (_name, arrange, expected) => {
		const place = await arrange()
		assert.equal(outcomeOf(await photos.readPhotoSlot(ctx.db, place)), expected)
	})

	test('при max_photos = 2 третья загрузка получает limit с max 2', async () => {
		const owner = await newStudent()
		const answer = await openAnswer(owner)
		await ctx.pgPool.query('UPDATE questions SET max_photos = 2 WHERE id = $1', [answer.questionId])
		const place = placeOf(owner, answer)
		for (const via of ['session', 'link'] as const) {
			const created = await photos.uploadAnswerPhoto(place, crypto.randomUUID(), jpeg, via)
			assert.equal(created.kind, 'created')
		}
		const third = await photos.uploadAnswerPhoto(place, crypto.randomUUID(), jpeg, 'link')
		assert.deepEqual(third, { kind: 'limit', max: 2 })
	})

	test('placeOfSession строит место из владельца сессии', async () => {
		const owner = await newStudent()
		const answer = await openAnswer(owner)
		assert.deepEqual(await photos.placeOfSession(ctx.db, answer.sessionId, answer.questionId), placeOf(owner, answer))
		assert.equal(await photos.placeOfSession(ctx.db, crypto.randomUUID(), answer.questionId), null)
	})
})

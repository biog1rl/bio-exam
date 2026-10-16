import { SUBMIT_ERROR_CODES, UPLOAD_WINDOW_ERROR_CODES } from '@bio-exam/exam-core'

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, test } from 'vitest'

import {
	addQuestion,
	assignTest,
	attemptRowOf,
	createAttemptTest,
	insertOpenQuestion,
	putAnswerPhoto,
	saveDraft,
	seedAttemptWorld,
	seedStudent,
	shiftStartedAt,
	startSession,
	submitAttempt,
	type AttemptWorld,
} from '../../test-support/attempt-world.js'
import { call, startAuthApp, type AuthApp, type Reply } from '../../test-support/auth-app.js'
import { memoryStorage } from '../../test-support/storage.js'

type Student = { id: string; cookie: string }
type Prepared = {
	testId: string
	shortId: string
	openIds: string[]
	sessionId: string
	owner: Student
}

let ctx: AuthApp
let world: AttemptWorld
let jpeg: Buffer
let counter = 0

beforeAll(async () => {
	ctx = await startAuthApp('test_open_answer_submit', { env: { PG_POOL_MAX: '12' } })
	await memoryStorage()
	world = await seedAttemptWorld(ctx, 'oas')
	jpeg = await sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 10, g: 120, b: 60 } } })
		.jpeg()
		.toBuffer()
}, 60_000)

afterAll(async () => {
	await ctx?.stop()
})

async function prepare(
	options: { openCount?: number; timeLimitMinutes?: number | null; windowMinutes?: number } = {}
): Promise<Prepared> {
	counter += 1
	const owner = await seedStudent(world, `oas_student_${counter}`)
	const testId = await createAttemptTest(world, {
		slug: `oas-${counter}-${crypto.randomUUID().slice(0, 6)}`,
		timeLimitMinutes: options.timeLimitMinutes ?? null,
	})
	if (options.windowMinutes !== undefined) {
		await ctx.pgPool.query('UPDATE tests SET photo_upload_window_minutes = $2 WHERE id = $1', [
			testId,
			options.windowMinutes,
		])
	}
	const shortId = await addQuestion(world, testId, 'short_answer')
	const openIds: string[] = []
	for (let index = 0; index < (options.openCount ?? 1); index++) {
		openIds.push(await insertOpenQuestion(ctx, testId, { order: index + 1 }))
	}
	await assignTest(world, testId, owner.id)
	const started = await startSession(world, owner.cookie, testId)
	assert.equal(started.status, 200, JSON.stringify(started.body))
	return { testId, shortId, openIds, sessionId: started.body.sessionId as string, owner }
}

function submit(prepared: Prepared, answers: Record<string, string>): Promise<Reply> {
	return submitAttempt(world, prepared.owner.cookie, prepared.testId, {
		sessionId: prepared.sessionId,
		clientAttemptId: crypto.randomUUID(),
		answers,
	})
}

function attachPhoto(prepared: Prepared, questionId: string): Promise<Reply> {
	return putAnswerPhoto(world, prepared.owner.cookie, {
		testId: prepared.testId,
		sessionId: prepared.sessionId,
		questionId,
		photoId: crypto.randomUUID(),
		bytes: jpeg,
	})
}

function uploadsDone(prepared: Prepared, cookie: string | null = prepared.owner.cookie): Promise<Reply> {
	return call(
		ctx,
		'POST',
		`/api/tests/public/tests/${prepared.testId}/sessions/${prepared.sessionId}/uploads-done`,
		cookie ? { cookies: cookie } : {}
	)
}

function attemptsList(query: string): Promise<Reply> {
	return call(ctx, 'GET', `/api/tests/admin/attempts${query}`, { cookies: world.adminCookie })
}

async function attemptCount(sessionId: string): Promise<number> {
	const result = await ctx.pgPool.query<{ count: string }>('SELECT count(*) FROM test_attempts WHERE session_id = $1', [
		sessionId,
	])
	return Number(result.rows[0]?.count ?? 0)
}

async function expire(prepared: Prepared): Promise<Reply> {
	await shiftStartedAt(ctx, prepared.sessionId, '12 minutes')
	return call(ctx, 'GET', `/api/tests/public/tests/${prepared.testId}/sessions/${prepared.sessionId}`, {
		cookies: prepared.owner.cookie,
	})
}

async function submittedByDeadline(
	options: { windowMinutes?: number } = {}
): Promise<Prepared & { attemptId: string }> {
	const prepared = await prepare({ ...options, timeLimitMinutes: 10 })
	const [openId] = prepared.openIds
	assert.ok(openId)
	for (const [questionId, value] of [
		[prepared.shortId, 'ответ'],
		[openId, 'текст'],
	] as const) {
		const saved = await saveDraft(world, prepared.owner.cookie, prepared.testId, prepared.sessionId, {
			questionId,
			value,
		})
		assert.equal(saved.status, 200, JSON.stringify(saved.body))
	}
	const fate = await expire(prepared)
	assert.equal(fate.body.state, 'submitted', JSON.stringify(fate.body))
	return { ...prepared, attemptId: fate.body.attemptId as string }
}

describe('сдача: открытый вопрос без текста и фото', () => {
	test.each([
		{ name: 'нет ответа', text: undefined },
		{ name: 'пустая строка', text: '' },
		{ name: 'только пробелы и перевод строки', text: '  \n\t ' },
	])('$name: 422 OPEN_ANSWER_EMPTY, попытки нет, сессия открыта', async ({ text }) => {
		const prepared = await prepare()
		const [openId] = prepared.openIds
		assert.ok(openId)
		const answers: Record<string, string> = { [prepared.shortId]: 'ответ' }
		if (text !== undefined) answers[openId] = text

		const reply = await submit(prepared, answers)

		assert.equal(reply.status, 422, JSON.stringify(reply.body))
		assert.deepEqual(reply.body, { error: SUBMIT_ERROR_CODES.openAnswerEmpty, questionIds: [openId] })
		assert.equal(await attemptCount(prepared.sessionId), 0)
		const retry = await submit(prepared, { ...answers, [openId]: 'Теперь с текстом' })
		assert.equal(retry.status, 200, JSON.stringify(retry.body))
	})

	test('текст принимается, фото не нужно', async () => {
		const prepared = await prepare()
		const [openId] = prepared.openIds
		assert.ok(openId)

		const reply = await submit(prepared, { [prepared.shortId]: 'ответ', [openId]: 'Развёрнутый ответ' })

		assert.equal(reply.status, 200, JSON.stringify(reply.body))
	})

	test('одно фото без текста принимается и привязывается к попытке', async () => {
		const prepared = await prepare()
		const [openId] = prepared.openIds
		assert.ok(openId)
		const photo = await attachPhoto(prepared, openId)
		assert.equal(photo.status, 201, JSON.stringify(photo.body))

		const reply = await submit(prepared, { [prepared.shortId]: 'ответ', [openId]: '' })

		assert.equal(reply.status, 200, JSON.stringify(reply.body))
		const linked = await ctx.pgPool.query<{ attempt_id: string | null }>(
			'SELECT attempt_id FROM answer_photos WHERE session_id = $1',
			[prepared.sessionId]
		)
		assert.deepEqual(
			linked.rows.map((row) => row.attempt_id),
			[reply.body.attemptId]
		)
	})

	test('два открытых вопроса: в ответе только пустой, фото другого вопроса не считается', async () => {
		const prepared = await prepare({ openCount: 3 })
		const [withText, withPhoto, empty] = prepared.openIds
		assert.ok(withText && withPhoto && empty)
		assert.equal((await attachPhoto(prepared, withPhoto)).status, 201)

		const reply = await submit(prepared, { [withText]: 'есть текст', [withPhoto]: ' ' })

		assert.equal(reply.status, 422)
		assert.deepEqual(reply.body.questionIds, [empty])
	})

	test('фото после сдачи по дедлайну получает attempt_id попытки', async () => {
		const prepared = await submittedByDeadline()
		const [openId] = prepared.openIds
		assert.ok(openId)

		const photo = await attachPhoto(prepared, openId)

		assert.equal(photo.status, 201, JSON.stringify(photo.body))
		const linked = await ctx.pgPool.query<{ attempt_id: string | null }>(
			'SELECT attempt_id FROM answer_photos WHERE session_id = $1',
			[prepared.sessionId]
		)
		assert.deepEqual(
			linked.rows.map((row) => row.attempt_id),
			[prepared.attemptId]
		)
	})

	test('обычная сдача не открывает окно фото: upload_closes_at пуст, фото после неё отклоняются', async () => {
		const prepared = await prepare()
		const [openId] = prepared.openIds
		assert.ok(openId)
		const sent = await submit(prepared, { [prepared.shortId]: 'ответ', [openId]: 'текст' })
		assert.equal(sent.status, 200, JSON.stringify(sent.body))

		assert.equal((await attemptRowOf(ctx, sent.body.attemptId as string)).uploadClosesAt, null)
		assert.equal((await attachPhoto(prepared, openId)).status, 422)
	})
})

describe('сдача по дедлайну с пустым открытым ответом', () => {
	test('черновик без открытого ответа сдаётся сервером, попытка на проверке', async () => {
		const prepared = await prepare({ timeLimitMinutes: 10 })
		const saved = await saveDraft(world, prepared.owner.cookie, prepared.testId, prepared.sessionId, {
			questionId: prepared.shortId,
			value: 'ответ',
		})
		assert.equal(saved.status, 200, JSON.stringify(saved.body))

		const fate = await expire(prepared)

		assert.equal(fate.status, 200, JSON.stringify(fate.body))
		assert.equal(fate.body.state, 'submitted')
		const row = await attemptRowOf(ctx, fate.body.attemptId as string)
		assert.equal(row.submitSource, 'deadline')
	})

	test('только фото без единого ответа в черновике: сессия сдаётся, фото привязано', async () => {
		const prepared = await prepare({ timeLimitMinutes: 10 })
		const [openId] = prepared.openIds
		assert.ok(openId)
		assert.equal((await attachPhoto(prepared, openId)).status, 201)

		const fate = await expire(prepared)

		assert.equal(fate.body.state, 'submitted', JSON.stringify(fate.body))
		const linked = await ctx.pgPool.query<{ attempt_id: string | null }>(
			'SELECT attempt_id FROM answer_photos WHERE session_id = $1',
			[prepared.sessionId]
		)
		assert.deepEqual(
			linked.rows.map((row) => row.attempt_id),
			[fate.body.attemptId]
		)
	})
})

describe('POST …/sessions/:sessionId/uploads-done', () => {
	const submitted = submittedByDeadline

	test('владелец досрочно закрывает окно: 200 и uploadClosesAt не позже now', async () => {
		const prepared = await submitted()
		const before = await attemptRowOf(ctx, prepared.attemptId)
		assert.ok(before.uploadClosesAt && before.uploadClosesAt.getTime() > Date.now())

		const reply = await uploadsDone(prepared)

		assert.equal(reply.status, 200, JSON.stringify(reply.body))
		const stored = await attemptRowOf(ctx, prepared.attemptId)
		assert.ok(stored.uploadClosesAt)
		assert.equal(reply.body.uploadClosesAt, stored.uploadClosesAt.toISOString())
		assert.ok(stored.uploadClosesAt.getTime() <= Date.now())
		assert.ok(stored.uploadClosesAt.getTime() < before.uploadClosesAt.getTime())
	})

	test('повтор не двигает время: тот же отказ окна с прежним uploadClosesAt', async () => {
		const prepared = await submitted()
		const first = await uploadsDone(prepared)
		assert.equal(first.status, 200)
		const stored = await attemptRowOf(ctx, prepared.attemptId)

		const second = await uploadsDone(prepared)

		assert.equal(second.status, 422, JSON.stringify(second.body))
		assert.deepEqual(second.body, {
			error: UPLOAD_WINDOW_ERROR_CODES.closed,
			uploadClosesAt: first.body.uploadClosesAt,
		})
		assert.deepEqual((await attemptRowOf(ctx, prepared.attemptId)).uploadClosesAt, stored.uploadClosesAt)
	})

	test('после закрытия фото не принимаются', async () => {
		const prepared = await submitted()
		const [openId] = prepared.openIds
		assert.ok(openId)
		assert.equal((await uploadsDone(prepared)).status, 200)

		const photo = await attachPhoto(prepared, openId)

		assert.equal(photo.status, 422)
		assert.equal(photo.body.error, UPLOAD_WINDOW_ERROR_CODES.closed)
	})

	test('окно уже истекло само: тот же отказ, что у загрузки фото', async () => {
		const prepared = await submitted()
		await ctx.pgPool.query("UPDATE test_attempts SET upload_closes_at = now() - interval '5 minutes' WHERE id = $1", [
			prepared.attemptId,
		])

		const reply = await uploadsDone(prepared)

		assert.equal(reply.status, 422)
		assert.equal(reply.body.error, UPLOAD_WINDOW_ERROR_CODES.closed)
		assert.equal(typeof reply.body.uploadClosesAt, 'string')
	})

	test('у теста нет окна: UPLOAD_WINDOW_NONE', async () => {
		const prepared = await submitted({ windowMinutes: 0 })

		const reply = await uploadsDone(prepared)

		assert.equal(reply.status, 422)
		assert.deepEqual(reply.body, { error: UPLOAD_WINDOW_ERROR_CODES.none, uploadClosesAt: null })
	})

	test('чужая сессия: 404 и окно владельца не тронуто', async () => {
		const prepared = await submitted()
		const stranger = await seedStudent(world, `oas_stranger_${counter}`)
		await assignTest(world, prepared.testId, stranger.id)
		const before = await attemptRowOf(ctx, prepared.attemptId)

		const reply = await uploadsDone(prepared, stranger.cookie)

		assert.equal(reply.status, 404, JSON.stringify(reply.body))
		assert.deepEqual((await attemptRowOf(ctx, prepared.attemptId)).uploadClosesAt, before.uploadClosesAt)
	})

	test('без входа 401, до сдачи 409', async () => {
		const prepared = await prepare()

		assert.equal((await uploadsDone(prepared, null)).status, 401)
		assert.equal((await uploadsDone(prepared)).status, 409)
	})
})

describe('очередь проверки: только попытки с закрытым окном', () => {
	test('сдача по дедлайну: review=pending, pendingTotal и reviewReady следуют за окном', async () => {
		const prepared = await submittedByDeadline()
		const attemptId = prepared.attemptId

		const waiting = await attemptsList('?review=pending&limit=100')
		const inQueueBefore = (waiting.body.rows as Array<{ attemptId: string }>).some((row) => row.attemptId === attemptId)
		const totalBefore = (waiting.body.summary as { pendingTotal: number }).pendingTotal
		assert.equal(inQueueBefore, false)

		const everything = await attemptsList('?limit=100')
		const row = (everything.body.rows as Array<{ attemptId: string; reviewReady: boolean }>).find(
			(item) => item.attemptId === attemptId
		)
		assert.equal(row?.reviewReady, false)
		const detailBefore = await call(ctx, 'GET', `/api/tests/admin/attempts/${attemptId}`, {
			cookies: world.adminCookie,
		})
		assert.equal((detailBefore.body.attempt as { reviewReady: boolean }).reviewReady, false)

		assert.equal((await uploadsDone(prepared)).status, 200)

		const ready = await attemptsList('?review=pending&limit=100')
		const rows = ready.body.rows as Array<{ attemptId: string; reviewReady: boolean }>
		assert.equal(rows.find((item) => item.attemptId === attemptId)?.reviewReady, true)
		assert.equal((ready.body.summary as { pendingTotal: number }).pendingTotal, totalBefore + 1)
		const detailAfter = await call(ctx, 'GET', `/api/tests/admin/attempts/${attemptId}`, {
			cookies: world.adminCookie,
		})
		assert.equal((detailAfter.body.attempt as { reviewReady: boolean }).reviewReady, true)
	})

	test('обычная сдача на проверке сразу в очереди', async () => {
		const prepared = await prepare()
		const [openId] = prepared.openIds
		assert.ok(openId)
		const sent = await submit(prepared, { [prepared.shortId]: 'ответ', [openId]: 'текст' })
		assert.equal(sent.status, 200, JSON.stringify(sent.body))

		const queue = await attemptsList('?review=pending&limit=100')

		const rows = queue.body.rows as Array<{ attemptId: string; reviewReady: boolean }>
		assert.equal(rows.find((item) => item.attemptId === sent.body.attemptId)?.reviewReady, true)
	})
})

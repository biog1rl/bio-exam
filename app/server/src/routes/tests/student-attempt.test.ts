import { defaultMistakeMetricForTemplate } from '@bio-exam/exam-core'

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { afterAll, beforeAll, describe, test } from 'vitest'

import { insertAttemptFixture } from '../../test-support/attempt-fixture.js'
import {
	createAttemptTest,
	insertOpenQuestion,
	insertOpenSession,
	seedAttemptWorld,
	seedStudent,
	type AttemptWorld,
} from '../../test-support/attempt-world.js'
import { call, startAuthApp, type AuthApp, type Reply } from '../../test-support/auth-app.js'

type Json = Record<string, unknown>

const REFERENCE = 'Эталон: упомянуть митоз и профазу'

let ctx: AuthApp
let world: AttemptWorld
let owner: { id: string; cookie: string }
let stranger: { id: string; cookie: string }

beforeAll(async () => {
	ctx = await startAuthApp('test_student_attempt')
	world = await seedAttemptWorld(ctx, 'sattempt')
	owner = await seedStudent(world, 'sattempt_owner')
	stranger = await seedStudent(world, 'sattempt_stranger')
}, 60_000)

afterAll(async () => {
	await ctx?.stop()
})

function attemptReply(cookie: string | null, attemptId: string): Promise<Reply> {
	return call(ctx, 'GET', `/api/tests/public/attempts/${attemptId}`, cookie ? { cookies: cookie } : {})
}

async function submittedAttempt() {
	const slug = `sattempt-${crypto.randomUUID().slice(0, 8)}`
	const testId = await createAttemptTest(world, { slug })
	const sessionId = await insertOpenSession(world, testId, owner.id)
	const openId = await insertOpenQuestion(ctx, testId, { order: 1 })
	const attemptId = await insertAttemptFixture(ctx.pgPool, {
		testId,
		userId: owner.id,
		sessionId,
		outcomeFacts: [{ questionId: openId, template: 'open', points: 3, earnedPoints: 0 }],
		results: [
			{
				questionId: openId,
				template: 'open',
				metric: defaultMistakeMetricForTemplate('open'),
				points: 3,
				earnedPoints: 0,
				isCorrect: false,
				mistakes: null,
				key: null,
				keyVersion: null,
				verdicts: null,
				userAnswer: 'Митоз делится на фазы',
				explanationText: REFERENCE,
			},
		],
		passingScore: 50,
	})
	const photoId = crypto.randomUUID()
	await ctx.pgPool.query(
		'INSERT INTO answer_photos (id, session_id, question_id, attempt_id) VALUES ($1, $2, $3, $4)',
		[photoId, sessionId, openId, attemptId]
	)
	return { attemptId, testId, openId, photoId, slug }
}

function openResult(body: Json, openId: string): Json {
	const results = (body.attempt as { results: Json[] }).results
	const found = results.find((item) => item.questionId === openId)
	assert.ok(found, 'результат открытого вопроса не найден')
	return found
}

describe('GET /api/tests/public/attempts/:attemptId', () => {
	test('владелец видит попытку на проверке: у открытого вопроса нет оценки и эталона, фото и вопросы на месте', async () => {
		const built = await submittedAttempt()

		const reply = await attemptReply(owner.cookie, built.attemptId)

		assert.equal(reply.status, 200, JSON.stringify(reply.body))
		assert.equal((reply.body.attempt as Json).reviewStatus, 'pending')
		const result = openResult(reply.body, built.openId)
		assert.equal(result.review, null)
		assert.equal(result.referenceText, null)
		assert.equal(result.userAnswer, 'Митоз делится на фазы')
		assert.equal((reply.body.test as Json).slug, built.slug)
		assert.deepEqual(
			(reply.body.questions as Json[]).map((question) => question.id),
			[built.openId]
		)
		const photos = (reply.body.photos as Record<string, Json[]>)[built.openId]
		assert.deepEqual(
			photos?.map((photo) => photo.id),
			[built.photoId]
		)
	})

	test('после проверки ученик видит оценку, комментарий, эталон и итог', async () => {
		const built = await submittedAttempt()
		const graded = await call(
			ctx,
			'POST',
			`/api/tests/admin/attempts/${built.attemptId}/questions/${built.openId}/review`,
			{ cookies: world.adminCookie, body: { score: 2, comment: 'Не хватает профазы' } }
		)
		assert.equal(graded.status, 200, JSON.stringify(graded.body))

		const reply = await attemptReply(owner.cookie, built.attemptId)

		assert.equal(reply.status, 200)
		const attempt = reply.body.attempt as Json
		assert.equal(attempt.reviewStatus, 'graded')
		assert.equal(attempt.passed, true)
		const result = openResult(reply.body, built.openId)
		assert.deepEqual(result.review, { score: 2, comment: 'Не хватает профазы' })
		assert.equal(result.referenceText, REFERENCE)
		assert.equal(result.earnedPoints, 2)
	})

	test('чужая и несуществующая попытка дают одинаковый 404, без входа 401', async () => {
		const built = await submittedAttempt()

		const foreign = await attemptReply(stranger.cookie, built.attemptId)
		const missing = await attemptReply(stranger.cookie, crypto.randomUUID())

		assert.equal(foreign.status, 404)
		assert.deepEqual(foreign.body, missing.body)
		assert.equal((await attemptReply(null, built.attemptId)).status, 401)
		assert.equal((await attemptReply(owner.cookie, 'not-a-uuid')).status, 400)
	})
})

describe('уведомление «работа проверена»', () => {
	test('открывает страницу результата попытки в разделе теста', async () => {
		const built = await submittedAttempt()
		await ctx.pgPool.query('INSERT INTO test_assignments (test_id, user_id, assigned_by) VALUES ($1, $2, $3)', [
			built.testId,
			owner.id,
			world.adminId,
		])
		const graded = await call(
			ctx,
			'POST',
			`/api/tests/admin/attempts/${built.attemptId}/questions/${built.openId}/review`,
			{ cookies: world.adminCookie, body: { score: 3 } }
		)
		assert.equal(graded.status, 200, JSON.stringify(graded.body))
		const event = await ctx.pgPool.query<{ id: string }>(
			"SELECT id FROM notification_events WHERE kind = 'attempt.graded' AND subject_id = $1 AND recipient_id = $2",
			[built.attemptId, owner.id]
		)
		assert.equal(event.rows.length, 1)

		const opened = await call(ctx, 'GET', `/api/notifications/${event.rows[0]!.id}/open`, { cookies: owner.cookie })

		assert.equal(opened.status, 200, JSON.stringify(opened.body))
		assert.equal(opened.body.href, `/tests/${world.topicSlug}/${built.slug}/attempts/${built.attemptId}`)
	})
})

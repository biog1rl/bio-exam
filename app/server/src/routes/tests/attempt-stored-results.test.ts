import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { afterAll, beforeAll, describe, test } from 'vitest'

import {
	addQuestion,
	adminReview,
	assignTest,
	ATTEMPT_QUESTIONS,
	createAttemptTest,
	seedAttemptWorld,
	seedStudent,
	startSession,
	submitAttempt,
	type AttemptWorld,
} from '../../test-support/attempt-world.js'
import { call, startAuthApp, type AuthApp } from '../../test-support/auth-app.js'

let ctx: AuthApp
let world: AttemptWorld
let student: { id: string; cookie: string }

beforeAll(async () => {
	ctx = await startAuthApp('test_attempt_stored')
	world = await seedAttemptWorld(ctx, 'stored')
	student = await seedStudent(world, 'stored_student')
}, 60_000)

afterAll(async () => {
	await ctx?.stop()
})

async function storedAttempt(attemptId: string): Promise<Record<string, unknown>> {
	const result = await ctx.pgPool.query(
		`SELECT answers, results, earned_points, total_points, score_percentage, passed, results_version, submitted_at
		 FROM test_attempts WHERE id = $1`,
		[attemptId]
	)
	const row = result.rows[0]
	assert.ok(row, `attempt ${attemptId} not found`)
	return row
}

async function submitted(slug: string) {
	const testId = await createAttemptTest(world, { slug })
	const radioId = await addQuestion(world, testId, 'radio', { order: 0 })
	const sequenceId = await addQuestion(world, testId, 'sequence', { order: 1 })
	await assignTest(world, testId, student.id)
	const started = await startSession(world, student.cookie, testId)
	assert.equal(started.status, 200, JSON.stringify(started.body))
	const reply = await submitAttempt(world, student.cookie, testId, {
		sessionId: started.body.sessionId,
		clientAttemptId: crypto.randomUUID(),
		answers: { [radioId]: 'b', [sequenceId]: '2315' },
	})
	assert.equal(reply.status, 200, JSON.stringify(reply.body))
	return { testId, radioId, sequenceId, attemptId: reply.body.attemptId as string }
}

function myAttempts(testId: string) {
	return call(ctx, 'GET', `/api/tests/public/tests/${testId}/attempts/me`, { cookies: student.cookie })
}

describe('сохранённые попытки не пересчитываются', () => {
	test('после правки ключей и чтения разборов строка test_attempts не меняется, история ученика та же', async () => {
		const { testId, radioId, sequenceId, attemptId } = await submitted('stored-recount')
		const rowBefore = await storedAttempt(attemptId)
		const historyBefore = await myAttempts(testId)
		assert.equal(historyBefore.status, 200, JSON.stringify(historyBefore.body))

		for (const [questionId, type, correct] of [
			[radioId, 'radio', 'a'],
			[sequenceId, 'sequence', '2315'],
		] as const) {
			const reply = await call(ctx, 'PATCH', `/api/tests/${testId}/questions/${questionId}`, {
				cookies: world.adminCookie,
				body: { ...ATTEMPT_QUESTIONS[type], correct },
			})
			assert.equal(reply.status, 200, JSON.stringify(reply.body))
		}

		assert.equal((await adminReview(world, attemptId)).status, 200)
		const historyAfter = await myAttempts(testId)
		assert.equal(historyAfter.status, 200)
		assert.deepEqual(historyAfter.body, historyBefore.body)
		assert.deepEqual(await storedAttempt(attemptId), rowBefore)
	})
})

describe('сохранённые ключи не перепроверяются при чтении', () => {
	test('активный ключ, невалидный по текущим правилам, не ломает чтение теста и разбор прежней попытки', async () => {
		const { testId, sequenceId, attemptId } = await submitted('stored-invalid-key')
		const reviewBefore = await adminReview(world, attemptId)
		assert.equal(reviewBefore.status, 200, JSON.stringify(reviewBefore.body))
		const rowBefore = await storedAttempt(attemptId)

		const updated = await ctx.pgPool.query(
			`UPDATE answer_keys SET correct_answer = '"12a4"'::jsonb WHERE question_id = $1 AND is_active`,
			[sequenceId]
		)
		assert.equal(updated.rowCount, 1)

		const adminTest = await call(ctx, 'GET', `/api/tests/${testId}`, { cookies: world.adminCookie })
		assert.equal(adminTest.status, 200, JSON.stringify(adminTest.body))
		const publicTest = await call(ctx, 'GET', `/api/tests/public/tests/${testId}`, { cookies: student.cookie })
		assert.equal(publicTest.status, 200, JSON.stringify(publicTest.body))

		const reviewAfter = await adminReview(world, attemptId)
		assert.equal(reviewAfter.status, 200, JSON.stringify(reviewAfter.body))
		assert.deepEqual(reviewAfter.body.attempt, reviewBefore.body.attempt)
		assert.deepEqual(await storedAttempt(attemptId), rowBefore)
	})
})

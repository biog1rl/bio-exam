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

type Student = { id: string; cookie: string }

type ReviewItem = {
	questionId: string
	isCorrect: boolean
	points: number
	earnedPoints: number
	correctAnswer: unknown
	keyVisible: boolean
	verdicts: { template: string; parts: unknown[] } | null
	mistakes: number | null
	status: string
}

let ctx: AuthApp
let world: AttemptWorld
let student: Student
let denied: Student

beforeAll(async () => {
	ctx = await startAuthApp('test_attempt_review')
	world = await seedAttemptWorld(ctx, 'review')
	student = await seedStudent(world, 'review_student')
	denied = await seedStudent(world, 'review_admin_deny_tests_read', { roles: ['admin'] })
	await ctx.db
		.insert(ctx.schema.rbacUserGrants)
		.values({ userId: denied.id, domain: 'tests', action: 'read', allow: false })
}, 60_000)

afterAll(async () => {
	await ctx?.stop()
})

function itemOf(body: Record<string, unknown>, questionId: string): ReviewItem {
	const attempt = body.attempt as Record<string, unknown>
	assert.ok(Array.isArray(attempt.results))
	const found = (attempt.results as ReviewItem[]).find((item) => item.questionId === questionId)
	assert.ok(found, `no review item for ${questionId}`)
	return found
}

async function patchKey(testId: string, questionId: string, type: 'radio' | 'sequence', correct: unknown) {
	const reply = await call(ctx, 'PATCH', `/api/tests/${testId}/questions/${questionId}`, {
		cookies: world.adminCookie,
		body: { ...ATTEMPT_QUESTIONS[type], correct },
	})
	assert.equal(reply.status, 200, JSON.stringify(reply.body))
}

async function setKeyCreatedAt(questionId: string, version: number, createdAt: string) {
	const result = await ctx.pgPool.query(
		'UPDATE answer_keys SET created_at = $3 WHERE question_id = $1 AND version = $2',
		[questionId, version, createdAt]
	)
	assert.equal(result.rowCount, 1, `answer_keys ${questionId} v${version}`)
}

async function insertLegacyAttempt(testId: string, results: unknown): Promise<string> {
	const [row] = await ctx.db
		.insert(ctx.schema.testAttempts)
		.values({
			testId,
			userId: student.id,
			answers: {},
			results,
			earnedPoints: 1,
			totalPoints: 3,
			scorePercentage: 33.3,
			passed: false,
			submittedAt: new Date('2026-09-10T12:00:00Z'),
			resultsVersion: 1,
		})
		.returning({ id: ctx.schema.testAttempts.id })
	assert.ok(row, 'legacy attempt was not inserted')
	return row.id
}

async function storedRow(attemptId: string): Promise<{ results_version: number; results: unknown }> {
	const result = await ctx.pgPool.query<{ results_version: number; results: unknown }>(
		'SELECT results_version, results FROM test_attempts WHERE id = $1',
		[attemptId]
	)
	const row = result.rows[0]
	assert.ok(row, `attempt ${attemptId} not found`)
	return row
}

async function submitV2(slug: string) {
	const testId = await createAttemptTest(world, { slug, showCorrectAnswer: false })
	const radioId = await addQuestion(world, testId, 'radio', { order: 0 })
	const sequenceId = await addQuestion(world, testId, 'sequence', { order: 1 })
	await assignTest(world, testId, student.id)
	const started = await startSession(world, student.cookie, testId)
	assert.equal(started.status, 200, JSON.stringify(started.body))
	const submitted = await submitAttempt(world, student.cookie, testId, {
		sessionId: started.body.sessionId,
		clientAttemptId: crypto.randomUUID(),
		answers: { [radioId]: 'b', [sequenceId]: '2315' },
	})
	assert.equal(submitted.status, 200, JSON.stringify(submitted.body))
	return { testId, radioId, sequenceId, attemptId: submitted.body.attemptId as string }
}

describe('разбор администратора попытки версии 2 (D1)', () => {
	test('ключ и вердикты на момент сдачи, правка ключа не меняет разбор', async () => {
		const { testId, radioId, sequenceId, attemptId } = await submitV2('review-v2')
		const before = await adminReview(world, attemptId)
		assert.equal(before.status, 200, JSON.stringify(before.body))
		const attempt = before.body.attempt as Record<string, unknown>
		assert.equal(attempt.attemptId, attemptId)
		assert.equal(attempt.testId, testId)
		assert.equal(attempt.userId, student.id)
		assert.deepEqual(attempt.answers, { [radioId]: 'b', [sequenceId]: '2315' })
		assert.ok(Array.isArray(before.body.questions))
		assert.equal((before.body.questions as unknown[]).length, 2)

		const radio = itemOf(before.body, radioId)
		assert.equal(radio.keyVisible, true)
		assert.equal(radio.correctAnswer, 'b')
		assert.equal(radio.verdicts?.template, 'single_choice')
		assert.equal(radio.status, 'correct')

		const sequence = itemOf(before.body, sequenceId)
		assert.equal(sequence.keyVisible, true)
		assert.equal(sequence.correctAnswer, '2314')
		assert.equal(sequence.verdicts?.template, 'sequence_digits')
		assert.equal(sequence.mistakes, 1)
		assert.equal(sequence.status, 'partial')

		await patchKey(testId, radioId, 'radio', 'a')
		await patchKey(testId, sequenceId, 'sequence', '4321')

		const after = await adminReview(world, attemptId)
		assert.equal(after.status, 200, JSON.stringify(after.body))
		assert.deepEqual(after.body.attempt, before.body.attempt)
	})
})

describe('доступ к разбору администратора', () => {
	test('роль user получает 403', async () => {
		const { attemptId } = await submitV2('review-access-user')
		const reply = await call(ctx, 'GET', `/api/tests/admin/attempts/${attemptId}`, { cookies: student.cookie })
		assert.equal(reply.status, 403)
		assert.equal(JSON.stringify(reply.body).includes('"2314"'), false)
	})

	test('admin с запретом tests.read получает 403', async () => {
		const { attemptId } = await submitV2('review-access-deny')
		const reply = await call(ctx, 'GET', `/api/tests/admin/attempts/${attemptId}`, { cookies: denied.cookie })
		assert.equal(reply.status, 403)
		assert.equal(JSON.stringify(reply.body).includes('"2314"'), false)
	})

	test('несуществующая попытка — 404', async () => {
		const reply = await adminReview(world, crypto.randomUUID())
		assert.equal(reply.status, 404)
		assert.deepEqual(reply.body, { error: 'Attempt not found' })
	})
})

describe('разбор администратора попытки версии 1 (D-19)', () => {
	test('ключ из версии answer_keys на момент сдачи, без версии до сдачи ключ неизвестен, строка не переписана', async () => {
		const testId = await createAttemptTest(world, { slug: 'review-v1-history' })
		const sequenceId = await addQuestion(world, testId, 'sequence', { order: 0 })
		const shortId = await addQuestion(world, testId, 'short_answer', { order: 1 })
		await patchKey(testId, sequenceId, 'sequence', '4321')
		await setKeyCreatedAt(sequenceId, 1, '2026-09-01 12:00:00')
		await setKeyCreatedAt(sequenceId, 2, '2026-09-20 12:00:00')
		await setKeyCreatedAt(shortId, 1, '2026-09-20 12:00:00')
		const results = [
			{ questionId: sequenceId, isCorrect: false, points: 2, earnedPoints: 1, userAnswer: '2315', correctAnswer: null },
			{ questionId: shortId, isCorrect: true, points: 1, earnedPoints: 1, userAnswer: 'Митоз', correctAnswer: null },
		]
		const attemptId = await insertLegacyAttempt(testId, results)

		const reply = await adminReview(world, attemptId)
		assert.equal(reply.status, 200, JSON.stringify(reply.body))

		const sequence = itemOf(reply.body, sequenceId)
		assert.equal(sequence.keyVisible, true)
		assert.equal(sequence.correctAnswer, '2314')
		assert.equal(sequence.verdicts?.template, 'sequence_digits')
		assert.equal(sequence.mistakes, 1)
		assert.equal(sequence.earnedPoints, 1)
		assert.equal(sequence.status, 'partial')

		const short = itemOf(reply.body, shortId)
		assert.equal(short.keyVisible, false)
		assert.equal(short.correctAnswer, null)
		assert.equal(short.verdicts, null)
		assert.equal(short.mistakes, null)
		assert.equal(short.isCorrect, true)
		assert.equal(short.earnedPoints, 1)
		assert.equal(short.status, 'correct')

		assert.equal(JSON.stringify(reply.body.attempt).includes('"4321"'), false)
		assert.deepEqual(await storedRow(attemptId), { results_version: 1, results })
	})

	test('R2: старые 0 баллов у sequence, пересчёт дал бы 1 балл — ключ показан, вердиктов и ошибок нет', async () => {
		const testId = await createAttemptTest(world, { slug: 'review-v1-r2' })
		const sequenceId = await addQuestion(world, testId, 'sequence')
		const results = [
			{
				questionId: sequenceId,
				isCorrect: false,
				points: 2,
				earnedPoints: 0,
				userAnswer: '2315',
				correctAnswer: '2314',
			},
		]
		const attemptId = await insertLegacyAttempt(testId, results)

		const reply = await adminReview(world, attemptId)
		assert.equal(reply.status, 200, JSON.stringify(reply.body))
		const sequence = itemOf(reply.body, sequenceId)
		assert.equal(sequence.keyVisible, true)
		assert.equal(sequence.correctAnswer, '2314')
		assert.equal(sequence.verdicts, null)
		assert.equal(sequence.mistakes, null)
		assert.equal(sequence.earnedPoints, 0)
		assert.equal(sequence.status, 'wrong')
		assert.deepEqual(await storedRow(attemptId), { results_version: 1, results })
	})

	test('results не по схеме версии 1 — 500 без данных строки', async () => {
		const testId = await createAttemptTest(world, { slug: 'review-v1-broken' })
		await addQuestion(world, testId, 'radio')
		const attemptId = await insertLegacyAttempt(testId, { x: 1 })

		const reply = await adminReview(world, attemptId)
		assert.equal(reply.status, 500)
		assert.equal(JSON.stringify(reply.body).includes('"x"'), false)
		assert.deepEqual(await storedRow(attemptId), { results_version: 1, results: { x: 1 } })
	})
})

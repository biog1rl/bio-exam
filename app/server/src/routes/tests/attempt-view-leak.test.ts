import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { afterAll, beforeAll, describe, test } from 'vitest'

import {
	addQuestion,
	assignTest,
	createAttemptTest,
	seedAttemptWorld,
	seedStudent,
	startSession,
	submitAttempt,
	type AttemptWorld,
} from '../../test-support/attempt-world.js'
import { startAuthApp, type AuthApp } from '../../test-support/auth-app.js'

type Student = { id: string; cookie: string }

type ViewItem = {
	questionId: string
	isCorrect: boolean
	correctAnswer: unknown
	keyVisible: boolean
	verdicts: { template: string; parts: unknown[] } | null
	mistakes: number | null
	status: string
}

type StoredFact = { questionId: string; key: unknown; keyVersion: unknown; verdicts: unknown; mistakes: unknown }

let ctx: AuthApp
let world: AttemptWorld
let student: Student

beforeAll(async () => {
	ctx = await startAuthApp('test_attempt_leak')
	world = await seedAttemptWorld(ctx, 'leak')
	student = await seedStudent(world, 'leak_student')
}, 60_000)

afterAll(async () => {
	await ctx?.stop()
})

function itemOf(body: Record<string, unknown>, questionId: string): ViewItem {
	assert.ok(Array.isArray(body.results))
	const found = (body.results as ViewItem[]).find((item) => item.questionId === questionId)
	assert.ok(found, `no result for ${questionId}`)
	return found
}

async function storedRow(attemptId: string): Promise<{ results_version: number; results: StoredFact[] }> {
	const result = await ctx.pgPool.query<{ results_version: number; results: StoredFact[] }>(
		'SELECT results_version, results FROM test_attempts WHERE id = $1',
		[attemptId]
	)
	const row = result.rows[0]
	assert.ok(row, `attempt ${attemptId} not found`)
	return row
}

async function prepare(slug: string, showCorrectAnswer: boolean) {
	const testId = await createAttemptTest(world, { slug, showCorrectAnswer })
	const sequenceId = await addQuestion(world, testId, 'sequence', { order: 0 })
	const shortId = await addQuestion(world, testId, 'short_answer', { order: 1 })
	await assignTest(world, testId, student.id)
	const started = await startSession(world, student.cookie, testId)
	assert.equal(started.status, 200, JSON.stringify(started.body))
	return { testId, sequenceId, shortId, sessionId: started.body.sessionId as string }
}

describe('вид попытки при скрытом ключе', () => {
	test('первый ответ и повтор без значений ключей, в строке ключ и keyVersion', async () => {
		const { testId, sequenceId, shortId, sessionId } = await prepare('leak-hidden', false)
		const body = {
			sessionId,
			clientAttemptId: crypto.randomUUID(),
			answers: { [sequenceId]: '2315', [shortId]: 'Мейоз' },
		}
		const first = await submitAttempt(world, student.cookie, testId, body)
		const second = await submitAttempt(world, student.cookie, testId, body)
		assert.equal(first.status, 200, JSON.stringify(first.body))
		assert.equal(second.status, 200, JSON.stringify(second.body))
		assert.deepEqual(second.body, first.body)

		for (const reply of [first, second]) {
			const json = JSON.stringify(reply.body)
			assert.equal(json.includes('"2314"'), false)
			assert.equal(json.includes('"Митоз"'), false)
			for (const questionId of [sequenceId, shortId]) {
				const item = itemOf(reply.body, questionId)
				assert.equal(item.isCorrect, false)
				assert.equal(item.keyVisible, false)
				assert.equal(item.correctAnswer, null)
				assert.equal(item.verdicts, null)
				assert.equal(item.mistakes, null)
			}
		}
		assert.equal(itemOf(first.body, sequenceId).status, 'partial')
		assert.equal(itemOf(first.body, shortId).status, 'wrong')

		const row = await storedRow(first.body.attemptId as string)
		assert.equal(row.results_version, 2)
		const sequenceFact = row.results.find((fact) => fact.questionId === sequenceId)
		const shortFact = row.results.find((fact) => fact.questionId === shortId)
		assert.ok(sequenceFact && shortFact)
		assert.equal(sequenceFact.key, '2314')
		assert.equal(sequenceFact.keyVersion, 1)
		assert.equal(sequenceFact.mistakes, 1)
		assert.ok(sequenceFact.verdicts)
		assert.equal(shortFact.key, 'Митоз')
		assert.equal(shortFact.keyVersion, 1)
	})
})

describe('вид попытки при открытом ключе', () => {
	test('неверная последовательность: ключ, вердикты sequence_digits, одна ошибка, статус partial', async () => {
		const { testId, sequenceId, shortId, sessionId } = await prepare('leak-shown', true)
		const reply = await submitAttempt(world, student.cookie, testId, {
			sessionId,
			clientAttemptId: crypto.randomUUID(),
			answers: { [sequenceId]: '2315', [shortId]: 'Митоз' },
		})
		assert.equal(reply.status, 200, JSON.stringify(reply.body))
		const sequence = itemOf(reply.body, sequenceId)
		assert.equal(sequence.correctAnswer, '2314')
		assert.equal(sequence.keyVisible, true)
		assert.ok(sequence.verdicts)
		assert.equal(sequence.verdicts.template, 'sequence_digits')
		assert.ok(sequence.verdicts.parts.length > 0)
		assert.equal(sequence.mistakes, 1)
		assert.equal(sequence.status, 'partial')
		const short = itemOf(reply.body, shortId)
		assert.equal(short.isCorrect, true)
		assert.equal(short.correctAnswer, null)
		assert.equal(short.status, 'correct')
	})
})

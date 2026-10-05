import assert from 'node:assert/strict'
import { afterAll, beforeAll, describe, test } from 'vitest'

import {
	addQuestion,
	assignTest,
	createAttemptTest,
	seedAttemptWorld,
	seedStudent,
	type AttemptWorld,
} from '../../test-support/attempt-world.js'
import { call, startAuthApp, type AuthApp } from '../../test-support/auth-app.js'

const EXPLANATION = 'Пояснение-маркер: деление соматической клетки'
const KEY = 'Эталон-маркер-ответа'

const STUDENT_QUESTION_KEYS = [
	'id',
	'matchingPairs',
	'options',
	'order',
	'points',
	'promptText',
	'questionTypeTitle',
	'questionUiTemplate',
	'type',
]

let ctx: AuthApp
let world: AttemptWorld
let student: { id: string; cookie: string }
let testId: string
let topicSlug: string
let testSlug: string

beforeAll(async () => {
	ctx = await startAuthApp('test_student_question_payload')
	world = await seedAttemptWorld(ctx, 'payload')
	student = await seedStudent(world, 'payload_student')
	testSlug = 'payload-test'
	topicSlug = world.topicSlug
	testId = await createAttemptTest(world, { slug: testSlug })
	await addQuestion(world, testId, 'short_answer', { correct: KEY, explanationText: EXPLANATION })
	await addQuestion(world, testId, 'radio', { explanationText: EXPLANATION })
	await assignTest(world, testId, student.id)
}, 60_000)

afterAll(async () => {
	await ctx?.stop()
})

describe('вопросы ученику: белый список полей', () => {
	test('вопросу задано пояснение и эталон', async () => {
		const result = await ctx.pgPool.query<{ explanation_path: string | null }>(
			'SELECT explanation_path FROM questions WHERE test_id = $1',
			[testId]
		)
		assert.equal(result.rows.length, 2)
		for (const row of result.rows) assert.notEqual(row.explanation_path, null)
		const keys = await ctx.pgPool.query<{ count: number }>(
			'SELECT count(*)::int AS count FROM answer_keys k JOIN questions q ON q.id = k.question_id WHERE q.test_id = $1',
			[testId]
		)
		assert.equal(keys.rows[0]?.count, 2)
	})

	test.each([
		['по slug темы и теста', () => `/api/tests/public/topics/${topicSlug}/tests/${testSlug}`],
		['по id теста', () => `/api/tests/public/tests/${testId}`],
	])('GET %s отдаёт у каждого вопроса ровно белый список ключей и ни эталона, ни пояснения', async (_name, path) => {
		const reply = await call(ctx, 'GET', path(), { cookies: student.cookie })
		assert.equal(reply.status, 200, JSON.stringify(reply.body))
		const items = reply.body.questions as Record<string, unknown>[]
		assert.equal(items.length, 2)
		for (const question of items) assert.deepEqual(Object.keys(question).sort(), STUDENT_QUESTION_KEYS)
		const serialized = JSON.stringify(reply.body)
		assert.equal(serialized.includes(EXPLANATION), false)
		assert.equal(serialized.includes(KEY), false)
	})
})

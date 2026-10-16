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
import { startAuthApp, type AuthApp } from '../../test-support/auth-app.js'

type Photo = 'session' | 'attempt' | null

type Variant = { name: string; text: string | null; photo: Photo; empty: boolean }

const VARIANTS: Variant[] = [
	{ name: 'пустая строка', text: '', photo: null, empty: true },
	{ name: 'нет ответа', text: null, photo: null, empty: true },
	{ name: 'пробелы', text: '   ', photo: null, empty: true },
	{ name: 'перевод строки и табуляция', text: '\n\t', photo: null, empty: true },
	{ name: 'неразрывный пробел', text: '  ', photo: null, empty: true },
	{ name: 'только текст', text: 'ответ', photo: null, empty: false },
	{ name: 'только фото через сессию', text: '', photo: 'session', empty: false },
	{ name: 'только фото через попытку', text: null, photo: 'attempt', empty: false },
	{ name: 'и текст и фото', text: 'ответ', photo: 'session', empty: false },
]

let ctx: AuthApp
let world: AttemptWorld
let rule: typeof import('./open-answer-rule.js')
let reviews: typeof import('../answer-reviews/queries.js')
let attemptId = ''
let sessionId = ''
let questionIds: string[] = []

function factOf(questionId: string, userAnswer: string | null) {
	return {
		questionId,
		template: 'open' as const,
		metric: defaultMistakeMetricForTemplate('open'),
		points: 3,
		earnedPoints: 0,
		isCorrect: false,
		mistakes: null,
		key: null,
		keyVersion: null,
		verdicts: null,
		userAnswer,
		explanationText: null,
	}
}

beforeAll(async () => {
	ctx = await startAuthApp('test_open_answer_rule')
	world = await seedAttemptWorld(ctx, 'oar')
	const student = await seedStudent(world, 'oar_student')
	const testId = await createAttemptTest(world, { slug: 'oar-test' })
	sessionId = await insertOpenSession(world, testId, student.id)
	const otherSession = crypto.randomUUID()
	await ctx.pgPool.query(
		"INSERT INTO test_sessions (id, test_id, user_id, closed_at, close_reason) VALUES ($1, $2, $3, now(), 'expired')",
		[otherSession, testId, student.id]
	)
	for (const [index] of VARIANTS.entries()) questionIds.push(await insertOpenQuestion(ctx, testId, { order: index }))
	const facts = VARIANTS.map((variant, index) => factOf(questionIds[index]!, variant.text))
	attemptId = await insertAttemptFixture(ctx.pgPool, {
		testId,
		userId: student.id,
		sessionId,
		outcomeFacts: facts.map(({ questionId, template, points, earnedPoints }) => ({
			questionId,
			template,
			points,
			earnedPoints,
		})),
		results: facts,
		passingScore: null,
	})
	for (const [index, variant] of VARIANTS.entries()) {
		if (!variant.photo) continue
		await ctx.pgPool.query(
			'INSERT INTO answer_photos (id, session_id, question_id, attempt_id) VALUES ($1, $2, $3, $4)',
			[
				crypto.randomUUID(),
				variant.photo === 'session' ? sessionId : otherSession,
				questionIds[index],
				variant.photo === 'attempt' ? attemptId : null,
			]
		)
	}
	rule = await import('./open-answer-rule.js')
	reviews = await import('../answer-reviews/queries.js')
}, 60_000)

afterAll(async () => {
	await ctx.stop()
})

describe('правило «открытый ответ пуст»', () => {
	test('emptyOpenQuestionIds по таблице вариантов', async () => {
		const answers = Object.fromEntries(VARIANTS.map((variant, index) => [questionIds[index]!, variant.text]))
		const empty = new Set(await rule.emptyOpenQuestionIds(ctx.db, { sessionId, attemptId, answers }))
		for (const [index, variant] of VARIANTS.entries()) {
			assert.equal(empty.has(questionIds[index]!), variant.empty, variant.name)
		}
	})

	test('до сдачи фото ищутся только по сессии', async () => {
		const answers = Object.fromEntries(VARIANTS.map((variant, index) => [questionIds[index]!, variant.text]))
		const empty = new Set(await rule.emptyOpenQuestionIds(ctx.db, { sessionId, answers }))
		const attemptPhotoIndex = VARIANTS.findIndex((variant) => variant.photo === 'attempt')
		assert.equal(empty.has(questionIds[attemptPhotoIndex]!), true)
		assert.equal(await rule.sessionHasPhotos(ctx.db, sessionId), true)
	})

	test('предфильтр SQL выбирает те же вопросы, что и TypeScript', async () => {
		const expected = VARIANTS.flatMap((variant, index) => (variant.empty ? [questionIds[index]!] : [])).sort()
		const candidates = await reviews.findNoAnswerCandidates(100)
		const found = candidates.find((candidate) => candidate.attemptId === attemptId)
		assert.deepEqual([...(found?.questionIds ?? [])].sort(), expected)
	})
})

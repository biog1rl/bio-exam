import assert from 'node:assert/strict'
import { test } from 'vitest'

import { AnswerValueSchema, SubmitResultItemSchema, SubmitResultSchema } from './attempt-result'

const ATTEMPT = '11111111-1111-4111-8111-111111111111'
const Q1 = '22222222-2222-4222-8222-222222222222'

const validItem = {
	questionId: Q1,
	isCorrect: true,
	points: 2,
	earnedPoints: 2,
	userAnswer: 'a',
	correctAnswer: 'a',
	explanationText: null,
}

const validResult = {
	attemptId: ATTEMPT,
	submittedAt: '2026-01-01T00:00:00.000Z',
	earnedPoints: 2,
	totalPoints: 2,
	scorePercentage: 100,
	passed: true,
	results: [validItem],
}

const acceptedAnswers: Array<{ name: string; value: unknown }> = [
	{ name: 'строка', value: 'a' },
	{ name: 'пустая строка', value: '' },
	{ name: 'массив строк', value: ['a', 'b'] },
	{ name: 'пустой массив', value: [] },
	{ name: 'объект строка в строку', value: { l1: 'r1' } },
]

for (const row of acceptedAnswers) {
	test(`AnswerValueSchema: принимает — ${row.name}`, () => {
		assert.deepEqual(AnswerValueSchema.parse(row.value), row.value)
	})
}

const rejectedAnswers: Array<{ name: string; value: unknown }> = [
	{ name: 'число', value: 1 },
	{ name: 'null', value: null },
	{ name: 'массив с числом', value: ['a', 1] },
	{ name: 'объект с числовым значением', value: { l1: 1 } },
	{ name: 'undefined', value: undefined },
]

for (const row of rejectedAnswers) {
	test(`AnswerValueSchema: отклоняет — ${row.name}`, () => {
		assert.equal(AnswerValueSchema.safeParse(row.value).success, false)
	})
}

test('SubmitResultSchema: принимает текущий ответ submit', () => {
	assert.deepEqual(SubmitResultSchema.parse(validResult), validResult)
})

test('SubmitResultSchema: принимает пустой список results', () => {
	assert.equal(SubmitResultSchema.safeParse({ ...validResult, results: [] }).success, true)
})

test('SubmitResultSchema: лишние поля не требуются и не ломают разбор', () => {
	assert.equal(SubmitResultSchema.safeParse({ ...validResult, extra: 1 }).success, true)
})

test('SubmitResultItemSchema: принимает произвольные userAnswer и correctAnswer и текст пояснения', () => {
	const item = {
		...validItem,
		userAnswer: { l1: 'r1' },
		correctAnswer: ['a', 'b'],
		explanationText: 'Пояснение',
	}
	assert.deepEqual(SubmitResultItemSchema.parse(item), item)
})

const rejectedResults: Array<{ name: string; value: unknown }> = [
	{
		name: 'элемент results без questionId',
		value: { ...validResult, results: [{ ...validItem, questionId: undefined }] },
	},
	{ name: 'questionId не uuid', value: { ...validResult, results: [{ ...validItem, questionId: 'q1' }] } },
	{ name: 'attemptId не uuid', value: { ...validResult, attemptId: 'x' } },
	{ name: 'нет passed', value: { ...validResult, passed: undefined } },
	{
		name: 'explanationText не nullable-строка',
		value: { ...validResult, results: [{ ...validItem, explanationText: 1 }] },
	},
	{ name: 'нет explanationText', value: { ...validResult, results: [{ ...validItem, explanationText: undefined }] } },
	{ name: 'scorePercentage строкой', value: { ...validResult, scorePercentage: '100' } },
]

for (const row of rejectedResults) {
	test(`SubmitResultSchema: отклоняет — ${row.name}`, () => {
		assert.equal(SubmitResultSchema.safeParse(row.value).success, false)
	})
}

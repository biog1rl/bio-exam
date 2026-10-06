import assert from 'node:assert/strict'
import { describe, test } from 'vitest'

import {
	ANSWER_ITEM_MAX_LENGTH,
	ANSWER_ITEMS_MAX,
	ANSWER_VIOLATION_REASONS,
	findAnswerViolation,
	OPEN_TEXT_MAX_LENGTH,
	SHORT_TEXT_MAX_LENGTH,
} from './answer-limits'
import type { QuestionUiTemplate } from './registry'

const SHORT = 'short'
const SEQ = 'seq'
const OPEN = 'open'
const CHOICE = 'choice'
const MULTI = 'multi'
const MATCH = 'match'

const questions: Array<{ id: string; template: QuestionUiTemplate | null }> = [
	{ id: SHORT, template: 'short_text' },
	{ id: SEQ, template: 'sequence_digits' },
	{ id: OPEN, template: 'open' },
	{ id: CHOICE, template: 'single_choice' },
	{ id: MULTI, template: 'multi_choice' },
	{ id: MATCH, template: 'matching' },
]

const text = (length: number) => 'а'.repeat(length)
const ids = (count: number) => Array.from({ length: count }, (_, index) => `o${index}`)
const pairs = (count: number) => Object.fromEntries(ids(count).map((id) => [id, id]))
const shapeInvalid = (questionId: string) => ({ reason: 'answer_shape_invalid', questionId })

describe('findAnswerViolation', () => {
	test.each([
		{ name: 'пустой словарь', answers: {}, expected: null },
		{ name: 'short_text 200', answers: { [SHORT]: text(200) }, expected: null },
		{
			name: 'short_text 201',
			answers: { [SHORT]: text(201) },
			expected: { reason: 'short_text_too_long', questionId: SHORT, limit: 200 },
		},
		{ name: 'sequence_digits 200', answers: { [SEQ]: '1'.repeat(200) }, expected: null },
		{
			name: 'sequence_digits 201',
			answers: { [SEQ]: '1'.repeat(201) },
			expected: { reason: 'short_text_too_long', questionId: SEQ, limit: 200 },
		},
		{ name: 'open 5000', answers: { [OPEN]: text(5000) }, expected: null },
		{
			name: 'open 5001',
			answers: { [OPEN]: text(5001) },
			expected: { reason: 'open_text_too_long', questionId: OPEN, limit: 5000 },
		},
		{ name: 'open длиннее предела short_text', answers: { [OPEN]: text(201) }, expected: null },
		{
			name: 'чужой вопрос',
			answers: { stranger: 'x' },
			expected: { reason: 'foreign_question', questionId: 'stranger' },
		},
		{
			name: 'чужой вопрос раньше длины',
			answers: { stranger: 'x', [SHORT]: text(201) },
			expected: { reason: 'foreign_question', questionId: 'stranger' },
		},
		{ name: 'null в текстовом шаблоне', answers: { [SHORT]: null, [OPEN]: null }, expected: null },
		{ name: 'массив в текстовом шаблоне', answers: { [SHORT]: ['x'.repeat(500)] }, expected: shapeInvalid(SHORT) },
		{ name: 'объект в открытом вопросе', answers: { [OPEN]: { a: text(10000) } }, expected: shapeInvalid(OPEN) },
		{ name: 'выбор: id 200', answers: { [CHOICE]: text(200) }, expected: null },
		{ name: 'выбор: id 201', answers: { [CHOICE]: text(201) }, expected: shapeInvalid(CHOICE) },
		{ name: 'выбор: массив вместо id', answers: { [CHOICE]: ['o1'] }, expected: shapeInvalid(CHOICE) },
		{ name: 'множественный выбор: 50 id', answers: { [MULTI]: ids(50) }, expected: null },
		{ name: 'множественный выбор: 51 id', answers: { [MULTI]: ids(51) }, expected: shapeInvalid(MULTI) },
		{ name: 'множественный выбор: длинный id', answers: { [MULTI]: [text(201)] }, expected: shapeInvalid(MULTI) },
		{ name: 'множественный выбор: строка', answers: { [MULTI]: 'o1' }, expected: shapeInvalid(MULTI) },
		{ name: 'соответствие: 50 пар', answers: { [MATCH]: pairs(50) }, expected: null },
		{ name: 'соответствие: 51 пара', answers: { [MATCH]: pairs(51) }, expected: shapeInvalid(MATCH) },
		{ name: 'соответствие: длинное значение', answers: { [MATCH]: { l1: text(201) } }, expected: shapeInvalid(MATCH) },
		{ name: 'соответствие: массив', answers: { [MATCH]: ['o1'] }, expected: shapeInvalid(MATCH) },
		{ name: 'эмодзи по String.length', answers: { [SHORT]: '😀'.repeat(100) }, expected: null },
		{
			name: 'эмодзи сверх предела',
			answers: { [SHORT]: '😀'.repeat(101) },
			expected: { reason: 'short_text_too_long', questionId: SHORT, limit: 200 },
		},
	])('$name', ({ answers, expected }) => {
		assert.deepEqual(findAnswerViolation({ answers, questions }), expected)
	})

	test('вопрос без типа даёт unknown_question_type до проверки ответов', () => {
		const result = findAnswerViolation({
			answers: { stranger: 'x' },
			questions: [...questions, { id: 'untyped', template: null }],
		})

		assert.deepEqual(result, { reason: 'unknown_question_type', questionId: 'untyped' })
	})

	test('пределы и причины', () => {
		assert.equal(SHORT_TEXT_MAX_LENGTH, 200)
		assert.equal(OPEN_TEXT_MAX_LENGTH, 5000)
		assert.equal(ANSWER_ITEM_MAX_LENGTH, 200)
		assert.equal(ANSWER_ITEMS_MAX, 50)
		assert.deepEqual(
			[...ANSWER_VIOLATION_REASONS],
			['foreign_question', 'unknown_question_type', 'short_text_too_long', 'open_text_too_long', 'answer_shape_invalid']
		)
	})
})

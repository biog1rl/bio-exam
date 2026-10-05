import assert from 'node:assert/strict'
import { describe, test } from 'vitest'

import {
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

const questions: Array<{ id: string; template: QuestionUiTemplate | null }> = [
	{ id: SHORT, template: 'short_text' },
	{ id: SEQ, template: 'sequence_digits' },
	{ id: OPEN, template: 'open' },
	{ id: CHOICE, template: 'single_choice' },
]

const text = (length: number) => 'а'.repeat(length)

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
		{ name: 'массив в текстовом шаблоне', answers: { [SHORT]: ['x'.repeat(500)] }, expected: null },
		{ name: 'выбор без предела длины', answers: { [CHOICE]: text(10000) }, expected: null },
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
		assert.deepEqual(
			[...ANSWER_VIOLATION_REASONS],
			['foreign_question', 'unknown_question_type', 'short_text_too_long', 'open_text_too_long']
		)
	})
})

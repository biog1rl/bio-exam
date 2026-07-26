import assert from 'node:assert/strict'

import type { PublicTestQuestion } from '@/lib/tests/types'

import { formatAnswerLines, getChoiceOptionReviewRows } from './attempt-review-utils'

const sequenceQuestion = {
	questionUiTemplate: 'sequence_digits',
	options: null,
	matchingPairs: null,
} as PublicTestQuestion

const shortAnswerQuestion = {
	questionUiTemplate: 'short_text',
	options: null,
	matchingPairs: null,
} as PublicTestQuestion

assert.deepEqual(formatAnswerLines(sequenceQuestion, 53412), ['53412'])
assert.deepEqual(formatAnswerLines(shortAnswerQuestion, 4), ['4'])
assert.deepEqual(formatAnswerLines(shortAnswerQuestion, 'митоз'), ['митоз'])
assert.deepEqual(formatAnswerLines(shortAnswerQuestion, ['эксперимент', 'моделирование']), [
	'эксперимент',
	'моделирование',
])
assert.deepEqual(formatAnswerLines(shortAnswerQuestion, null), ['Нет ответа'])

const multiChoiceQuestion = {
	questionUiTemplate: 'multi_choice',
	options: [
		{ id: '1', text: 'Первый вариант' },
		{ id: '2', text: 'Второй вариант' },
		{ id: '3', text: 'Третий вариант' },
		{ id: '4', text: 'Четвёртый вариант' },
	],
	matchingPairs: null,
} as PublicTestQuestion

assert.deepEqual(getChoiceOptionReviewRows(multiChoiceQuestion, ['1', '3'], ['1', '2']), [
	{ id: '1', text: 'Первый вариант', status: 'correct' },
	{ id: '2', text: 'Второй вариант', status: 'correct' },
	{ id: '3', text: 'Третий вариант', status: 'incorrect-selected' },
	{ id: '4', text: 'Четвёртый вариант', status: 'neutral' },
])

const singleChoiceQuestion = {
	...multiChoiceQuestion,
	questionUiTemplate: 'single_choice',
} as PublicTestQuestion

assert.deepEqual(getChoiceOptionReviewRows(singleChoiceQuestion, '2', '1'), [
	{ id: '1', text: 'Первый вариант', status: 'correct' },
	{ id: '2', text: 'Второй вариант', status: 'incorrect-selected' },
	{ id: '3', text: 'Третий вариант', status: 'neutral' },
	{ id: '4', text: 'Четвёртый вариант', status: 'neutral' },
])

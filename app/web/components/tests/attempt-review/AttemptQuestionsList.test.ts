import { computeVerdicts } from '@bio-exam/exam-core'

import assert from 'node:assert/strict'
import { test } from 'vitest'

import type { PublicTestQuestion } from '@/lib/tests/types'

import { formatAnswerLines, getChoiceOptionReviewRows } from './attempt-review-utils'

test('formatAnswerLines: форматирует ответы коротких и последовательных вопросов', () => {
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
})

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

test('getChoiceOptionReviewRows: размечает варианты вопроса с несколькими ответами', () => {
	assert.deepEqual(
		getChoiceOptionReviewRows(
			multiChoiceQuestion,
			computeVerdicts({
				template: 'multi_choice',
				key: ['1', '2'],
				answer: ['1', '3'],
				content: { options: multiChoiceQuestion.options },
			})
		),
		[
			{ id: '1', text: 'Первый вариант', status: 'correct' },
			{ id: '2', text: 'Второй вариант', status: 'correct' },
			{ id: '3', text: 'Третий вариант', status: 'incorrect-selected' },
			{ id: '4', text: 'Четвёртый вариант', status: 'neutral' },
		]
	)
})

test('getChoiceOptionReviewRows: размечает варианты вопроса с одним ответом', () => {
	const singleChoiceQuestion = {
		...multiChoiceQuestion,
		questionUiTemplate: 'single_choice',
	} as PublicTestQuestion

	assert.deepEqual(
		getChoiceOptionReviewRows(
			singleChoiceQuestion,
			computeVerdicts({
				template: 'single_choice',
				key: '1',
				answer: '2',
				content: { options: singleChoiceQuestion.options },
			})
		),
		[
			{ id: '1', text: 'Первый вариант', status: 'correct' },
			{ id: '2', text: 'Второй вариант', status: 'incorrect-selected' },
			{ id: '3', text: 'Третий вариант', status: 'neutral' },
			{ id: '4', text: 'Четвёртый вариант', status: 'neutral' },
		]
	)
})

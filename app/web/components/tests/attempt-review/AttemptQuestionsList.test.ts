import assert from 'node:assert/strict'

import type { PublicTestQuestion } from '@/lib/tests/types'

import { formatAnswerLines } from './attempt-review-utils'

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

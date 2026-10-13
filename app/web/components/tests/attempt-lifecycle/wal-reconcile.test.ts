import type { AnswerValue } from '@bio-exam/exam-core'

import assert from 'node:assert/strict'
import { describe, test } from 'vitest'

import { Q1, Q2, Q3, QUESTION_IDS } from './testing'
import { unsentTexts, type UnsentEntry } from './wal-reconcile'

type Row = {
	name: string
	local: Record<string, AnswerValue>
	stored: { questionId: string; userAnswer: unknown }[] | null
	text?: string[]
	pending?: string[]
	expected: UnsentEntry[]
}

const rows: Row[] = [
	{
		name: 'совпало',
		local: { [Q1]: 'ответ' },
		stored: [{ questionId: Q1, userAnswer: 'ответ' }],
		expected: [],
	},
	{
		name: 'совпало после trim',
		local: { [Q1]: '  ответ \n' },
		stored: [{ questionId: Q1, userAnswer: 'ответ ' }],
		expected: [],
	},
	{
		name: 'отличается',
		local: { [Q1]: 'полный текст' },
		stored: [{ questionId: Q1, userAnswer: 'полн' }],
		expected: [{ questionId: Q1, number: 1, text: 'полный текст' }],
	},
	{
		name: 'нет ответа в попытке',
		local: { [Q2]: 'текст' },
		stored: [],
		expected: [{ questionId: Q2, number: 2, text: 'текст' }],
	},
	{
		name: 'в попытке не строка',
		local: { [Q2]: 'текст' },
		stored: [{ questionId: Q2, userAnswer: null }],
		expected: [{ questionId: Q2, number: 2, text: 'текст' }],
	},
	{
		name: 'пустая локальная строка',
		local: { [Q1]: '   ' },
		stored: [{ questionId: Q1, userAnswer: 'ответ' }],
		expected: [],
	},
	{
		name: 'ответ выбора отличается — не сверяется',
		local: { [Q3]: 'option-b' },
		stored: [{ questionId: Q3, userAnswer: 'option-a' }],
		text: [Q1],
		expected: [],
	},
	{
		name: 'без вида попытки, вопрос в pending',
		local: { [Q1]: 'текст' },
		stored: null,
		pending: [Q1],
		expected: [{ questionId: Q1, number: 1, text: 'текст' }],
	},
	{
		name: 'без вида попытки, вопрос подтверждён',
		local: { [Q1]: 'текст' },
		stored: null,
		pending: [],
		expected: [],
	},
	{
		name: 'порядок и номера по порядку вопросов',
		local: { [Q3]: 'третий', [Q1]: 'первый' },
		stored: [],
		expected: [
			{ questionId: Q1, number: 1, text: 'первый' },
			{ questionId: Q3, number: 3, text: 'третий' },
		],
	},
]

describe('unsentTexts', () => {
	test.each(rows.map((row): [string, Row] => [row.name, row]))('%s', (_name, row) => {
		const entries = unsentTexts({
			local: row.local,
			stored: row.stored,
			textQuestionIds: new Set(row.text ?? QUESTION_IDS),
			questionOrder: QUESTION_IDS,
			pending: new Set(row.pending ?? []),
		})
		assert.deepEqual(entries, row.expected)
	})
})

import assert from 'node:assert/strict'
import { describe, test } from 'vitest'

import {
	ANSWER_ID_LIST_CASES,
	CHOICE_REVIEW_CASES,
	IS_ANSWERED_CASES,
	MATCHING_REVIEW_CASES,
	NORMALIZE_KEY_VALUE_CASES,
	READ_KEY_CASES,
	SEQUENCE_REVIEW_CASES,
	SHORT_TEXT_REVIEW_CASES,
} from './cases/review.cases'
import { AUTO_SCORED_TEMPLATES, QUESTION_UI_TEMPLATES, type QuestionUiTemplate } from './registry'
import {
	allPartsCorrect,
	answerIdList,
	computeVerdicts,
	errorUnits,
	isAnswered,
	normalizeKeyValue,
	readKey,
} from './review'

describe('разбор sequence_digits', () => {
	test.each(SEQUENCE_REVIEW_CASES)('$name', (row) => {
		const verdicts = computeVerdicts({ template: 'sequence_digits', key: row.key, answer: row.answer })
		assert.equal(verdicts.template, 'sequence_digits')
		if (verdicts.template !== 'sequence_digits') return
		assert.deepEqual(
			verdicts.parts.map((part) => part.kind),
			row.kinds
		)
		assert.equal(verdicts.mistakes, row.mistakes)
		assert.equal(errorUnits(verdicts), row.mistakes)
		assert.equal(allPartsCorrect(verdicts), row.mistakes === 0 && row.kinds.length > 0)
		verdicts.parts.forEach((part, index) => {
			assert.equal(part.position, index + 1)
			if (part.kind === 'missing') assert.equal(part.given, null)
			else assert.equal(typeof part.given, 'string')
			if (part.kind === 'extra') assert.equal(part.expected, null)
			else assert.equal(typeof part.expected, 'string')
		})
		if (row.parts) assert.deepEqual(verdicts.parts, row.parts)
	})
})

describe('разбор single_choice и multi_choice', () => {
	test.each(CHOICE_REVIEW_CASES)('$template: $name', (row) => {
		const verdicts = computeVerdicts({ template: row.template, key: row.key, answer: row.answer, content: row.content })
		assert.equal(verdicts.template, row.template)
		if (verdicts.template !== 'single_choice' && verdicts.template !== 'multi_choice') return
		assert.ok(verdicts.parts.length > 0)
		assert.deepEqual(
			verdicts.parts.map((part) => part.kind),
			row.kinds
		)
		const expectedIds = row.optionIds ?? row.content?.options?.map((option) => option.id)
		if (expectedIds) {
			assert.deepEqual(
				verdicts.parts.map((part) => part.optionId),
				expectedIds
			)
		}
		assert.equal(verdicts.mistakes, row.mistakes)
	})

	test('порядок id в ответе multi_choice не влияет на части и ошибки', () => {
		const content = {
			options: [
				{ id: 'a', text: 'А' },
				{ id: 'b', text: 'Б' },
				{ id: 'c', text: 'В' },
			],
		}
		const first = computeVerdicts({ template: 'multi_choice', key: ['a', 'b'], answer: ['c', 'a'], content })
		const second = computeVerdicts({ template: 'multi_choice', key: ['a', 'b'], answer: ['a', 'c'], content })
		assert.deepEqual(first, second)
	})
})

describe('разбор matching', () => {
	test.each(MATCHING_REVIEW_CASES)('$name', (row) => {
		const verdicts = computeVerdicts({ template: 'matching', key: row.key, answer: row.answer, content: row.content })
		assert.equal(verdicts.template, 'matching')
		if (verdicts.template !== 'matching') return
		assert.ok(verdicts.parts.length > 0)
		assert.deepEqual(
			verdicts.parts.map((part) => part.kind),
			row.kinds
		)
		const expectedIds = row.leftIds ?? row.content?.matchingPairs?.left.map((left) => left.id)
		if (expectedIds) {
			assert.deepEqual(
				verdicts.parts.map((part) => part.leftId),
				expectedIds
			)
		}
		assert.equal(verdicts.mistakes, row.mistakes)
		assert.equal(errorUnits(verdicts), row.mistakes)
		if (row.parts) assert.deepEqual(verdicts.parts, row.parts)
	})
})

describe('разбор short_text', () => {
	test.each(SHORT_TEXT_REVIEW_CASES)('$metric: $name', (row) => {
		const verdicts = computeVerdicts({ template: 'short_text', metric: row.metric, key: row.key, answer: row.answer })
		assert.equal(verdicts.template, 'short_text')
		assert.deepEqual(
			verdicts.parts.map((part) => part.kind),
			row.kinds
		)
		assert.equal(verdicts.mistakes, row.mistakes)
		assert.equal(errorUnits(verdicts), row.mistakes)
	})
})

describe('метрика чужого шаблона', () => {
	test('short_text + hamming_digits, ключ 12, ответ 21: части и ошибки от одного адаптера метрики по умолчанию', () => {
		const verdicts = computeVerdicts({ template: 'short_text', metric: 'hamming_digits', key: '12', answer: '21' })
		assert.equal(verdicts.template, 'short_text')
		assert.deepEqual(
			verdicts.parts.map((part) => part.kind),
			['wrong']
		)
		assert.equal(verdicts.mistakes, 1)
		assert.equal(errorUnits(verdicts), verdicts.mistakes)
		assert.equal(allPartsCorrect(verdicts), false)
		assert.deepEqual(verdicts, computeVerdicts({ template: 'short_text', key: '12', answer: '21' }))
	})
})

describe('неизвестный шаблон', () => {
	test('computeVerdicts бросает понятную ошибку', () => {
		assert.throws(() => computeVerdicts({ template: 'essay' as QuestionUiTemplate, key: 'a', answer: 'a' }), {
			message: 'Неизвестный шаблон вопроса: essay',
		})
	})
})

test.each(IS_ANSWERED_CASES)('isAnswered: $name', (row) => {
	assert.equal(isAnswered({ template: row.template, answer: row.answer, content: row.content }), row.expected)
})

test.each(READ_KEY_CASES)('readKey: $name', (row) => {
	assert.deepEqual(readKey({ template: row.template, metric: row.metric, raw: row.raw }), row.expected)
})

test.each(NORMALIZE_KEY_VALUE_CASES)('normalizeKeyValue: $name', (row) => {
	assert.deepEqual(normalizeKeyValue(row.raw), row.expected)
})

test.each(ANSWER_ID_LIST_CASES)('answerIdList: $name', (row) => {
	assert.deepEqual(answerIdList(row.value), row.expected)
})

test('у каждого шаблона есть строки isAnswered с true и false', () => {
	for (const template of QUESTION_UI_TEMPLATES) {
		const rows = IS_ANSWERED_CASES.filter((row) => row.template === template)
		assert.ok(
			rows.some((row) => row.expected),
			template
		)
		assert.ok(
			rows.some((row) => !row.expected),
			template
		)
	}
})

test('разбор по ключу есть у каждого шаблона с автопроверкой и недоступен для open', () => {
	for (const template of AUTO_SCORED_TEMPLATES) {
		assert.doesNotThrow(() => computeVerdicts({ template, key: null, answer: null }), template)
	}
	assert.throws(() => computeVerdicts({ template: 'open', metric: 'manual', key: null, answer: 'текст' }))
})

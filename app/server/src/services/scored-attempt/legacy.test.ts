import {
	BUILTIN_QUESTION_TYPES,
	type LegacyAttemptResultItem,
	type QuestionContent,
	type RuntimeQuestionTypeConfig,
} from '@bio-exam/exam-core'

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { describe, test } from 'vitest'

import { legacyFact, type LegacyQuestion } from './legacy-fact.js'

function typeConfig(key: string): RuntimeQuestionTypeConfig {
	const found = BUILTIN_QUESTION_TYPES.find((item) => item.key === key)
	assert.ok(found, `no builtin type ${key}`)
	return { key: found.key, uiTemplate: found.uiTemplate, scoringRule: found.scoringRule }
}

const OPTIONS: QuestionContent = {
	options: [
		{ id: 'a', text: 'Митоз' },
		{ id: 'b', text: 'Мейоз' },
		{ id: 'c', text: 'Амитоз' },
	],
}

const RADIO: LegacyQuestion = { typeConfig: typeConfig('radio'), content: OPTIONS, points: 1 }
const SEQUENCE: LegacyQuestion = { typeConfig: typeConfig('sequence'), content: { options: [] }, points: 2 }

function item(overrides: Partial<LegacyAttemptResultItem>): LegacyAttemptResultItem {
	return {
		questionId: crypto.randomUUID(),
		isCorrect: false,
		points: 1,
		earnedPoints: 0,
		userAnswer: null,
		correctAnswer: null,
		explanationText: null,
		...overrides,
	}
}

describe('legacyFact: ключ и вердикты строки версии 1', () => {
	test('сохранённый correctAnswer у неверного ответа radio: ключ из строки, пересчёт совпал, вердикты есть', () => {
		const row = item({ userAnswer: 'a', correctAnswer: 'b', isCorrect: false, points: 1, earnedPoints: 0 })
		const fact = legacyFact({ item: row, question: RADIO, historyKey: 'c' })
		assert.equal(fact.key, 'b')
		assert.equal(fact.verdicts?.template, 'single_choice')
		assert.equal(fact.mistakes, 1)
		assert.equal(fact.isCorrect, false)
		assert.equal(fact.earnedPoints, 0)
		assert.equal(fact.points, 1)
		assert.equal(fact.questionId, row.questionId)
		assert.equal(fact.userAnswer, 'a')
	})

	test('correctAnswer null: ключ из истории, верный ответ sequence даёт вердикты и 0 ошибок', () => {
		const row = item({ userAnswer: '2314', isCorrect: true, points: 2, earnedPoints: 2 })
		const fact = legacyFact({ item: row, question: SEQUENCE, historyKey: '2314' })
		assert.equal(fact.key, '2314')
		assert.equal(fact.verdicts?.template, 'sequence_digits')
		assert.equal(fact.mistakes, 0)
		assert.equal(fact.isCorrect, true)
		assert.equal(fact.earnedPoints, 2)
	})

	test('correctAnswer null и ключа в истории нет: ключ неизвестен, баллы сохранённые', () => {
		const row = item({ userAnswer: 'b', isCorrect: true, points: 1, earnedPoints: 1, explanationText: 'Пояснение' })
		const fact = legacyFact({ item: row, question: RADIO, historyKey: null })
		assert.equal(fact.key, null)
		assert.equal(fact.verdicts, null)
		assert.equal(fact.mistakes, null)
		assert.equal(fact.isCorrect, true)
		assert.equal(fact.points, 1)
		assert.equal(fact.earnedPoints, 1)
		assert.equal(fact.explanationText, 'Пояснение')
	})

	test('R2: sequence со старыми 0 баллами, пересчёт даёт 1 балл — ключ показан, вердиктов и ошибок нет', () => {
		const row = item({ userAnswer: '2315', isCorrect: false, points: 2, earnedPoints: 0 })
		const fact = legacyFact({ item: row, question: SEQUENCE, historyKey: '2314' })
		assert.equal(fact.key, '2314')
		assert.equal(fact.verdicts, null)
		assert.equal(fact.mistakes, null)
		assert.equal(fact.earnedPoints, 0)
		assert.equal(fact.isCorrect, false)
		assert.equal(fact.points, 2)
	})

	test('пересчёт с ключом из истории дал другой isCorrect — вердиктов нет', () => {
		const row = item({ userAnswer: 'a', isCorrect: true, points: 1, earnedPoints: 1 })
		const fact = legacyFact({ item: row, question: RADIO, historyKey: 'b' })
		assert.equal(fact.key, 'b')
		assert.equal(fact.verdicts, null)
		assert.equal(fact.mistakes, null)
		assert.equal(fact.isCorrect, true)
	})

	test('вопрос удалён, сохранённый correctAnswer 7: ключ "7", вердиктов нет', () => {
		const row = item({ userAnswer: '5', correctAnswer: 7, isCorrect: false, points: 1, earnedPoints: 0 })
		const fact = legacyFact({ item: row, question: null, historyKey: null })
		assert.equal(fact.key, '7')
		assert.equal(fact.verdicts, null)
		assert.equal(fact.mistakes, null)
		assert.equal(fact.earnedPoints, 0)
	})

	test('userAnswer отсутствует в строке: ответ null', () => {
		const row = item({ isCorrect: false, points: 1, earnedPoints: 0 })
		delete (row as { userAnswer?: unknown }).userAnswer
		delete (row as { explanationText?: unknown }).explanationText
		const fact = legacyFact({ item: row, question: RADIO, historyKey: 'b' })
		assert.equal(fact.userAnswer, null)
		assert.equal(fact.explanationText, null)
		assert.equal(fact.key, 'b')
	})
})

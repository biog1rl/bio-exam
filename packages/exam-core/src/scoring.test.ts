import assert from 'node:assert/strict'
import { describe, test } from 'vitest'

import {
	MATCHING_SCORING_CASES,
	MULTI_CHOICE_SCORING_CASES,
	SCORING_TYPES_MAP,
	SEQUENCE_SCORING_CASES,
	SHORT_TEXT_SCORING_CASES,
	SINGLE_CHOICE_SCORING_CASES,
	type ScoringCase,
} from './cases/scoring.cases'
import type { MistakeMetric, QuestionUiTemplate } from './registry'
import { MISTAKES_UNSCORABLE, countMistakes, scoreQuestionByType } from './scoring'

const TABLES: Array<{ template: QuestionUiTemplate; cases: ScoringCase[] }> = [
	{ template: 'single_choice', cases: SINGLE_CHOICE_SCORING_CASES },
	{ template: 'multi_choice', cases: MULTI_CHOICE_SCORING_CASES },
	{ template: 'matching', cases: MATCHING_SCORING_CASES },
	{ template: 'short_text', cases: SHORT_TEXT_SCORING_CASES },
	{ template: 'sequence_digits', cases: SEQUENCE_SCORING_CASES },
]

function scoreCase(row: ScoringCase) {
	return scoreQuestionByType({
		questionType: row.typeKey,
		userAnswer: row.answer,
		correctAnswer: row.key,
		fallbackMaxPoints: 0,
		questionTypesMap: SCORING_TYPES_MAP,
	})
}

for (const table of TABLES) {
	describe(`оценка ${table.template}`, () => {
		test.each(table.cases)('$name', (row) => {
			assert.deepEqual(scoreCase(row), row.expected)
		})

		test('все строки таблицы относятся к типам своего шаблона', () => {
			for (const row of table.cases) {
				assert.equal(SCORING_TYPES_MAP[row.typeKey]?.uiTemplate, table.template, row.name)
			}
		})
	})
}

test('по всем строкам: число ошибок целое неотрицательное или MISTAKES_UNSCORABLE, баллы в [0, maxPoints]', () => {
	let checked = 0
	for (const table of TABLES) {
		for (const row of table.cases) {
			const result = scoreCase(row)
			assert.ok(
				result.mistakesCount === MISTAKES_UNSCORABLE ||
					(Number.isInteger(result.mistakesCount) && result.mistakesCount >= 0),
				`${row.name}: mistakesCount ${result.mistakesCount}`
			)
			assert.ok(result.earnedPoints >= 0 && result.earnedPoints <= result.maxPoints, `${row.name}: баллы`)
			assert.equal(result.isCorrect, result.mistakesCount === 0, `${row.name}: isCorrect`)
			checked += 1
		}
	}
	assert.ok(checked >= 80, `строк ${checked}`)
})

test.each([
	{ fallbackMaxPoints: 3, maxPoints: 3 },
	{ fallbackMaxPoints: 0, maxPoints: 0 },
	{ fallbackMaxPoints: -2, maxPoints: 0 },
	{ fallbackMaxPoints: Number.NaN, maxPoints: 0 },
])(
	'тип отсутствует в карте: MISTAKES_UNSCORABLE, maxPoints из fallbackMaxPoints $fallbackMaxPoints',
	({ fallbackMaxPoints, maxPoints }) => {
		const result = scoreQuestionByType({
			questionType: 'missing',
			userAnswer: '1',
			correctAnswer: '1',
			fallbackMaxPoints,
			questionTypesMap: SCORING_TYPES_MAP,
		})
		assert.deepEqual(result, { maxPoints, earnedPoints: 0, isCorrect: false, mistakesCount: MISTAKES_UNSCORABLE })
	}
)

test.each([
	{ fallbackMaxPoints: 0, maxPoints: 2 },
	{ fallbackMaxPoints: 3, maxPoints: 3 },
	{ fallbackMaxPoints: Number.NaN, maxPoints: 2 },
])(
	'неразбираемое правило {}: correctPoints из fallbackMaxPoints $fallbackMaxPoints',
	({ fallbackMaxPoints, maxPoints }) => {
		const result = scoreQuestionByType({
			questionType: 'broken_rule',
			userAnswer: '1234',
			correctAnswer: '1234',
			fallbackMaxPoints,
			questionTypesMap: SCORING_TYPES_MAP,
		})
		assert.deepEqual(result, { maxPoints, earnedPoints: maxPoints, isCorrect: true, mistakesCount: 0 })
	}
)

const metricRows: Array<{ metric: MistakeMetric; userAnswer: unknown; correctAnswer: unknown; expected: number }> = [
	{ metric: 'boolean_correct', userAnswer: 3, correctAnswer: '3', expected: 0 },
	{ metric: 'set_distance', userAnswer: ['a', 'c'], correctAnswer: ['a', 'b'], expected: 1 },
	{ metric: 'pair_mismatch_count', userAnswer: { l1: 'r1' }, correctAnswer: { l1: 'r2' }, expected: 1 },
	{ metric: 'compact_text_equal', userAnswer: ' Ми Тоз ', correctAnswer: 'митоз', expected: 0 },
	{ metric: 'compact_text_in_set', userAnswer: 'мейоз', correctAnswer: ['митоз', 'мейоз'], expected: 0 },
	{ metric: 'hamming_digits', userAnswer: '2134', correctAnswer: '1234', expected: 1 },
]

test.each(metricRows)('countMistakes: $metric диспетчеризуется в адаптер своего шаблона', (row) => {
	assert.equal(countMistakes(row.metric, row.userAnswer, row.correctAnswer), row.expected)
})

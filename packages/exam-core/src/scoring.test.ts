import assert from 'node:assert/strict'
import { test } from 'vitest'

import { BUILTIN_QUESTION_TYPES, type MistakeMetric } from './registry'
import { MISTAKES_UNSCORABLE, countMistakes, scoreQuestionByType, type RuntimeQuestionTypeConfig } from './scoring'

const builtinTypesMap: Record<string, RuntimeQuestionTypeConfig> = Object.fromEntries(
	BUILTIN_QUESTION_TYPES.map((item) => [
		item.key,
		{ key: item.key, uiTemplate: item.uiTemplate, scoringRule: item.scoringRule },
	])
)

const sequenceRows = [
	{
		name: 'D2: ключ 1243, ответ 1234 — соседняя перестановка, одна ошибка',
		correctAnswer: '1243',
		userAnswer: '1234',
		expected: { maxPoints: 2, earnedPoints: 1, isCorrect: false, mistakesCount: 1 },
	},
	{
		name: 'D2: точный ответ 1243',
		correctAnswer: '1243',
		userAnswer: '1243',
		expected: { maxPoints: 2, earnedPoints: 2, isCorrect: true, mistakesCount: 0 },
	},
]

for (const row of sequenceRows) {
	test(`sequence: ${row.name}`, () => {
		const result = scoreQuestionByType({
			questionType: 'sequence',
			userAnswer: row.userAnswer,
			correctAnswer: row.correctAnswer,
			fallbackMaxPoints: 0,
			questionTypesMap: builtinTypesMap,
		})
		assert.deepEqual(result, row.expected)
	})
}

test('scoreQuestionByType: неизвестный тип вопроса оценивается как неразбираемый', () => {
	const result = scoreQuestionByType({
		questionType: 'missing',
		userAnswer: '1',
		correctAnswer: '1',
		fallbackMaxPoints: 3,
		questionTypesMap: builtinTypesMap,
	})
	assert.deepEqual(result, { maxPoints: 3, earnedPoints: 0, isCorrect: false, mistakesCount: MISTAKES_UNSCORABLE })
})

const metricRows: Array<{ metric: MistakeMetric; userAnswer: unknown; correctAnswer: unknown; expected: number }> = [
	{ metric: 'boolean_correct', userAnswer: 3, correctAnswer: '3', expected: 0 },
	{ metric: 'set_distance', userAnswer: ['a', 'c'], correctAnswer: ['a', 'b'], expected: 1 },
	{ metric: 'pair_mismatch_count', userAnswer: { l1: 'r1' }, correctAnswer: { l1: 'r2' }, expected: 1 },
	{ metric: 'compact_text_equal', userAnswer: ' Ми Тоз ', correctAnswer: 'митоз', expected: 0 },
	{ metric: 'compact_text_in_set', userAnswer: 'мейоз', correctAnswer: ['митоз', 'мейоз'], expected: 0 },
	{ metric: 'hamming_digits', userAnswer: '2134', correctAnswer: '1234', expected: 1 },
]

for (const row of metricRows) {
	test(`countMistakes: ${row.metric} диспетчеризуется в адаптер своего шаблона`, () => {
		assert.equal(countMistakes(row.metric, row.userAnswer, row.correctAnswer), row.expected)
	})
}

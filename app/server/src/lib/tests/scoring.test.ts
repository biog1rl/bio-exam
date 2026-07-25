import assert from 'node:assert/strict'

import { scoreQuestionByType } from './scoring.js'

// Карта типов вопросов, соответствующая встроенным типам из BUILTIN_QUESTION_TYPES
const builtinTypesMap = {
	radio: {
		key: 'radio',
		uiTemplate: 'single_choice' as const,
		scoringRule: {
			formula: 'exact_match' as const,
			mistakeMetric: 'boolean_correct' as const,
			correctPoints: 1,
		},
	},
	checkbox: {
		key: 'checkbox',
		uiTemplate: 'multi_choice' as const,
		scoringRule: {
			formula: 'one_mistake_partial' as const,
			mistakeMetric: 'set_distance' as const,
			correctPoints: 2,
			oneMistakePoints: 1,
		},
	},
	matching: {
		key: 'matching',
		uiTemplate: 'matching' as const,
		scoringRule: {
			formula: 'one_mistake_partial' as const,
			mistakeMetric: 'pair_mismatch_count' as const,
			correctPoints: 2,
			oneMistakePoints: 1,
		},
	},
	short_answer: {
		key: 'short_answer',
		uiTemplate: 'short_text' as const,
		scoringRule: {
			formula: 'exact_match' as const,
			mistakeMetric: 'compact_text_equal' as const,
			correctPoints: 1,
		},
	},
	sequence: {
		key: 'sequence',
		uiTemplate: 'sequence_digits' as const,
		scoringRule: {
			formula: 'one_mistake_partial' as const,
			mistakeMetric: 'hamming_digits' as const,
			correctPoints: 2,
			oneMistakePoints: 1,
		},
	},
}

// --- short_answer ---

const shortAnswerExact = scoreQuestionByType({
	questionType: 'short_answer',
	userAnswer: ' МИТОЗ ',
	correctAnswer: 'митоз',
	fallbackMaxPoints: 0,
	questionTypesMap: builtinTypesMap,
})
assert.equal(shortAnswerExact.earnedPoints, 1)
assert.equal(shortAnswerExact.isCorrect, true)

const shortAnswerWrong = scoreQuestionByType({
	questionType: 'short_answer',
	userAnswer: 'мейоз',
	correctAnswer: 'митоз',
	fallbackMaxPoints: 0,
	questionTypesMap: builtinTypesMap,
})
assert.equal(shortAnswerWrong.earnedPoints, 0)

// --- short_answer_variants ---

const shortAnswerVariantsTypesMap = {
	short_answer_variants: {
		key: 'short_answer_variants',
		uiTemplate: 'short_text' as const,
		scoringRule: {
			formula: 'exact_match' as const,
			mistakeMetric: 'compact_text_in_set' as const,
			correctPoints: 1,
		},
	},
}

const shortAnswerAlternative = scoreQuestionByType({
	questionType: 'short_answer_variants',
	userAnswer: 'МОДЕЛИРОВАНИЕ',
	correctAnswer: ['эксперимент', 'моделирование'],
	fallbackMaxPoints: 0,
	questionTypesMap: shortAnswerVariantsTypesMap,
})
assert.equal(shortAnswerAlternative.earnedPoints, 1)
assert.equal(shortAnswerAlternative.isCorrect, true)

const shortAnswerAlternativeWrong = scoreQuestionByType({
	questionType: 'short_answer_variants',
	userAnswer: 'наблюдение',
	correctAnswer: ['эксперимент', 'моделирование'],
	fallbackMaxPoints: 0,
	questionTypesMap: shortAnswerVariantsTypesMap,
})
assert.equal(shortAnswerAlternativeWrong.earnedPoints, 0)

// --- sequence ---

const sequenceExact = scoreQuestionByType({
	questionType: 'sequence',
	userAnswer: '2314',
	correctAnswer: '2314',
	fallbackMaxPoints: 0,
	questionTypesMap: builtinTypesMap,
})
assert.equal(sequenceExact.earnedPoints, 2)

const sequenceOneMistake = scoreQuestionByType({
	questionType: 'sequence',
	userAnswer: '2315',
	correctAnswer: '2314',
	fallbackMaxPoints: 0,
	questionTypesMap: builtinTypesMap,
})
assert.equal(sequenceOneMistake.earnedPoints, 1)

const sequenceManyMistakes = scoreQuestionByType({
	questionType: 'sequence',
	userAnswer: '2415',
	correctAnswer: '2314',
	fallbackMaxPoints: 0,
	questionTypesMap: builtinTypesMap,
})
assert.equal(sequenceManyMistakes.earnedPoints, 0)

const sequenceAdjacentSwap = scoreQuestionByType({
	questionType: 'sequence',
	userAnswer: '12354',
	correctAnswer: '12345',
	fallbackMaxPoints: 0,
	questionTypesMap: builtinTypesMap,
})
assert.equal(sequenceAdjacentSwap.earnedPoints, 1)
assert.equal(sequenceAdjacentSwap.isCorrect, false)

const sequenceNonAdjacentSwap = scoreQuestionByType({
	questionType: 'sequence',
	userAnswer: '14325',
	correctAnswer: '12345',
	fallbackMaxPoints: 0,
	questionTypesMap: builtinTypesMap,
})
assert.equal(sequenceNonAdjacentSwap.earnedPoints, 0)

const twoDigitSequenceOneCorrectFirst = scoreQuestionByType({
	questionType: 'sequence',
	userAnswer: '11',
	correctAnswer: '12',
	fallbackMaxPoints: 0,
	questionTypesMap: builtinTypesMap,
})
assert.equal(twoDigitSequenceOneCorrectFirst.earnedPoints, 1)

const twoDigitSequenceOneCorrectSecond = scoreQuestionByType({
	questionType: 'sequence',
	userAnswer: '22',
	correctAnswer: '12',
	fallbackMaxPoints: 0,
	questionTypesMap: builtinTypesMap,
})
assert.equal(twoDigitSequenceOneCorrectSecond.earnedPoints, 1)

const twoDigitSequenceSwapped = scoreQuestionByType({
	questionType: 'sequence',
	userAnswer: '21',
	correctAnswer: '12',
	fallbackMaxPoints: 0,
	questionTypesMap: builtinTypesMap,
})
assert.equal(twoDigitSequenceSwapped.earnedPoints, 0)

const threeDigitSequenceExact = scoreQuestionByType({
	questionType: 'sequence',
	userAnswer: '251',
	correctAnswer: '251',
	fallbackMaxPoints: 0,
	questionTypesMap: builtinTypesMap,
})
assert.equal(threeDigitSequenceExact.earnedPoints, 2)

const threeDigitSequenceWrongFirst = scoreQuestionByType({
	questionType: 'sequence',
	userAnswer: '351',
	correctAnswer: '251',
	fallbackMaxPoints: 0,
	questionTypesMap: builtinTypesMap,
})
assert.equal(threeDigitSequenceWrongFirst.earnedPoints, 1)

const threeDigitSequenceWrongLast = scoreQuestionByType({
	questionType: 'sequence',
	userAnswer: '259',
	correctAnswer: '251',
	fallbackMaxPoints: 0,
	questionTypesMap: builtinTypesMap,
})
assert.equal(threeDigitSequenceWrongLast.earnedPoints, 1)

const threeDigitSequenceSwapped = scoreQuestionByType({
	questionType: 'sequence',
	userAnswer: '521',
	correctAnswer: '251',
	fallbackMaxPoints: 0,
	questionTypesMap: builtinTypesMap,
})
assert.equal(threeDigitSequenceSwapped.earnedPoints, 0)

// --- matching ---

const matchingExact = scoreQuestionByType({
	questionType: 'matching',
	userAnswer: { a: '1', b: '2', c: '3' },
	correctAnswer: { a: '1', b: '2', c: '3' },
	fallbackMaxPoints: 0,
	questionTypesMap: builtinTypesMap,
})
assert.equal(matchingExact.earnedPoints, 2)

const matchingOneMistake = scoreQuestionByType({
	questionType: 'matching',
	userAnswer: { a: '1', b: '3', c: '3' },
	correctAnswer: { a: '1', b: '2', c: '3' },
	fallbackMaxPoints: 0,
	questionTypesMap: builtinTypesMap,
})
assert.equal(matchingOneMistake.earnedPoints, 1)

const matchingManyMistakes = scoreQuestionByType({
	questionType: 'matching',
	userAnswer: { a: '2', b: '3', c: '1' },
	correctAnswer: { a: '1', b: '2', c: '3' },
	fallbackMaxPoints: 0,
	questionTypesMap: builtinTypesMap,
})
assert.equal(matchingManyMistakes.earnedPoints, 0)

// --- checkbox ---

const checkboxExact = scoreQuestionByType({
	questionType: 'checkbox',
	userAnswer: ['1', '2', '3'],
	correctAnswer: ['1', '2', '3'],
	fallbackMaxPoints: 0,
	questionTypesMap: builtinTypesMap,
})
assert.equal(checkboxExact.earnedPoints, 2)

const checkboxOneMistake = scoreQuestionByType({
	questionType: 'checkbox',
	userAnswer: ['1', '2', '4'],
	correctAnswer: ['1', '2', '3'],
	fallbackMaxPoints: 0,
	questionTypesMap: builtinTypesMap,
})
assert.equal(checkboxOneMistake.earnedPoints, 1)

const checkboxManyMistakes = scoreQuestionByType({
	questionType: 'checkbox',
	userAnswer: ['1', '4', '5'],
	correctAnswer: ['1', '2', '3'],
	fallbackMaxPoints: 0,
	questionTypesMap: builtinTypesMap,
})
assert.equal(checkboxManyMistakes.earnedPoints, 0)

// --- custom type (tiers formula) ---

const customTypeRules = {
	custom_sequence: {
		key: 'custom_sequence',
		uiTemplate: 'sequence_digits' as const,
		scoringRule: {
			formula: 'tiers' as const,
			mistakeMetric: 'hamming_digits' as const,
			correctPoints: 3,
			tiers: [
				{ maxMistakes: 1, points: 2 },
				{ maxMistakes: 2, points: 1 },
			],
		},
	},
}

const customExact = scoreQuestionByType({
	questionType: 'custom_sequence',
	userAnswer: '1234',
	correctAnswer: '1234',
	fallbackMaxPoints: 0,
	questionTypesMap: customTypeRules,
})
assert.equal(customExact.earnedPoints, 3)

const customOneMistake = scoreQuestionByType({
	questionType: 'custom_sequence',
	userAnswer: '1235',
	correctAnswer: '1234',
	fallbackMaxPoints: 0,
	questionTypesMap: customTypeRules,
})
assert.equal(customOneMistake.earnedPoints, 2)

// --- VALID-01: числовой correctAnswer для sequence (JSONB numeric coercion) ---
// Тест: correctAnswer хранится в JSONB как число — должен засчитываться как верный

const sequenceNumericCorrectAnswer = scoreQuestionByType({
	questionType: 'sequence',
	userAnswer: '1234',
	correctAnswer: 1234, // число, как из JSONB
	fallbackMaxPoints: 0,
	questionTypesMap: builtinTypesMap,
})
assert.ok(sequenceNumericCorrectAnswer.earnedPoints > 0, 'sequence с числовым correctAnswer должен давать баллы')
assert.equal(sequenceNumericCorrectAnswer.isCorrect, true)

const sequenceNumericCorrectAnswerWrong = scoreQuestionByType({
	questionType: 'sequence',
	userAnswer: '9999',
	correctAnswer: 1234, // число, как из JSONB
	fallbackMaxPoints: 0,
	questionTypesMap: builtinTypesMap,
})
assert.equal(sequenceNumericCorrectAnswerWrong.earnedPoints, 0, 'неверный ответ должен давать 0 баллов')

// --- checkbox с числовыми ID в correctAnswer ---

const checkboxNumericCorrectArray = scoreQuestionByType({
	questionType: 'checkbox',
	userAnswer: ['1', '2', '3'],
	correctAnswer: [1, 2, 3],
	fallbackMaxPoints: 0,
	questionTypesMap: builtinTypesMap,
})
assert.equal(checkboxNumericCorrectArray.earnedPoints, 2)

// --- radio ---

const radioExact = scoreQuestionByType({
	questionType: 'radio',
	userAnswer: 'option_a',
	correctAnswer: 'option_a',
	fallbackMaxPoints: 0,
	questionTypesMap: builtinTypesMap,
})
assert.equal(radioExact.earnedPoints, 1)
assert.equal(radioExact.isCorrect, true)

const radioWrong = scoreQuestionByType({
	questionType: 'radio',
	userAnswer: 'option_b',
	correctAnswer: 'option_a',
	fallbackMaxPoints: 0,
	questionTypesMap: builtinTypesMap,
})
assert.equal(radioWrong.earnedPoints, 0)
assert.equal(radioWrong.isCorrect, false)

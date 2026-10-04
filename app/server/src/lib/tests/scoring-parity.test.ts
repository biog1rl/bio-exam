import { scoreQuestionByType as scoreQuestionByTypeCore } from '@bio-exam/exam-core'

import assert from 'node:assert/strict'
import { isDeepStrictEqual } from 'node:util'
import { test } from 'vitest'

import { BUILTIN_QUESTION_TYPES } from './question-types.js'
import { scoreQuestionByType, type RuntimeQuestionTypeConfig } from './scoring.js'

type TypeConfigCase = { name: string; questionType: RuntimeQuestionTypeConfig }
type ParityInput = { userAnswer: unknown; correctAnswer: unknown }

const builtinSequence = BUILTIN_QUESTION_TYPES.find((item) => item.key === 'sequence')
if (!builtinSequence) throw new Error('нет встроенного типа sequence')

const TYPE_CONFIGS: TypeConfigCase[] = [
	{
		name: 'builtin',
		questionType: {
			key: builtinSequence.key,
			uiTemplate: builtinSequence.uiTemplate,
			scoringRule: builtinSequence.scoringRule,
		},
	},
	{
		name: 'tiers_unsorted_fractional',
		questionType: {
			key: 'tiers_unsorted_fractional',
			uiTemplate: 'sequence_digits',
			scoringRule: {
				formula: 'tiers',
				mistakeMetric: 'hamming_digits',
				correctPoints: 2,
				tiers: [
					{ maxMistakes: 3, points: 0.5 },
					{ maxMistakes: 1, points: 1.5 },
				],
			},
		},
	},
	{
		name: 'one_mistake_clamped',
		questionType: {
			key: 'one_mistake_clamped',
			uiTemplate: 'sequence_digits',
			scoringRule: {
				formula: 'one_mistake_partial',
				mistakeMetric: 'hamming_digits',
				correctPoints: 2,
				oneMistakePoints: 3,
			},
		},
	},
	{
		name: 'one_mistake_fractional',
		questionType: {
			key: 'one_mistake_fractional',
			uiTemplate: 'sequence_digits',
			scoringRule: {
				formula: 'one_mistake_partial',
				mistakeMetric: 'hamming_digits',
				correctPoints: 2,
				oneMistakePoints: 0.5,
			},
		},
	},
	{
		name: 'rule_empty',
		questionType: { key: 'rule_empty', uiTemplate: 'sequence_digits', scoringRule: {} },
	},
	{
		name: 'foreign_hamming',
		questionType: {
			key: 'foreign_hamming',
			uiTemplate: 'single_choice',
			scoringRule: {
				formula: 'one_mistake_partial',
				mistakeMetric: 'hamming_digits',
				correctPoints: 2,
				oneMistakePoints: 1,
			},
		},
	},
	{
		name: 'foreign_set_distance',
		questionType: {
			key: 'foreign_set_distance',
			uiTemplate: 'single_choice',
			scoringRule: {
				formula: 'one_mistake_partial',
				mistakeMetric: 'set_distance',
				correctPoints: 2,
				oneMistakePoints: 1,
			},
		},
	},
]

const FALLBACK_MAX_POINTS = [0, 3, Number.NaN]

function permutations(items: string[]): string[][] {
	if (items.length <= 1) return [items]
	const result: string[][] = []
	items.forEach((item, index) => {
		const rest = [...items.slice(0, index), ...items.slice(index + 1)]
		for (const tail of permutations(rest)) result.push([item, ...tail])
	})
	return result
}

function buildSequenceInputs(): ParityInput[] {
	const inputs: ParityInput[] = []
	for (let n = 2; n <= 5; n++) {
		const digits = Array.from({ length: n }, (_, index) => String(index + 1))
		const sequences = permutations(digits).map((item) => item.join(''))
		for (const key of sequences) {
			for (const answer of sequences) inputs.push({ userAnswer: answer, correctAnswer: key })
			inputs.push({ userAnswer: key.slice(0, -1), correctAnswer: key })
			inputs.push({ userAnswer: key.slice(1), correctAnswer: key })
			inputs.push({ userAnswer: `${key}${n + 1}`, correctAnswer: key })
			inputs.push({ userAnswer: `${n + 1}${key}`, correctAnswer: key })
			inputs.push({ userAnswer: Number(key), correctAnswer: key })
			inputs.push({ userAnswer: key, correctAnswer: Number(key) })
			inputs.push({ userAnswer: Number(key), correctAnswer: Number(key) })
			inputs.push({ userAnswer: Number(sequences[0]), correctAnswer: Number(key) })
			for (const broken of [null, '', '  ', '12a']) {
				inputs.push({ userAnswer: broken, correctAnswer: key })
				inputs.push({ userAnswer: key, correctAnswer: broken })
			}
		}
	}
	return inputs
}

test(
	'паритет: scoreQuestionByType пакета совпадает с серверной на последовательностях и конфигах типа',
	{ timeout: 120_000 },
	() => {
		const inputs = buildSequenceInputs()
		let combinations = 0
		for (const config of TYPE_CONFIGS) {
			const questionTypesMap = { [config.questionType.key]: config.questionType }
			for (const fallbackMaxPoints of FALLBACK_MAX_POINTS) {
				for (const input of inputs) {
					const params = {
						questionType: config.questionType.key,
						userAnswer: input.userAnswer,
						correctAnswer: input.correctAnswer,
						fallbackMaxPoints,
						questionTypesMap,
					}
					const expected = scoreQuestionByType(params)
					const actual = scoreQuestionByTypeCore(params)
					if (!isDeepStrictEqual(actual, expected)) {
						assert.deepEqual(
							actual,
							expected,
							`${config.name}, fallbackMaxPoints ${fallbackMaxPoints}, ответ ${JSON.stringify(input.userAnswer)}, ключ ${JSON.stringify(input.correctAnswer)}`
						)
					}
					combinations += 1
				}
			}
		}
		assert.ok(inputs.length > 15000, `входов ${inputs.length}`)
		assert.equal(TYPE_CONFIGS.length, 7)
		assert.ok(combinations > 315000, `комбинаций ${combinations}`)
		console.log(`паритет: входов ${inputs.length}, конфигов ${TYPE_CONFIGS.length}, комбинаций ${combinations}`)
	}
)

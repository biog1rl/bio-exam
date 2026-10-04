import { scoreQuestionByType as scoreQuestionByTypeCore } from '@bio-exam/exam-core'

import assert from 'node:assert/strict'
import { isDeepStrictEqual } from 'node:util'
import { test } from 'vitest'

import {
	BUILTIN_QUESTION_TYPES,
	QUESTION_UI_TEMPLATES,
	type MistakeMetric,
	type QuestionUiTemplate,
} from './question-types.js'
import { scoreQuestionByType, type RuntimeQuestionTypeConfig } from './scoring.js'

type TypeConfigCase = { name: string; questionType: RuntimeQuestionTypeConfig }
type ParityInput = {
	template: QuestionUiTemplate
	metric: MistakeMetric
	userAnswer: unknown
	correctAnswer: unknown
}

function typeConfigsFor(template: QuestionUiTemplate, metric: MistakeMetric): TypeConfigCase[] {
	const builtin = BUILTIN_QUESTION_TYPES.find(
		(item) => item.uiTemplate === template && item.scoringRule.mistakeMetric === metric
	)
	if (!builtin) throw new Error(`нет встроенного типа для ${template} и ${metric}`)
	return [
		{
			name: 'builtin',
			questionType: { key: builtin.key, uiTemplate: builtin.uiTemplate, scoringRule: builtin.scoringRule },
		},
		{
			name: 'tiers_unsorted_fractional',
			questionType: {
				key: 'tiers_unsorted_fractional',
				uiTemplate: template,
				scoringRule: {
					formula: 'tiers',
					mistakeMetric: metric,
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
				uiTemplate: template,
				scoringRule: { formula: 'one_mistake_partial', mistakeMetric: metric, correctPoints: 2, oneMistakePoints: 3 },
			},
		},
		{
			name: 'one_mistake_fractional',
			questionType: {
				key: 'one_mistake_fractional',
				uiTemplate: template,
				scoringRule: {
					formula: 'one_mistake_partial',
					mistakeMetric: metric,
					correctPoints: 2,
					oneMistakePoints: 0.5,
				},
			},
		},
		{
			name: 'rule_empty',
			questionType: { key: 'rule_empty', uiTemplate: template, scoringRule: {} },
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
}

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

function subsets(items: string[]): string[][] {
	return items.reduce<string[][]>((acc, item) => [...acc, ...acc.map((subset) => [...subset, item])], [[]])
}

function buildSequenceInputs(): ParityInput[] {
	const inputs: ParityInput[] = []
	const push = (userAnswer: unknown, correctAnswer: unknown) =>
		inputs.push({ template: 'sequence_digits', metric: 'hamming_digits', userAnswer, correctAnswer })
	for (let n = 2; n <= 5; n++) {
		const digits = Array.from({ length: n }, (_, index) => String(index + 1))
		const sequences = permutations(digits).map((item) => item.join(''))
		for (const key of sequences) {
			for (const answer of sequences) push(answer, key)
			push(key.slice(0, -1), key)
			push(key.slice(1), key)
			push(`${key}${n + 1}`, key)
			push(`${n + 1}${key}`, key)
			push(Number(key), key)
			push(key, Number(key))
			push(Number(key), Number(key))
			push(Number(sequences[0]), Number(key))
			for (const broken of [null, '', '  ', '12a']) {
				push(broken, key)
				push(key, broken)
			}
		}
	}
	return inputs
}

function buildSingleChoiceInputs(): ParityInput[] {
	const inputs: ParityInput[] = []
	const keys: unknown[] = ['a', 'b', 1, null]
	const answers: unknown[] = ['a', 'b', 'c', 1, '1', null, ['a']]
	for (const correctAnswer of keys) {
		for (const userAnswer of answers) {
			inputs.push({ template: 'single_choice', metric: 'boolean_correct', userAnswer, correctAnswer })
		}
	}
	return inputs
}

function buildMultiChoiceInputs(): ParityInput[] {
	const inputs: ParityInput[] = []
	const push = (userAnswer: unknown, correctAnswer: unknown) =>
		inputs.push({ template: 'multi_choice', metric: 'set_distance', userAnswer, correctAnswer })
	const all = subsets(['a', 'b', 'c', 'd'])
	for (const key of all.filter((subset) => subset.length > 0)) {
		for (const answer of all) push(answer, key)
		for (const broken of [null, 'a', [1, 2]]) push(broken, key)
		push([...key].reverse(), key)
		push([...key, ...key], key)
	}
	push(['1', '2'], [1, 2])
	push([1, 2], [1, 2])
	push([1, '3'], ['1', '2'])
	for (const brokenKey of [null, 'a', [], {}, [null]]) push(['a'], brokenKey)
	return inputs
}

function buildMatchingInputs(): ParityInput[] {
	const inputs: ParityInput[] = []
	const push = (userAnswer: unknown, correctAnswer: unknown) =>
		inputs.push({ template: 'matching', metric: 'pair_mismatch_count', userAnswer, correctAnswer })
	const lefts = ['l1', 'l2', 'l3']
	const rights = ['r1', 'r2', 'r3']
	const bijections = permutations(rights).map((order) =>
		Object.fromEntries(lefts.map((left, index) => [left, order[index]]))
	)
	const mappings: Record<string, string>[] = []
	for (const first of rights) {
		for (const second of rights) {
			for (const third of rights) mappings.push({ l1: first, l2: second, l3: third })
		}
	}
	for (const key of bijections) {
		for (const answer of mappings) push(answer, key)
		push({ l1: key.l1, l2: key.l2 }, key)
		push({}, key)
		push(null, key)
		push({ l1: 1, l2: 2, l3: 3 }, key)
		push({ ...key, l4: 'r1' }, key)
		push({ ...key, l2: null }, key)
		push(Object.values(key), key)
	}
	const numericKey = { l1: 1, l2: 2, l3: 3 }
	push({ l1: '1', l2: '2', l3: '3' }, numericKey)
	push({ l1: 1, l2: 2, l3: 3 }, numericKey)
	push({ l1: '1', l2: '3', l3: '2' }, numericKey)
	for (const brokenKey of [{}, null, ['r1'], { l1: null }]) push({ l1: 'r1' }, brokenKey)
	return inputs
}

function buildShortTextInputs(): ParityInput[] {
	const inputs: ParityInput[] = []
	const keys: unknown[] = [
		'Митоз',
		3142,
		'3142',
		'1.50',
		'1.5',
		1.5,
		['эксперимент', 'моделирование'],
		['митоз', null],
		[3142],
		[],
		'',
		null,
	]
	const answers: unknown[] = [
		' МИ ТОЗ ',
		'митоз',
		'мейоз',
		'3142',
		3142,
		'1.5',
		'1.50',
		1.5,
		'Эксперимент',
		' моделирование ',
		'наблюдение',
		'',
		'   ',
		null,
		['митоз'],
		{ a: 'митоз' },
	]
	for (const metric of ['compact_text_equal', 'compact_text_in_set'] as const) {
		for (const correctAnswer of keys) {
			for (const userAnswer of answers) inputs.push({ template: 'short_text', metric, userAnswer, correctAnswer })
		}
	}
	return inputs
}

function describeValue(value: unknown): string {
	return typeof value === 'number' && !Number.isFinite(value) ? String(value) : JSON.stringify(value)
}

test(
	'паритет: scoreQuestionByType пакета совпадает с серверной на всех шаблонах и конфигах типа',
	{ timeout: 120_000 },
	() => {
		const inputs = [
			...buildSequenceInputs(),
			...buildSingleChoiceInputs(),
			...buildMultiChoiceInputs(),
			...buildMatchingInputs(),
			...buildShortTextInputs(),
		]
		const configsByPair = new Map<string, TypeConfigCase[]>()
		const inputsByTemplate = new Map<QuestionUiTemplate, number>()
		let combinations = 0
		for (const input of inputs) {
			inputsByTemplate.set(input.template, (inputsByTemplate.get(input.template) ?? 0) + 1)
			const pair = `${input.template}:${input.metric}`
			let configs = configsByPair.get(pair)
			if (!configs) {
				configs = typeConfigsFor(input.template, input.metric)
				configsByPair.set(pair, configs)
			}
			for (const config of configs) {
				const questionTypesMap = { [config.questionType.key]: config.questionType }
				for (const fallbackMaxPoints of FALLBACK_MAX_POINTS) {
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
							`${pair}, ${config.name}, fallbackMaxPoints ${fallbackMaxPoints}, ответ ${describeValue(input.userAnswer)}, ключ ${describeValue(input.correctAnswer)}`
						)
					}
					combinations += 1
				}
			}
		}
		assert.deepEqual([...inputsByTemplate.keys()].sort(), [...QUESTION_UI_TEMPLATES].sort())
		assert.deepEqual([...configsByPair.keys()].sort(), [
			'matching:pair_mismatch_count',
			'multi_choice:set_distance',
			'sequence_digits:hamming_digits',
			'short_text:compact_text_equal',
			'short_text:compact_text_in_set',
			'single_choice:boolean_correct',
		])
		for (const [pair, configs] of configsByPair) {
			assert.equal(configs.length, 7, pair)
			assert.deepEqual(
				configs.filter((config) => config.name.startsWith('foreign_')).map((config) => config.questionType.uiTemplate),
				['single_choice', 'single_choice'],
				pair
			)
		}
		assert.ok(inputs.length > 15400, `входов ${inputs.length}`)
		assert.ok(combinations > 320000, `комбинаций ${combinations}`)
		console.log(
			`паритет: входов ${inputs.length} (${[...inputsByTemplate].map(([template, count]) => `${template} ${count}`).join(', ')}), конфигов на вход 7, fallbackMaxPoints 3, комбинаций ${combinations}`
		)
	}
)

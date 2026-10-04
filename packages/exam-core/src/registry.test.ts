import assert from 'node:assert/strict'
import { test } from 'vitest'

import {
	ALLOWED_MISTAKE_METRICS_BY_TEMPLATE,
	MISTAKE_METRICS,
	QUESTION_UI_TEMPLATES,
	QuestionTypeDefinitionSchema,
	templateForMetric,
	type MistakeMetric,
	type QuestionUiTemplate,
} from './registry'

function definition(overrides: Record<string, unknown> = {}) {
	return {
		key: 'custom_choice',
		title: 'Выбор',
		uiTemplate: 'multi_choice',
		validationSchema: { minOptions: 2, maxOptions: 4, exactChoiceCount: 2 },
		scoringRule: { formula: 'exact_match', mistakeMetric: 'set_distance', correctPoints: 1 },
		...overrides,
	}
}

test('определение типа: корректное определение принимается', () => {
	assert.equal(QuestionTypeDefinitionSchema.safeParse(definition()).success, true)
})

const rejectedRows: Array<{ name: string; value: Record<string, unknown>; path: string }> = [
	{
		name: 'minOptions больше maxOptions',
		value: definition({ validationSchema: { minOptions: 5, maxOptions: 3 } }),
		path: 'validationSchema.minOptions',
	},
	{
		name: 'exactChoiceCount меньше minOptions',
		value: definition({ validationSchema: { minOptions: 3, maxOptions: 5, exactChoiceCount: 2 } }),
		path: 'validationSchema.exactChoiceCount',
	},
	{
		name: 'exactChoiceCount больше maxOptions',
		value: definition({ validationSchema: { minOptions: 1, maxOptions: 3, exactChoiceCount: 4 } }),
		path: 'validationSchema.exactChoiceCount',
	},
	{
		name: 'single_choice с exactChoiceCount не равным 1',
		value: definition({
			uiTemplate: 'single_choice',
			validationSchema: { minOptions: 2, maxOptions: 4, exactChoiceCount: 2 },
			scoringRule: { formula: 'exact_match', mistakeMetric: 'boolean_correct', correctPoints: 1 },
		}),
		path: 'validationSchema.exactChoiceCount',
	},
	{
		name: 'метрика не своего шаблона',
		value: definition({
			scoringRule: { formula: 'exact_match', mistakeMetric: 'hamming_digits', correctPoints: 1 },
		}),
		path: 'scoringRule.mistakeMetric',
	},
]

test.each(rejectedRows)('определение типа отклоняется: $name', (row) => {
	const parsed = QuestionTypeDefinitionSchema.safeParse(row.value)
	assert.equal(parsed.success, false)
	assert.deepEqual(
		parsed.error?.issues.map((issue) => issue.path.join('.')),
		[row.path]
	)
})

test('single_choice с exactChoiceCount 1 принимается', () => {
	const value = definition({
		uiTemplate: 'single_choice',
		validationSchema: { minOptions: 1, maxOptions: 4, exactChoiceCount: 1 },
		scoringRule: { formula: 'exact_match', mistakeMetric: 'boolean_correct', correctPoints: 1 },
	})
	assert.equal(QuestionTypeDefinitionSchema.safeParse(value).success, true)
})

const metricTemplateRows: Array<{ metric: MistakeMetric; template: QuestionUiTemplate }> = [
	{ metric: 'boolean_correct', template: 'single_choice' },
	{ metric: 'set_distance', template: 'multi_choice' },
	{ metric: 'pair_mismatch_count', template: 'matching' },
	{ metric: 'compact_text_equal', template: 'short_text' },
	{ metric: 'compact_text_in_set', template: 'short_text' },
	{ metric: 'hamming_digits', template: 'sequence_digits' },
]

test.each(metricTemplateRows)('templateForMetric: $metric → $template', (row) => {
	assert.equal(templateForMetric(row.metric), row.template)
})

test('templateForMetric: таблица покрывает все метрики', () => {
	assert.deepEqual(metricTemplateRows.map((row) => row.metric).sort(), [...MISTAKE_METRICS].sort())
})

test('ALLOWED_MISTAKE_METRICS_BY_TEMPLATE задан ровно для QUESTION_UI_TEMPLATES', () => {
	assert.deepEqual(Object.keys(ALLOWED_MISTAKE_METRICS_BY_TEMPLATE), [...QUESTION_UI_TEMPLATES])
})

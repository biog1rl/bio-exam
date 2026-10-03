import assert from 'node:assert/strict'
import { test, vi } from 'vitest'

// Резолвер импортирует db/index.js, а тот открывает пул соединений. Для юнит-теста база не нужна.
vi.mock('../../db/index.js', () => ({ db: {} }))

import { validateQuestionWithType, type RuntimeQuestionTypesMap } from './question-type-resolver.js'

const questionTypesMap: RuntimeQuestionTypesMap = {
	short_answer_variants: {
		key: 'short_answer_variants',
		title: 'Краткий ответ (несколько вариантов)',
		description: null,
		uiTemplate: 'short_text',
		validationSchema: null,
		scoringRule: {
			formula: 'exact_match',
			mistakeMetric: 'compact_text_in_set',
			correctPoints: 1,
		},
		isSystem: true,
		isActive: true,
	},
}

test('short_answer_variants: непустые варианты проходят валидацию', () => {
	assert.equal(
		validateQuestionWithType(
			{
				type: 'short_answer_variants',
				options: null,
				matchingPairs: null,
				correct: ['эксперимент', 'моделирование'],
			},
			questionTypesMap
		),
		null
	)
})

test('short_answer_variants: пустой вариант отклоняется', () => {
	assert.match(
		validateQuestionWithType(
			{
				type: 'short_answer_variants',
				options: null,
				matchingPairs: null,
				correct: ['эксперимент', ''],
			},
			questionTypesMap
		) ?? '',
		/непустых/
	)
})

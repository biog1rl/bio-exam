import { AUTHORING_MESSAGES } from '@bio-exam/exam-core'

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
	sequence_disabled: {
		key: 'sequence_disabled',
		title: 'Последовательность (отключена)',
		description: null,
		uiTemplate: 'sequence_digits',
		validationSchema: null,
		scoringRule: {
			formula: 'one_mistake_partial',
			mistakeMetric: 'hamming_digits',
			correctPoints: 2,
			oneMistakePoints: 1,
		},
		isSystem: false,
		isActive: false,
	},
}

test('short_answer_variants: непустые варианты проходят валидацию', () => {
	assert.equal(
		validateQuestionWithType(
			{
				type: 'short_answer_variants',
				promptText: 'Назовите метод исследования',
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
	assert.equal(
		validateQuestionWithType(
			{
				type: 'short_answer_variants',
				promptText: 'Назовите метод исследования',
				options: null,
				matchingPairs: null,
				correct: ['эксперимент', ''],
			},
			questionTypesMap
		),
		AUTHORING_MESSAGES.shortTextVariantEmpty
	)
})

test('неизвестный ключ типа отклоняется до проверки пакетом', () => {
	assert.equal(
		validateQuestionWithType(
			{
				type: 'no_such_type',
				promptText: 'Расположите стадии по порядку',
				options: null,
				matchingPairs: null,
				correct: '2314',
			},
			questionTypesMap
		),
		'Неизвестный тип вопроса: no_such_type'
	)
})

test('отключённый тип отклоняется до проверки пакетом', () => {
	assert.equal(
		validateQuestionWithType(
			{
				type: 'sequence_disabled',
				promptText: 'Расположите стадии по порядку',
				options: null,
				matchingPairs: null,
				correct: '2314',
			},
			questionTypesMap
		),
		'Тип вопроса отключён: Последовательность (отключена)'
	)
})

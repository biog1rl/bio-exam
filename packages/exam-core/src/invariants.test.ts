import assert from 'node:assert/strict'
import { describe, test } from 'vitest'

import type { QuestionContent } from './adapters/types'
import {
	CHOICE_REVIEW_CASES,
	MATCHING_REVIEW_CASES,
	SEQUENCE_REVIEW_CASES,
	SHORT_TEXT_REVIEW_CASES,
} from './cases/review.cases'
import {
	MATCHING_SCORING_CASES,
	MULTI_CHOICE_SCORING_CASES,
	SCORING_TYPES_MAP,
	SEQUENCE_SCORING_CASES,
	SHORT_TEXT_SCORING_CASES,
	SINGLE_CHOICE_SCORING_CASES,
	type ScoringCase,
} from './cases/scoring.cases'
import {
	defaultMistakeMetricForTemplate,
	isMistakeMetricAllowedForTemplate,
	QUESTION_UI_TEMPLATES,
	type MistakeMetric,
	type QuestionUiTemplate,
} from './registry'
import { allPartsCorrect, computeVerdicts, errorUnits } from './review'
import { MISTAKES_UNSCORABLE, countMistakes, normalizeScoringRule } from './scoring'

type InvariantRow = {
	name: string
	template: QuestionUiTemplate
	metric: MistakeMetric
	key: unknown
	answer: unknown
	content?: QuestionContent
}

const UNITS_EQUAL_TEMPLATES: QuestionUiTemplate[] = ['sequence_digits', 'matching', 'short_text']

type ReviewRow = {
	name: string
	template?: QuestionUiTemplate
	metric?: MistakeMetric
	key: unknown
	answer: unknown
	content?: QuestionContent
	validKey?: false
}

function fromScoring(cases: ScoringCase[]): InvariantRow[] {
	return cases
		.filter((row) => row.validKey !== false)
		.map((row) => {
			const config = SCORING_TYPES_MAP[row.typeKey]
			const rule = normalizeScoringRule({ rule: config.scoringRule, template: config.uiTemplate, fallbackMaxPoints: 0 })
			return {
				name: `оценка: ${row.name}`,
				template: config.uiTemplate,
				metric: rule.mistakeMetric,
				key: row.key,
				answer: row.answer,
				content: row.content,
			}
		})
}

function fromReview(template: QuestionUiTemplate | null, cases: ReviewRow[]): InvariantRow[] {
	return cases
		.filter((row) => row.validKey !== false)
		.map((row) => {
			const rowTemplate = row.template ?? template
			if (!rowTemplate) throw new Error(`${row.name}: нет шаблона`)
			return {
				name: `разбор: ${row.name}`,
				template: rowTemplate,
				metric: row.metric ?? defaultMistakeMetricForTemplate(rowTemplate),
				key: row.key,
				answer: row.answer,
				content: row.content,
			}
		})
}

const FOREIGN_METRIC_ROWS: InvariantRow[] = [
	{
		name: 'чужая метрика: short_text + hamming_digits, 12/21',
		template: 'short_text',
		metric: 'hamming_digits',
		key: '12',
		answer: '21',
	},
	{
		name: 'чужая метрика: short_text + hamming_digits, 12/12',
		template: 'short_text',
		metric: 'hamming_digits',
		key: '12',
		answer: '12',
	},
	{
		name: 'чужая метрика: sequence_digits + compact_text_equal, 1243/1234',
		template: 'sequence_digits',
		metric: 'compact_text_equal',
		key: '1243',
		answer: '1234',
	},
	{
		name: 'чужая метрика: matching + boolean_correct, одна неверная пара',
		template: 'matching',
		metric: 'boolean_correct',
		key: { l1: 'r1', l2: 'r2' },
		answer: { l1: 'r1', l2: 'r1' },
		content: {
			matchingPairs: {
				left: [
					{ id: 'l1', text: 'Л1' },
					{ id: 'l2', text: 'Л2' },
				],
				right: [
					{ id: 'r1', text: 'П1' },
					{ id: 'r2', text: 'П2' },
				],
			},
		},
	},
	{
		name: 'чужая метрика: multi_choice + boolean_correct, верный набор',
		template: 'multi_choice',
		metric: 'boolean_correct',
		key: ['a', 'b'],
		answer: ['a', 'b'],
		content: {
			options: [
				{ id: 'a', text: 'А' },
				{ id: 'b', text: 'Б' },
				{ id: 'c', text: 'В' },
			],
		},
	},
	{
		name: 'чужая метрика: single_choice + set_distance, неверный вариант',
		template: 'single_choice',
		metric: 'set_distance',
		key: 'a',
		answer: 'b',
		content: {
			options: [
				{ id: 'a', text: 'А' },
				{ id: 'b', text: 'Б' },
			],
		},
	},
]

function effectiveMetric(row: InvariantRow): MistakeMetric {
	return isMistakeMetricAllowedForTemplate(row.template, row.metric)
		? row.metric
		: defaultMistakeMetricForTemplate(row.template)
}

const ROWS: InvariantRow[] = [
	...fromScoring(SINGLE_CHOICE_SCORING_CASES),
	...fromScoring(MULTI_CHOICE_SCORING_CASES),
	...fromScoring(MATCHING_SCORING_CASES),
	...fromScoring(SHORT_TEXT_SCORING_CASES),
	...fromScoring(SEQUENCE_SCORING_CASES),
	...fromReview(null, CHOICE_REVIEW_CASES),
	...fromReview('matching', MATCHING_REVIEW_CASES),
	...fromReview('short_text', SHORT_TEXT_REVIEW_CASES),
	...fromReview('sequence_digits', SEQUENCE_REVIEW_CASES),
	...FOREIGN_METRIC_ROWS,
]

function countByTemplate(rows: InvariantRow[]): string {
	const counts = new Map<QuestionUiTemplate, number>()
	for (const row of rows) counts.set(row.template, (counts.get(row.template) ?? 0) + 1)
	return [...counts.entries()].map(([template, count]) => `${template} ${count}`).join(', ')
}

describe('инвариант «все части верны ⇔ ошибок 0»', () => {
	test(`проверено строк: ${ROWS.length} (${countByTemplate(ROWS)})`, () => {
		for (const row of ROWS) {
			const verdicts = computeVerdicts({
				template: row.template,
				metric: row.metric,
				key: row.key,
				answer: row.answer,
				content: row.content,
			})
			const counted = countMistakes(effectiveMetric(row), row.answer, row.key)
			assert.equal(allPartsCorrect(verdicts), counted === 0, `${row.name}: allPartsCorrect при ${counted}`)
			assert.equal(allPartsCorrect(verdicts), verdicts.mistakes === 0, `${row.name}: allPartsCorrect ⇔ mistakes 0`)
			if (UNITS_EQUAL_TEMPLATES.includes(row.template) && counted < MISTAKES_UNSCORABLE) {
				assert.equal(errorUnits(verdicts), counted, `${row.name}: errorUnits`)
			}
			if (counted < MISTAKES_UNSCORABLE) assert.equal(verdicts.mistakes, counted, `${row.name}: mistakes`)
		}
	})

	test('проверено не меньше 80 строк, есть строки каждого шаблона', () => {
		assert.ok(ROWS.length >= 80, `строк ${ROWS.length}`)
		for (const template of QUESTION_UI_TEMPLATES) {
			assert.ok(
				ROWS.some((row) => row.template === template),
				template
			)
		}
	})

	test('у каждого шаблона есть строка с ошибками и строка без ошибок', () => {
		for (const template of QUESTION_UI_TEMPLATES) {
			const mistakes = ROWS.filter((row) => row.template === template).map(
				(row) =>
					computeVerdicts({
						template: row.template,
						metric: row.metric,
						key: row.key,
						answer: row.answer,
						content: row.content,
					}).mistakes
			)
			assert.ok(
				mistakes.some((value) => value > 0 && value < MISTAKES_UNSCORABLE),
				`${template}: нет строки с mistakes > 0`
			)
			assert.ok(
				mistakes.some((value) => value === 0),
				`${template}: нет строки с mistakes === 0`
			)
		}
	})

	test('строки с чужой метрикой есть и шаблоны у них разные', () => {
		assert.ok(FOREIGN_METRIC_ROWS.length >= 5)
		for (const row of FOREIGN_METRIC_ROWS) {
			assert.equal(isMistakeMetricAllowedForTemplate(row.template, row.metric), false, row.name)
		}
	})

	test('строки с ключом неверной формы помечены validKey: false и не дают пустых частей у выбора и сопоставления', () => {
		const invalid = [
			...[
				...SINGLE_CHOICE_SCORING_CASES,
				...MULTI_CHOICE_SCORING_CASES,
				...MATCHING_SCORING_CASES,
				...SHORT_TEXT_SCORING_CASES,
				...SEQUENCE_SCORING_CASES,
			]
				.filter((row) => row.validKey === false)
				.map((row) => ({ ...row, template: SCORING_TYPES_MAP[row.typeKey].uiTemplate })),
			...CHOICE_REVIEW_CASES.filter((row) => row.validKey === false),
			...MATCHING_REVIEW_CASES.filter((row) => row.validKey === false).map((row) => ({
				...row,
				template: 'matching' as const,
			})),
		]
		assert.ok(invalid.length > 0)
		for (const row of invalid) {
			const verdicts = computeVerdicts({
				template: row.template,
				key: row.key,
				answer: row.answer,
				content: row.content,
			})
			if (row.template !== 'sequence_digits') assert.ok(verdicts.parts.length > 0, row.name)
			else assert.equal(verdicts.parts.length, 0, row.name)
		}
	})
})

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
			const counted = countMistakes(row.metric, row.answer, row.key)
			assert.equal(allPartsCorrect(verdicts), counted === 0, `${row.name}: allPartsCorrect при ${counted}`)
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

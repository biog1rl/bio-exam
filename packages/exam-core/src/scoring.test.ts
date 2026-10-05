import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { describe, test } from 'vitest'

import type { QuestionContent } from './adapters/types'
import { ScoredQuestionFactSchema } from './attempt-result'
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
import { allPartsCorrect, errorUnits } from './review'
import { MISTAKES_UNSCORABLE, countMistakes, scoreQuestionByType, scoreQuestionFacts } from './scoring'

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

const FACT_OPTIONS: QuestionContent = {
	options: ['a', 'b', 'c', 'd'].map((id) => ({ id, text: `Вариант ${id}` })),
}

const FACT_PAIRS: QuestionContent = {
	matchingPairs: {
		left: ['l1', 'l2', 'l3'].map((id) => ({ id, text: `Левый ${id}` })),
		right: ['r1', 'r2', 'r3'].map((id) => ({ id, text: `Правый ${id}` })),
	},
}

type FactRow = {
	name: string
	typeKey: string
	key: unknown
	answer: unknown
	content: QuestionContent
}

const MATCHING_KEY = { l1: 'r1', l2: 'r2', l3: 'r3' }

const FACT_ROWS: FactRow[] = [
	{ name: 'radio верно', typeKey: 'radio', key: 'b', answer: 'b', content: FACT_OPTIONS },
	{ name: 'radio без ответа', typeKey: 'radio', key: 'b', answer: null, content: FACT_OPTIONS },
	{ name: 'radio неверно', typeKey: 'radio', key: 'b', answer: 'a', content: FACT_OPTIONS },
	{ name: 'checkbox верно', typeKey: 'checkbox', key: ['a', 'c'], answer: ['a', 'c'], content: FACT_OPTIONS },
	{ name: 'checkbox частично', typeKey: 'checkbox', key: ['a', 'c'], answer: ['a'], content: FACT_OPTIONS },
	{ name: 'checkbox неверно', typeKey: 'checkbox', key: ['a', 'c'], answer: ['b', 'd'], content: FACT_OPTIONS },
	{ name: 'matching верно', typeKey: 'matching', key: MATCHING_KEY, answer: MATCHING_KEY, content: FACT_PAIRS },
	{
		name: 'matching частично',
		typeKey: 'matching',
		key: MATCHING_KEY,
		answer: { l1: 'r1', l2: 'r2', l3: 'r1' },
		content: FACT_PAIRS,
	},
	{
		name: 'matching неверно',
		typeKey: 'matching',
		key: MATCHING_KEY,
		answer: { l1: 'r2', l2: 'r3', l3: 'r1' },
		content: FACT_PAIRS,
	},
	{ name: 'short_answer верно', typeKey: 'short_answer', key: 'Митоз', answer: 'Митоз', content: {} },
	{ name: 'short_answer без ответа', typeKey: 'short_answer', key: 'Митоз', answer: null, content: {} },
	{ name: 'short_answer неверно', typeKey: 'short_answer', key: 'Митоз', answer: 'Мейоз', content: {} },
	{ name: 'sequence верно', typeKey: 'sequence', key: '2314', answer: '2314', content: {} },
	{ name: 'sequence частично', typeKey: 'sequence', key: '2314', answer: '2315', content: {} },
	{ name: 'sequence неверно', typeKey: 'sequence', key: '2314', answer: '4132', content: {} },
]

const UNITS_EQUAL_FACT_TEMPLATES: QuestionUiTemplate[] = ['sequence_digits', 'matching', 'short_text']

function factsOf(row: FactRow, rawKey: unknown = row.key) {
	return scoreQuestionFacts({
		typeConfig: SCORING_TYPES_MAP[row.typeKey]!,
		rawKey,
		userAnswer: row.answer,
		fallbackMaxPoints: 1,
		content: row.content,
	})
}

function scoreOf(row: FactRow, correctAnswer: unknown) {
	return scoreQuestionByType({
		questionType: row.typeKey,
		userAnswer: row.answer,
		correctAnswer,
		fallbackMaxPoints: 1,
		questionTypesMap: SCORING_TYPES_MAP,
	})
}

function storable(row: FactRow, facts: ReturnType<typeof factsOf>, keyVersion: number | null) {
	return {
		questionId: crypto.randomUUID(),
		template: facts.template,
		metric: facts.metric,
		points: facts.points,
		earnedPoints: facts.earnedPoints,
		isCorrect: facts.isCorrect,
		mistakes: facts.mistakes,
		key: facts.key,
		keyVersion,
		verdicts: facts.verdicts,
		userAnswer: row.answer,
		explanationText: null,
	}
}

describe('scoreQuestionFacts: баллы и вердикты одним вызовом', () => {
	test('15 строк: пять встроенных типов, у каждого верно, частично или без ответа, неверно', () => {
		assert.equal(FACT_ROWS.length, 15)
		const templates = new Set(FACT_ROWS.map((row) => SCORING_TYPES_MAP[row.typeKey]!.uiTemplate))
		assert.equal(templates.size, 5)
	})

	test.each(FACT_ROWS)('$name: баллы, ошибки и вердикты согласованы', (row) => {
		const facts = factsOf(row)
		const score = scoreOf(row, row.key)
		assert.equal(facts.points, score.maxPoints)
		assert.equal(facts.earnedPoints, score.earnedPoints)
		assert.equal(facts.isCorrect, score.isCorrect)
		assert.equal(facts.template, SCORING_TYPES_MAP[row.typeKey]!.uiTemplate)
		assert.ok(facts.verdicts)
		assert.equal(facts.mistakes, facts.verdicts.mistakes)
		if (score.mistakesCount < MISTAKES_UNSCORABLE) assert.equal(facts.mistakes, score.mistakesCount)
		assert.equal(facts.isCorrect, facts.mistakes === 0)
		assert.equal(allPartsCorrect(facts.verdicts), facts.mistakes === 0)
		assert.equal(scoreOf(row, facts.key).earnedPoints, facts.earnedPoints)
	})

	test.each(FACT_ROWS.filter((row) => UNITS_EQUAL_FACT_TEMPLATES.includes(SCORING_TYPES_MAP[row.typeKey]!.uiTemplate)))(
		'$name: errorUnits(verdicts) === mistakes у последовательности, сопоставления и краткого ответа',
		(row) => {
			const facts = factsOf(row)
			assert.ok(facts.verdicts)
			assert.equal(errorUnits(facts.verdicts), facts.mistakes)
		}
	)

	test.each(
		FACT_ROWS.filter((row) => !UNITS_EQUAL_FACT_TEMPLATES.includes(SCORING_TYPES_MAP[row.typeKey]!.uiTemplate))
	)('$name: у выбора errorUnits(verdicts) не меньше mistakes и равен 0 только без ошибок', (row) => {
		const facts = factsOf(row)
		assert.ok(facts.verdicts && facts.mistakes !== null)
		assert.ok(errorUnits(facts.verdicts) >= facts.mistakes)
		assert.equal(errorUnits(facts.verdicts) === 0, facts.mistakes === 0)
	})

	test.each(FACT_ROWS)(
		'$name: без ключа key, verdicts и mistakes равны null, баллы как у scoreQuestionByType',
		(row) => {
			const facts = factsOf(row, null)
			const score = scoreOf(row, null)
			assert.equal(facts.key, null)
			assert.equal(facts.verdicts, null)
			assert.equal(facts.mistakes, null)
			assert.equal(facts.points, score.maxPoints)
			assert.equal(facts.earnedPoints, score.earnedPoints)
			assert.equal(facts.isCorrect, score.isCorrect)
		}
	)

	test.each(FACT_ROWS)('$name: факт проходит ScoredQuestionFactSchema', (row) => {
		const facts = factsOf(row)
		const fact = storable(row, facts, 1)
		assert.deepEqual(ScoredQuestionFactSchema.parse(fact), fact)
		const withoutKey = storable(row, factsOf(row, null), null)
		assert.deepEqual(ScoredQuestionFactSchema.parse(withoutKey), withoutKey)
	})

	test('ключ хранится в каноничной форме', () => {
		const sequence = FACT_ROWS.find((row) => row.typeKey === 'sequence')!
		assert.equal(factsOf(sequence, 2314).key, '2314')
		const checkbox = FACT_ROWS.find((row) => row.typeKey === 'checkbox')!
		assert.deepEqual(factsOf(checkbox).key, ['a', 'c'])
	})
})

const OPEN_ROWS: Array<{ name: string; rawKey: unknown; answer: unknown; fallbackMaxPoints: number }> = [
	{ name: 'без ключа и с текстовым ответом', rawKey: null, answer: 'Развёрнутый ответ', fallbackMaxPoints: 5 },
	{ name: 'без ответа', rawKey: null, answer: null, fallbackMaxPoints: 5 },
	{ name: 'с ключом, переданным по ошибке', rawKey: 'Митоз', answer: 'Митоз', fallbackMaxPoints: 1 },
	{ name: 'с массивом в ключе и fallback 1', rawKey: ['a', 'b'], answer: ['a', 'b'], fallbackMaxPoints: 1 },
]

describe('scoreQuestionFacts: открытый вопрос', () => {
	test.each(OPEN_ROWS)('$name: 3 балла максимум, 0 получено, без ключа и вердиктов', (row) => {
		const facts = scoreQuestionFacts({
			typeConfig: SCORING_TYPES_MAP.open!,
			rawKey: row.rawKey,
			userAnswer: row.answer,
			fallbackMaxPoints: row.fallbackMaxPoints,
			content: {},
		})
		assert.deepEqual(facts, {
			template: 'open',
			metric: 'manual',
			points: 3,
			earnedPoints: 0,
			isCorrect: false,
			mistakes: null,
			key: null,
			verdicts: null,
		})
	})

	test.each(OPEN_ROWS)('$name: scoreQuestionByType даёт максимум 3 и 0 получено', (row) => {
		assert.deepEqual(
			scoreQuestionByType({
				questionType: 'open',
				userAnswer: row.answer,
				correctAnswer: row.rawKey,
				fallbackMaxPoints: row.fallbackMaxPoints,
				questionTypesMap: SCORING_TYPES_MAP,
			}),
			{ maxPoints: 3, earnedPoints: 0, isCorrect: false, mistakesCount: MISTAKES_UNSCORABLE }
		)
	})

	test('повреждённое правило типа не меняет максимум', () => {
		const facts = scoreQuestionFacts({
			typeConfig: { key: 'open', uiTemplate: 'open', scoringRule: { formula: 'bad' } },
			rawKey: null,
			userAnswer: 'текст',
			fallbackMaxPoints: 7,
			content: {},
		})
		assert.equal(facts.points, 3)
		assert.equal(facts.earnedPoints, 0)
	})
})

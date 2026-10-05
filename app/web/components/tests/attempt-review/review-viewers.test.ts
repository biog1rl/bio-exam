import {
	allPartsCorrect,
	BUILTIN_QUESTION_TYPES,
	questionStatus,
	scoreQuestionFacts,
	type AttemptQuestionView,
	type AutoScoredTemplate,
	type QuestionUiTemplate,
	type RuntimeQuestionTypeConfig,
	type ScoreQuestionFactsResult,
} from '@bio-exam/exam-core'

import assert from 'node:assert/strict'
import { expect, test } from 'vitest'

import type { PublicTestQuestion } from '@/lib/tests/types'

import { getChoiceReview, getMatchingReview, getTextReview, type ReviewInput } from './attempt-review-utils'

const OPTIONS = [
	{ id: 'a', text: 'Митоз' },
	{ id: 'b', text: 'Мейоз' },
	{ id: 'c', text: 'Амитоз' },
]

const MATCHING_PAIRS = {
	left: [
		{ id: 'l1', text: 'Хлоропласт' },
		{ id: 'l2', text: 'Митохондрия' },
		{ id: 'l3', text: 'Рибосома' },
	],
	right: [
		{ id: 'r1', text: 'Фотосинтез' },
		{ id: 'r2', text: 'Дыхание' },
		{ id: 'r3', text: 'Синтез белка' },
	],
}

const QUESTION_TYPES_MAP: Record<string, RuntimeQuestionTypeConfig> = Object.fromEntries(
	BUILTIN_QUESTION_TYPES.map((item) => [
		item.key,
		{ key: item.key, title: item.title, uiTemplate: item.uiTemplate, scoringRule: item.scoringRule },
	])
)

function question(
	type: string,
	template: QuestionUiTemplate,
	promptText: string,
	content: Pick<PublicTestQuestion, 'options' | 'matchingPairs'>
): PublicTestQuestion {
	return {
		id: `q-${type}`,
		type,
		questionUiTemplate: template,
		questionTypeTitle: QUESTION_TYPES_MAP[type]?.title ?? type,
		order: 0,
		points: 1,
		promptText,
		...content,
	}
}

const QUESTIONS = {
	single_choice: question('radio', 'single_choice', 'Как делится половая клетка?', {
		options: OPTIONS,
		matchingPairs: null,
	}),
	multi_choice: question('checkbox', 'multi_choice', 'Выберите способы деления соматической клетки', {
		options: [...OPTIONS, { id: 'd', text: 'Эндомитоз' }],
		matchingPairs: null,
	}),
	matching: question('matching', 'matching', 'Сопоставьте органоид и функцию', {
		options: null,
		matchingPairs: MATCHING_PAIRS,
	}),
	short_text: question('short_answer', 'short_text', 'Назовите деление соматической клетки', {
		options: null,
		matchingPairs: null,
	}),
	sequence_digits: question('sequence', 'sequence_digits', 'Расположите стадии по порядку', {
		options: null,
		matchingPairs: null,
	}),
} satisfies Record<AutoScoredTemplate, PublicTestQuestion>

type Outcome = 'верно' | 'частично' | 'нет ответа' | 'неверно'

type Row = {
	template: AutoScoredTemplate
	key: unknown
	answer: unknown
	outcome: Outcome
	review: (input: ReviewInput) => unknown
}

const MATCHING_KEY = { l1: 'r1', l2: 'r2', l3: 'r3' }

const ROWS: Row[] = [
	{ template: 'single_choice', key: 'b', answer: 'b', outcome: 'верно', review: getChoiceReview },
	{ template: 'single_choice', key: 'b', answer: null, outcome: 'нет ответа', review: getChoiceReview },
	{ template: 'single_choice', key: 'b', answer: 'a', outcome: 'неверно', review: getChoiceReview },
	{ template: 'multi_choice', key: ['a', 'c'], answer: ['a', 'c'], outcome: 'верно', review: getChoiceReview },
	{ template: 'multi_choice', key: ['a', 'c'], answer: ['a'], outcome: 'частично', review: getChoiceReview },
	{ template: 'multi_choice', key: ['a', 'c'], answer: ['b', 'd'], outcome: 'неверно', review: getChoiceReview },
	{ template: 'matching', key: MATCHING_KEY, answer: { ...MATCHING_KEY }, outcome: 'верно', review: getMatchingReview },
	{
		template: 'matching',
		key: MATCHING_KEY,
		answer: { l1: 'r1', l2: 'r2', l3: 'r1' },
		outcome: 'частично',
		review: getMatchingReview,
	},
	{
		template: 'matching',
		key: MATCHING_KEY,
		answer: { l1: 'r2', l2: 'r3', l3: 'r1' },
		outcome: 'неверно',
		review: getMatchingReview,
	},
	{ template: 'short_text', key: 'Митоз', answer: 'Митоз', outcome: 'верно', review: getTextReview },
	{ template: 'short_text', key: 'Митоз', answer: null, outcome: 'нет ответа', review: getTextReview },
	{ template: 'short_text', key: 'Митоз', answer: 'Мейоз', outcome: 'неверно', review: getTextReview },
	{ template: 'sequence_digits', key: '2314', answer: '2314', outcome: 'верно', review: getTextReview },
	{ template: 'sequence_digits', key: '2314', answer: '2315', outcome: 'частично', review: getTextReview },
	{ template: 'sequence_digits', key: '2314', answer: '4132', outcome: 'неверно', review: getTextReview },
]

type Viewer = 'admin' | 'student_with_key' | 'student_without_key'

type KeyDisclosure = Pick<AttemptQuestionView, 'keyVisible' | 'correctAnswer' | 'verdicts' | 'mistakes'>

const VIEWERS: Record<Viewer, (fact: ScoreQuestionFactsResult) => KeyDisclosure> = {
	admin: (fact) => ({ keyVisible: true, correctAnswer: fact.key, verdicts: fact.verdicts, mistakes: fact.mistakes }),
	student_with_key: (fact) => ({
		keyVisible: fact.key != null,
		correctAnswer: fact.isCorrect ? null : fact.key,
		verdicts: fact.verdicts,
		mistakes: fact.mistakes,
	}),
	student_without_key: (fact) =>
		fact.isCorrect
			? {
					keyVisible: false,
					correctAnswer: null,
					verdicts: fact.verdicts && allPartsCorrect(fact.verdicts) ? fact.verdicts : null,
					mistakes: 0,
				}
			: { keyVisible: false, correctAnswer: null, verdicts: null, mistakes: null },
}

function score(row: Row) {
	const q = QUESTIONS[row.template]
	return scoreQuestionFacts({
		typeConfig: QUESTION_TYPES_MAP[q.type],
		rawKey: row.key,
		userAnswer: row.answer,
		fallbackMaxPoints: q.points,
		content: { options: q.options, matchingPairs: q.matchingPairs },
	})
}

function viewFor(viewer: Viewer, row: Row, fact: ScoreQuestionFactsResult): AttemptQuestionView {
	return {
		questionId: QUESTIONS[row.template].id,
		isCorrect: fact.isCorrect,
		points: fact.points,
		earnedPoints: fact.earnedPoints,
		userAnswer: row.answer,
		explanationText: null,
		status: questionStatus(fact),
		...VIEWERS[viewer](fact),
	}
}

for (const viewer of Object.keys(VIEWERS) as Viewer[]) {
	for (const row of ROWS) {
		test(`${viewer} · ${row.template} · ${row.outcome}`, () => {
			const fact = score(row)
			const { isCorrect, earnedPoints } = fact
			if (row.outcome === 'верно') assert.equal(isCorrect, true)
			if (row.outcome === 'частично') {
				assert.equal(isCorrect, false)
				assert.ok(earnedPoints > 0)
			}
			if (row.outcome === 'нет ответа' || row.outcome === 'неверно') {
				assert.equal(isCorrect, false)
				assert.equal(earnedPoints, 0)
			}
			const model = row.review({
				question: QUESTIONS[row.template],
				studentAnswer: row.answer,
				view: viewFor(viewer, row, fact),
			})
			expect(model).toMatchSnapshot()
		})
	}
}

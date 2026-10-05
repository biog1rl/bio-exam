import { computeVerdicts, type AttemptQuestionView } from '@bio-exam/exam-core'

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { test } from 'vitest'

import type { PublicTestQuestion } from '@/lib/tests/types'

import {
	ADMIN_REVIEW_NOTES,
	emptyQuestionView,
	filterQuestionsByStatus,
	formatDuration,
	getAdminReviewNote,
	getChoiceReview,
	getCorrectLines,
	getMatchingReview,
	getQuestionView,
	getSequenceReview,
	getStatusClass,
	getStatusLabel,
	getTextReview,
	sequencePositionLabel,
} from './attempt-review-utils'

test('formatDuration: нуль, меньше секунды и целые секунды', () => {
	assert.equal(formatDuration(0), '0с')
	assert.equal(formatDuration(1), '<1с')
	assert.equal(formatDuration(999), '<1с')
	assert.equal(formatDuration(1000), '1с')
})

const kinds = (review: ReturnType<typeof getSequenceReview>) => review.parts.map((part) => part.kind)

function sequenceView(key: unknown, answer: unknown, correctAnswer: unknown = key) {
	const verdicts = computeVerdicts({ template: 'sequence_digits', key, answer })
	return { verdicts, mistakes: verdicts.mistakes, correctAnswer }
}

test('getSequenceReview: соседняя перестановка 1234 при ключе 1243 даёт одну ошибку и две ячейки swapped', () => {
	const review = getSequenceReview(sequenceView('1243', '1234'))
	assert.equal(review.summaryText, 'Ошибок: 1')
	assert.deepEqual(kinds(review), ['correct', 'correct', 'swapped', 'swapped'])
	assert.equal(review.showCells, true)
	assert.equal(review.hasSwap, true)
})

test('getSequenceReview: пустой ответ считает ошибки по длине ключа и не рисует ячейки', () => {
	for (const studentAnswer of ['', null]) {
		const review = getSequenceReview(sequenceView('2314', studentAnswer))
		assert.equal(review.summaryText, 'Ошибок: 4')
		assert.equal(review.showCells, false)
	}
})

test('sequencePositionLabel: цифра ключа звучит только при видимом ключе', () => {
	const wrong = { position: 2, kind: 'wrong' as const, given: '5', expected: '3' }
	const missing = { position: 5, kind: 'missing' as const, given: null, expected: '7' }
	assert.equal(sequencePositionLabel(wrong, true), 'позиция 2: неверно, ожидалась 3')
	assert.equal(sequencePositionLabel(missing, true), 'позиция 5: цифра пропущена, ожидалась 7')
	assert.equal(sequencePositionLabel(wrong, false), 'позиция 2: неверно')
	assert.equal(sequencePositionLabel(missing, false), 'позиция 5: цифра пропущена')
	assert.equal(
		sequencePositionLabel({ position: 1, kind: 'correct', given: '1', expected: '1' }, true),
		'позиция 1: верно'
	)
	assert.equal(
		sequencePositionLabel({ position: 3, kind: 'swapped', given: '4', expected: '3' }, true),
		'позиция 3: переставлена местами с соседней'
	)
	assert.equal(
		sequencePositionLabel({ position: 6, kind: 'extra', given: '9', expected: null }, true),
		'позиция 6: лишняя цифра'
	)
})

test('QuestionAnswerReview выводит summaryText как есть и не содержит прежней строки позиций', () => {
	const read = (name: string) => readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8')
	const component = read('./QuestionAnswerReview.tsx')
	const utils = read('./attempt-review-utils.ts')
	assert.ok(!component.includes('Совпало позиций'))
	assert.ok(!utils.includes('Совпало позиций'))
	assert.ok(!component.includes('computeVerdicts('))
	assert.ok(!utils.includes('computeVerdicts('))
	assert.ok(component.includes('getTextReview('))
	assert.ok(component.includes('{review.summaryText}'))
	assert.ok(!/Ошибок:/.test(component))
	const start = utils.indexOf('export function getTextReview(')
	assert.ok(start >= 0)
	const end = utils.indexOf('\n}\n', start)
	assert.ok(end > start)
	assert.ok(utils.slice(start, end).includes('getSequenceReview('))
})

function choiceVerdicts(question: PublicTestQuestion, answer: unknown, key: unknown) {
	const template = question.questionUiTemplate === 'single_choice' ? 'single_choice' : 'multi_choice'
	return computeVerdicts({ template, key, answer, content: { options: question.options } })
}

const threeOptionQuestion = {
	questionUiTemplate: 'multi_choice',
	options: [
		{ id: '1', text: 'Первый' },
		{ id: '2', text: 'Второй' },
		{ id: '3', text: 'Третий' },
	],
	matchingPairs: null,
} as PublicTestQuestion

const ID = '11111111-1111-4111-8111-111111111111'

function view(patch: Partial<AttemptQuestionView>): AttemptQuestionView {
	return { ...emptyQuestionView(ID), points: 1, ...patch }
}

const textQuestion = {
	id: ID,
	questionUiTemplate: 'short_text',
	options: null,
	matchingPairs: null,
} as PublicTestQuestion

const sequenceQuestion = { ...textQuestion, questionUiTemplate: 'sequence_digits' } as PublicTestQuestion

const choiceQuestion = { ...threeOptionQuestion, id: ID } as PublicTestQuestion

const matchingQuestion = {
	id: ID,
	questionUiTemplate: 'matching',
	options: null,
	matchingPairs: {
		left: [
			{ id: 'l1', text: 'Хлоропласт' },
			{ id: 'l2', text: 'Митохондрия' },
		],
		right: [
			{ id: 'r1', text: 'Фотосинтез' },
			{ id: 'r2', text: 'Дыхание' },
		],
	},
} as PublicTestQuestion

test('getAdminReviewNote: ключ неизвестен, вердиктов нет, полный разбор и вопрос без вида', () => {
	assert.equal(getAdminReviewNote(view({ keyVisible: false })), 'key-unknown')
	assert.equal(
		getAdminReviewNote(view({ keyVisible: true, correctAnswer: '2314', verdicts: null })),
		'verdicts-unavailable'
	)
	const verdicts = computeVerdicts({ template: 'sequence_digits', key: '2314', answer: '2314' })
	assert.equal(getAdminReviewNote(view({ keyVisible: true, correctAnswer: '2314', verdicts })), null)
	assert.equal(getAdminReviewNote(null), null)
	assert.equal(
		ADMIN_REVIEW_NOTES['key-unknown'],
		'Ключ на момент сдачи не сохранён. Показаны ответ студента и сохранённые баллы.'
	)
	assert.equal(
		ADMIN_REVIEW_NOTES['verdicts-unavailable'],
		'Разбор по частям недоступен: правила проверки изменились после сдачи. Показаны ключ на момент сдачи и сохранённые баллы.'
	)
})

test('getTextReview: ключ неизвестен и ответ верный — зелёная карточка без ключа и разбора', () => {
	for (const question of [textQuestion, sequenceQuestion]) {
		const review = getTextReview({
			question,
			studentAnswer: '2314',
			view: view({ keyVisible: false, isCorrect: true, earnedPoints: 1, status: 'correct' }),
		})
		assert.equal(review.studentTone, 'correct')
		assert.equal(review.studentTitle, 'Ответ студента · верно')
		assert.equal(review.summaryText, null)
		assert.equal(review.cells, null)
		assert.equal(review.correctLines, null)
	}
})

test('getTextReview: ключ известен, вердиктов нет — цвет сохранённого статуса, ключ, без «Ошибок: N» и ячеек', () => {
	const review = getTextReview({
		question: sequenceQuestion,
		studentAnswer: '2315',
		view: view({ keyVisible: true, correctAnswer: '2314', verdicts: null, mistakes: null, status: 'wrong' }),
	})
	assert.equal(review.studentTone, 'wrong')
	assert.equal(review.studentTitle, 'Ответ студента · неверно')
	assert.equal(review.summaryText, null)
	assert.equal(review.cells, null)
	assert.deepEqual(review.correctLines, ['2314'])
})

test('getChoiceReview: ключ известен, вердиктов нет — без подсветки, ключ отдаёт getCorrectLines', () => {
	const known = view({ keyVisible: true, correctAnswer: ['1', '3'], verdicts: null, status: 'wrong' })
	const review = getChoiceReview({ question: choiceQuestion, studentAnswer: ['2'], view: known })
	assert.deepEqual(Object.keys(review).sort(), ['rows', 'summary'])
	assert.equal(review.summary, 'Выбрано: 1')
	assert.deepEqual(
		review.rows.map((row) => [row.tone, row.label]),
		[
			['neutral', null],
			['neutral', 'Выбран'],
			['neutral', null],
		]
	)
	assert.deepEqual(getCorrectLines(choiceQuestion, known), ['Первый', 'Третий'])
	assert.equal(getCorrectLines(choiceQuestion, { ...known, status: 'correct' }), null)
	assert.equal(getCorrectLines(choiceQuestion, { ...known, keyVisible: false }), null)
	const verdicts = choiceVerdicts(choiceQuestion, ['2'], ['1', '3'])
	assert.equal(getCorrectLines(choiceQuestion, { ...known, verdicts }), null)
})

test('getMatchingReview: ключ известен, вердиктов нет — без «Верных пар», пары нейтральные', () => {
	const known = view({ keyVisible: true, correctAnswer: { l1: 'r1', l2: 'r2' }, verdicts: null, status: 'wrong' })
	const review = getMatchingReview({ question: matchingQuestion, studentAnswer: { l1: 'r2', l2: 'r1' }, view: known })
	assert.ok(review)
	assert.deepEqual(Object.keys(review).sort(), ['rows', 'summary'])
	assert.equal(review.summary, null)
	assert.deepEqual(
		review.rows.map((row) => [row.tone, row.verdictText]),
		[
			['neutral', null],
			['neutral', null],
		]
	)
	assert.deepEqual(getCorrectLines(matchingQuestion, known), ['Хлоропласт -> Фотосинтез', 'Митохондрия -> Дыхание'])
	assert.equal(getCorrectLines(matchingQuestion, { ...known, status: 'correct' }), null)
})

test('вопрос без вида: «Без оценки», нейтральный класс, не попадает в «Верно», нейтральный разбор', () => {
	const other = '22222222-2222-4222-8222-222222222222'
	const results = [view({ questionId: other, isCorrect: true, earnedPoints: 1, status: 'correct' })]
	assert.equal(getQuestionView(ID, results), null)
	assert.equal(getQuestionView(other, results), results[0])
	assert.equal(getStatusLabel(null), 'Без оценки')
	assert.equal(getStatusClass(null), 'border-border/70 bg-secondary/60 text-muted-foreground')
	const questions = [{ id: ID }, { id: other }] as PublicTestQuestion[]
	assert.deepEqual(
		filterQuestionsByStatus(questions, results, 'correct').map((question) => question.id),
		[other]
	)
	assert.deepEqual(filterQuestionsByStatus(questions, results, 'wrong'), [])
	assert.equal(filterQuestionsByStatus(questions, results, 'all'), questions)
	const empty = emptyQuestionView(ID)
	assert.deepEqual(empty, {
		questionId: ID,
		isCorrect: false,
		points: 0,
		earnedPoints: 0,
		userAnswer: null,
		correctAnswer: null,
		explanationText: null,
		status: 'ungraded',
		keyVisible: false,
		mistakes: null,
		verdicts: null,
	})
	const text = getTextReview({ question: sequenceQuestion, studentAnswer: '2315', view: empty })
	assert.equal(text.studentTone, 'neutral')
	assert.equal(text.studentTitle, 'Ответ студента')
	assert.equal(text.summaryText, null)
	assert.equal(text.correctLines, null)
	const choice = getChoiceReview({ question: choiceQuestion, studentAnswer: ['1'], view: empty })
	assert.equal(choice.summary, 'Выбрано: 1')
	assert.ok(choice.rows.every((row) => row.tone === 'neutral'))
	assert.equal(getAdminReviewNote(getQuestionView(ID, results)), null)
})

test('getStatusLabel: ungraded и null — «Без оценки»; фильтр «Верно» берёт status correct', () => {
	assert.equal(getStatusLabel('ungraded'), 'Без оценки')
	assert.equal(getStatusLabel('correct'), 'Верно')
	assert.equal(getStatusClass('ungraded'), getStatusClass(null))
	const second = '33333333-3333-4333-8333-333333333333'
	const results = [
		view({ status: 'ungraded', isCorrect: true, points: 0 }),
		view({ questionId: second, status: 'correct', isCorrect: true, earnedPoints: 1 }),
	]
	const questions = [{ id: ID }, { id: second }] as PublicTestQuestion[]
	assert.deepEqual(
		filterQuestionsByStatus(questions, results, 'correct').map((question) => question.id),
		[second]
	)
})

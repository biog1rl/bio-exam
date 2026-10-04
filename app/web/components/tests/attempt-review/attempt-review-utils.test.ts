import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { test } from 'vitest'

import type { PublicTestQuestion } from '@/lib/tests/types'

import {
	formatDuration,
	getChoiceOptionReviewRows,
	getSequenceReview,
	sequencePositionLabel,
} from './attempt-review-utils'

test('formatDuration: нуль, меньше секунды и целые секунды', () => {
	assert.equal(formatDuration(0), '0с')
	assert.equal(formatDuration(1), '<1с')
	assert.equal(formatDuration(999), '<1с')
	assert.equal(formatDuration(1000), '1с')
})

const kinds = (review: ReturnType<typeof getSequenceReview>) => review.parts.map((part) => part.kind)

test('getSequenceReview: соседняя перестановка 1234 при ключе 1243 даёт одну ошибку и две ячейки swapped', () => {
	const review = getSequenceReview({ studentAnswer: '1234', correctAnswer: '1243', isCorrect: false })
	assert.equal(review.visible, true)
	assert.equal(review.mistakes, 1)
	assert.equal(review.summaryText, 'Ошибок: 1')
	assert.deepEqual(kinds(review), ['correct', 'correct', 'swapped', 'swapped'])
	assert.equal(review.showCells, true)
	assert.equal(review.hasSwap, true)
})

test('getSequenceReview: верный ответ при скрытом ключе даёт Ошибок: 0 без ячеек', () => {
	const review = getSequenceReview({ studentAnswer: '2314', correctAnswer: null, isCorrect: true })
	assert.equal(review.visible, true)
	assert.equal(review.mistakes, 0)
	assert.equal(review.summaryText, 'Ошибок: 0')
	assert.equal(review.showCells, false)
	assert.equal(review.hasSwap, false)
})

test('getSequenceReview: сохранённый isCorrect при другом текущем ключе даёт Ошибок: 0 без ячеек', () => {
	const review = getSequenceReview({ studentAnswer: '1243', correctAnswer: '1234', isCorrect: true })
	assert.equal(review.visible, true)
	assert.equal(review.mistakes, 0)
	assert.equal(review.summaryText, 'Ошибок: 0')
	assert.equal(review.showCells, false)
	assert.equal(review.hasSwap, false)
})

test('getSequenceReview: неверный ответ при скрытом ключе ничего не показывает', () => {
	const review = getSequenceReview({ studentAnswer: '2315', correctAnswer: null, isCorrect: false })
	assert.equal(review.visible, false)
	assert.equal(review.summaryText, null)
	assert.equal(review.showCells, false)
	assert.equal(review.hasSwap, false)
})

test('getSequenceReview: пустой ответ считает ошибки по длине ключа и не рисует ячейки', () => {
	for (const studentAnswer of ['', null]) {
		const review = getSequenceReview({ studentAnswer, correctAnswer: '2314', isCorrect: false })
		assert.equal(review.visible, true)
		assert.equal(review.mistakes, 4)
		assert.equal(review.summaryText, 'Ошибок: 4')
		assert.equal(review.showCells, false)
	}
})

test('getSequenceReview: длинный ответ даёт ячейки extra сверх длины ключа', () => {
	const review = getSequenceReview({
		studentAnswer: '2314' + '5678901234567890',
		correctAnswer: '2314',
		isCorrect: false,
	})
	assert.deepEqual(kinds(review), [...Array(4).fill('correct'), ...Array(16).fill('extra')])
	assert.equal(review.summaryText, 'Ошибок: 16')
	assert.equal(review.showCells, true)
})

test('getSequenceReview: числовой ключ читается как строка цифр', () => {
	const review = getSequenceReview({ studentAnswer: '1234', correctAnswer: 1243, isCorrect: false })
	assert.equal(review.summaryText, 'Ошибок: 1')
	assert.deepEqual(kinds(review), ['correct', 'correct', 'swapped', 'swapped'])
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
	const source = readFileSync(fileURLToPath(new URL('./QuestionAnswerReview.tsx', import.meta.url)), 'utf8')
	assert.ok(!source.includes('Совпало позиций'))
	assert.ok(source.includes('getSequenceReview('))
	assert.ok(source.includes('{sequenceReview.summaryText}'))
	assert.ok(!/Ошибок:/.test(source))
})

const threeOptionQuestion = {
	questionUiTemplate: 'multi_choice',
	options: [
		{ id: '1', text: 'Первый' },
		{ id: '2', text: 'Второй' },
		{ id: '3', text: 'Третий' },
	],
	matchingPairs: null,
} as PublicTestQuestion

test('getChoiceOptionReviewRows: без ключа выбранный вариант помечен неверным, остальные нейтральны', () => {
	assert.deepEqual(
		getChoiceOptionReviewRows(threeOptionQuestion, ['1'], null).map((row) => row.status),
		['incorrect-selected', 'neutral', 'neutral']
	)
})

test('getChoiceOptionReviewRows: пропущенный верный и выбранный неверный варианты', () => {
	assert.deepEqual(
		getChoiceOptionReviewRows(threeOptionQuestion, ['2'], ['1']).map((row) => row.status),
		['correct', 'incorrect-selected', 'neutral']
	)
	const singleChoice = { ...threeOptionQuestion, questionUiTemplate: 'single_choice' } as PublicTestQuestion
	assert.deepEqual(
		getChoiceOptionReviewRows(singleChoice, ['1'], '1').map((row) => row.status),
		['correct', 'neutral', 'neutral']
	)
})

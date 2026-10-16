import assert from 'node:assert/strict'
import { test } from 'vitest'

import { isQuestionAnswered } from './question-answered'

const OPEN = { questionUiTemplate: 'open', options: null, matchingPairs: null, allowPhotos: true } as const

test('открытый вопрос: текст, фото или оба считаются ответом, пустое — нет', () => {
	assert.equal(isQuestionAnswered({ question: OPEN, answer: undefined, photoCount: 0 }), false)
	assert.equal(isQuestionAnswered({ question: OPEN, answer: '  ', photoCount: 0 }), false)
	assert.equal(isQuestionAnswered({ question: OPEN, answer: 'Текст', photoCount: 0 }), true)
	assert.equal(isQuestionAnswered({ question: OPEN, answer: undefined, photoCount: 2 }), true)
	assert.equal(isQuestionAnswered({ question: OPEN, answer: 'Текст', photoCount: 2 }), true)
})

test('при запрещённых фото открытый вопрос без текста остаётся без ответа', () => {
	const question = { ...OPEN, allowPhotos: false }
	assert.equal(isQuestionAnswered({ question, answer: undefined, photoCount: 3 }), false)
	assert.equal(isQuestionAnswered({ question, answer: 'Текст', photoCount: 0 }), true)
})

test('фото не делают ответом вопрос другого типа', () => {
	const question = { questionUiTemplate: 'short_text', options: null, matchingPairs: null, allowPhotos: true } as const
	assert.equal(isQuestionAnswered({ question, answer: undefined, photoCount: 1 }), false)
	assert.equal(isQuestionAnswered({ question, answer: 'ответ', photoCount: 0 }), true)
})

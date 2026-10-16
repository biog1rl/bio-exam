import assert from 'node:assert/strict'
import { describe, test } from 'vitest'

import { missingPhotosText, postSubmitRows, type PostSubmitQuestion } from './post-submit-rows'

const QUESTIONS: PostSubmitQuestion[] = [
	{ id: 'q7', number: 7 },
	{ id: 'q4', number: 4 },
	{ id: 'q9', number: 9 },
]

describe('postSubmitRows', () => {
	test.each<[string, Record<string, number>, string[], number[], boolean]>([
		['у всех есть фото', { q4: 1, q7: 2, q9: 1 }, ['q4', 'q7', 'q9'], [], false],
		['у части нет фото — они сверху', { q4: 1, q7: 0, q9: 3 }, ['q7', 'q4', 'q9'], [7], true],
		['ни у кого нет фото', {}, ['q4', 'q7', 'q9'], [4, 7, 9], true],
		['внутри групп по номеру', { q9: 1, q7: 1 }, ['q4', 'q7', 'q9'], [4], true],
	])('%s', (_name, counts, order, missing, needsConfirm) => {
		const rows = postSubmitRows(QUESTIONS, new Map(Object.entries(counts)))
		assert.deepEqual(rows.order, order)
		assert.deepEqual(rows.missing, missing)
		assert.equal(rows.needsConfirm, needsConfirm)
	})
})

describe('missingPhotosText', () => {
	const tail = 'Вопрос без текста и без фото получит 0 баллов. После отправки добавить фото будет нельзя.'
	test.each<[number[], string]>([
		[[7], `Нет фото у 1 вопроса: 7. ${tail}`],
		[[4, 7], `Нет фото у 2 вопросов: 4 и 7. ${tail}`],
		[[1, 2, 3, 4, 5], `Нет фото у 5 вопросов: 1, 2, 3, 4 и 5. ${tail}`],
	])('%j', (numbers, expected) => {
		assert.equal(missingPhotosText(numbers), expected)
	})
})

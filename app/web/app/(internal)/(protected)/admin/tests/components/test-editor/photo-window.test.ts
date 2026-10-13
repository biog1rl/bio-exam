import { describe, expect, it } from 'vitest'

import { hasOpenQuestion, photoWindowError, photoWindowHint, photoWindowSaveError } from './photo-window'

const REQUIRED = 'Укажите число минут от 0 до 120'
const INVALID = 'Введите целое число минут от 0 до 120'

describe('photoWindowError', () => {
	it.each([
		{ value: null, expected: REQUIRED },
		{ value: 12.5, expected: INVALID },
		{ value: -1, expected: INVALID },
		{ value: 121, expected: INVALID },
		{ value: Number.NaN, expected: INVALID },
		{ value: 0, expected: null },
		{ value: 15, expected: null },
		{ value: 120, expected: null },
	])('значение $value', ({ value, expected }) => {
		expect(photoWindowError(value)).toBe(expected)
	})
})

describe('photoWindowSaveError', () => {
	it.each([
		{ name: 'скрытое поле с null не блокирует сохранение', value: null, visible: false, expected: null },
		{ name: 'скрытое поле с 121 не блокирует сохранение', value: 121, visible: false, expected: null },
		{ name: 'видимое поле с null', value: null, visible: true, expected: REQUIRED },
		{ name: 'видимое поле с 121', value: 121, visible: true, expected: INVALID },
		{ name: 'видимое поле с 15', value: 15, visible: true, expected: null },
	])('$name', ({ value, visible, expected }) => {
		expect(photoWindowSaveError(value, visible)).toBe(expected)
	})
})

describe('photoWindowHint', () => {
	it.each([
		{ limit: 30, expected: 'Отсчёт — от сдачи или конца таймера, что раньше. 0 — фото только до сдачи.' },
		{ limit: null, expected: 'Отсчёт — от сдачи теста. 0 — фото только до сдачи.' },
	])('лимит $limit', ({ limit, expected }) => {
		expect(photoWindowHint(limit)).toBe(expected)
	})
})

describe('hasOpenQuestion', () => {
	it.each([
		{ name: 'пустой список', questions: [], expected: false },
		{
			name: 'только короткий ответ',
			questions: [{ questionUiTemplate: 'short_text' }, { questionUiTemplate: null }, {}],
			expected: false,
		},
		{
			name: 'есть открытый вопрос',
			questions: [{ questionUiTemplate: 'short_text' }, { questionUiTemplate: 'open' }],
			expected: true,
		},
	])('$name', ({ questions, expected }) => {
		expect(hasOpenQuestion(questions)).toBe(expected)
	})
})

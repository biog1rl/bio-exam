import { describe, expect, test } from 'vitest'

import { uploadWindowRefusalText, uploadWindowView, type UploadWindowView } from './upload-window'

function at(year: number, month: number, day: number, hour: number, minute: number, second = 0): number {
	return new Date(year, month, day, hour, minute, second).getTime()
}

const CLOSES = new Date(2026, 9, 6, 14, 35).toISOString()
const CLOSES_NEXT_DAY = new Date(2026, 9, 7, 0, 15).toISOString()

const NONE: UploadWindowView = {
	state: 'none',
	until: null,
	countdown: null,
	closedText: null,
	srText: null,
	liveText: null,
	nextUpdateInMs: null,
}

function open(
	state: 'open' | 'closing' | 'last-minute',
	until: string,
	countdown: string,
	nextUpdateInMs: number
): UploadWindowView {
	return {
		state,
		until: `Фото можно добавить до ${until}`,
		countdown,
		closedText: null,
		srText: `Фото можно добавить до ${until}.`,
		liveText: state === 'closing' ? 'Окно для фото закроется через 5 минут.' : null,
		nextUpdateInMs,
	}
}

function closed(closedText: string): UploadWindowView {
	return {
		state: 'closed',
		until: null,
		countdown: null,
		closedText,
		srText: null,
		liveText: 'Время для добавления фото закончилось.',
		nextUpdateInMs: null,
	}
}

describe('uploadWindowView', () => {
	test.each([
		{ name: 'окна нет', closes: null, now: at(2026, 9, 6, 14, 15), expected: NONE },
		{ name: 'неразборчивая дата', closes: 'не дата', now: at(2026, 9, 6, 14, 15), expected: NONE },
		{
			name: 'осталось 20 мин',
			closes: CLOSES,
			now: at(2026, 9, 6, 14, 15),
			expected: open('open', '14:35', 'осталось 20 мин', 60_000),
		},
		{
			name: 'осталось 5 мин 1 с',
			closes: CLOSES,
			now: at(2026, 9, 6, 14, 29, 59),
			expected: open('open', '14:35', 'осталось 6 мин', 1_000),
		},
		{
			name: 'осталось ровно 5 мин',
			closes: CLOSES,
			now: at(2026, 9, 6, 14, 30),
			expected: open('closing', '14:35', 'закроется через 5 мин', 60_000),
		},
		{
			name: 'осталось 4 мин 10 с',
			closes: CLOSES,
			now: at(2026, 9, 6, 14, 30, 50),
			expected: open('closing', '14:35', 'закроется через 5 мин', 10_000),
		},
		{
			name: 'осталось ровно 60 с',
			closes: CLOSES,
			now: at(2026, 9, 6, 14, 34),
			expected: open('closing', '14:35', 'закроется через 1 мин', 60_000),
		},
		{
			name: 'осталось 59 с',
			closes: CLOSES,
			now: at(2026, 9, 6, 14, 34, 1),
			expected: open('last-minute', '14:35', 'закроется меньше чем через минуту', 59_000),
		},
		{
			name: 'ровно в момент закрытия',
			closes: CLOSES,
			now: at(2026, 9, 6, 14, 35),
			expected: closed('Время для добавления фото закончилось в 14:35'),
		},
		{
			name: 'закрыто 10 мин назад',
			closes: CLOSES,
			now: at(2026, 9, 6, 14, 45),
			expected: closed('Время для добавления фото закончилось в 14:35'),
		},
		{
			name: 'окно закрывается на следующий день',
			closes: CLOSES_NEXT_DAY,
			now: at(2026, 9, 6, 23, 50),
			expected: open('open', '7 окт., 00:15', 'осталось 25 мин', 60_000),
		},
		{
			name: 'окно закрылось в другой день',
			closes: CLOSES_NEXT_DAY,
			now: at(2026, 9, 8, 10, 0),
			expected: closed('Время для добавления фото закончилось 7 окт. в 00:15'),
		},
	])('$name', ({ closes, now, expected }) => {
		expect(uploadWindowView(closes, now)).toEqual(expected)
	})
})

describe('uploadWindowRefusalText', () => {
	test.each([
		{
			name: 'загрузка, окно закрылось в тот же день',
			refusal: { error: 'UPLOAD_WINDOW_CLOSED', uploadClosesAt: CLOSES },
			now: at(2026, 9, 6, 14, 45),
			action: 'upload',
			expected: 'Время для добавления фото закончилось в 14:35. Фото не сохранено.',
		},
		{
			name: 'загрузка, окно закрылось в другой день',
			refusal: { error: 'UPLOAD_WINDOW_CLOSED', uploadClosesAt: CLOSES_NEXT_DAY },
			now: at(2026, 9, 8, 10, 0),
			action: 'upload',
			expected: 'Время для добавления фото закончилось 7 окт. в 00:15. Фото не сохранено.',
		},
		{
			name: 'загрузка, часы устройства отстают на 30 с',
			refusal: { error: 'UPLOAD_WINDOW_CLOSED', uploadClosesAt: CLOSES },
			now: at(2026, 9, 6, 14, 34, 30),
			action: 'upload',
			expected: 'Время для добавления фото закончилось в 14:35. Фото не сохранено.',
		},
		{
			name: 'загрузка, окна нет',
			refusal: { error: 'UPLOAD_WINDOW_NONE', uploadClosesAt: null },
			now: at(2026, 9, 6, 14, 45),
			action: 'upload',
			expected: 'К этой попытке фото добавить нельзя.',
		},
		{
			name: 'загрузка, закрыто без момента',
			refusal: { error: 'UPLOAD_WINDOW_CLOSED', uploadClosesAt: null },
			now: at(2026, 9, 6, 14, 45),
			action: 'upload',
			expected: 'К этой попытке фото добавить нельзя.',
		},
		{
			name: 'удаление, окно закрылось в тот же день',
			refusal: { error: 'UPLOAD_WINDOW_CLOSED', uploadClosesAt: CLOSES },
			now: at(2026, 9, 6, 14, 45),
			action: 'remove',
			expected: 'Время для добавления фото закончилось в 14:35. Фото нельзя удалить.',
		},
		{
			name: 'удаление, окно закрылось в другой день',
			refusal: { error: 'UPLOAD_WINDOW_CLOSED', uploadClosesAt: CLOSES_NEXT_DAY },
			now: at(2026, 9, 8, 10, 0),
			action: 'remove',
			expected: 'Время для добавления фото закончилось 7 окт. в 00:15. Фото нельзя удалить.',
		},
		{
			name: 'удаление, окна нет',
			refusal: { error: 'UPLOAD_WINDOW_NONE', uploadClosesAt: null },
			now: at(2026, 9, 6, 14, 45),
			action: 'remove',
			expected: 'Фото этой попытки изменить нельзя.',
		},
		{
			name: 'удаление, закрыто без момента',
			refusal: { error: 'UPLOAD_WINDOW_CLOSED', uploadClosesAt: null },
			now: at(2026, 9, 6, 14, 45),
			action: 'remove',
			expected: 'Фото этой попытки изменить нельзя.',
		},
	] as const)('$name', ({ refusal, now, action, expected }) => {
		expect(uploadWindowRefusalText(refusal, now, action)).toBe(expected)
	})
})

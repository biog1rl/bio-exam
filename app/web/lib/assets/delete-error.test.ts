import { describe, expect, it } from 'vitest'

import { deleteErrorMessage } from './delete-error'

describe('deleteErrorMessage', () => {
	it('показывает текст отказа сервера про непроиндексированные ссылки', () => {
		const error = 'Удаление недоступно: ссылки на изображения ещё не проиндексированы'
		expect(deleteErrorMessage(409, { error })).toBe(error)
	})

	it.each([
		[500, null],
		[403, {}],
		[400, 'текст'],
		[409, { error: '' }],
		[409, { error: 42 }],
	])('без строкового error в ответе %i даёт общий текст', (status, body) => {
		expect(deleteErrorMessage(status, body)).toBe('Не удалось удалить изображение')
	})
})

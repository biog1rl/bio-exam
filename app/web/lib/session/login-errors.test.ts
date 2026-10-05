import { describe, expect, it } from 'vitest'

import { loginErrorText, parseRetryAfter } from './login-errors'
import { formatWait } from './wait-format'

describe('formatWait', () => {
	it.each([
		[1, '1 с'],
		[45, '45 с'],
		[59, '59 с'],
		[60, '1 мин'],
		[61, '1 мин 1 с'],
		[125, '2 мин 5 с'],
		[900, '15 мин'],
	])('%i -> %s', (seconds, expected) => {
		expect(formatWait(seconds)).toBe(expected)
	})
})

describe('parseRetryAfter', () => {
	it.each([
		['30', 30],
		['900', 900],
	])('%s -> %i', (header, expected) => {
		expect(parseRetryAfter(header)).toBe(expected)
	})

	it.each([['0'], [''], [null], [undefined], ['-5'], ['1.5'], ['Wed, 21 Oct 2026 07:28:00 GMT'], ['30s'], [' 30']])(
		'%s -> null',
		(header) => {
			expect(parseRetryAfter(header)).toBeNull()
		}
	)
})

describe('loginErrorText', () => {
	it.each([
		[400, 'Пожалуйста, введите логин и пароль'],
		[401, 'Неверный логин или пароль'],
		[403, 'Аккаунт не активирован. Обратитесь к администратору.'],
		[500, 'Не удалось войти. Попробуйте ещё раз.'],
		[502, 'Не удалось войти. Попробуйте ещё раз.'],
		[418, 'Не удалось войти. Попробуйте ещё раз.'],
	])('%i -> %s', (status, expected) => {
		expect(loginErrorText(status)).toBe(expected)
	})
})

import { describe, expect, it } from 'vitest'

import { formatWait, loginFailure } from './login-errors'

const NOW = Date.parse('2026-10-06T10:00:00.000Z')

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

describe('loginFailure', () => {
	it.each([
		['30', 30],
		['900', 900],
	])('429 с Retry-After %s -> ожидание %i с', (header, seconds) => {
		expect(loginFailure(429, header, 'ivan', NOW)).toEqual({
			kind: 'wait',
			until: NOW + seconds * 1000,
			initial: seconds,
			login: 'ivan',
		})
	})

	it.each([['0'], [''], [null], [undefined], ['-5'], ['1.5'], ['Wed, 21 Oct 2026 07:28:00 GMT'], ['30s'], [' 30']])(
		'429 с Retry-After %s -> later',
		(header) => {
			expect(loginFailure(429, header, 'ivan', NOW)).toEqual({ kind: 'later' })
		}
	)

	it.each([
		[400, 'Пожалуйста, введите логин и пароль'],
		[401, 'Неверный логин или пароль'],
		[403, 'Аккаунт не активирован. Обратитесь к администратору.'],
		[500, 'Не удалось войти. Попробуйте ещё раз.'],
		[502, 'Не удалось войти. Попробуйте ещё раз.'],
		[418, 'Не удалось войти. Попробуйте ещё раз.'],
	])('%i -> %s', (status, text) => {
		expect(loginFailure(status, null, 'ivan', NOW)).toEqual({ kind: 'text', text })
	})
})

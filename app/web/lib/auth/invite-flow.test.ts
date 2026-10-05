import assert from 'node:assert/strict'
import { describe, test } from 'vitest'

import {
	ACCEPT_FAILED_TEXT,
	ACTIVATED_LOGIN_MANUALLY_TEXT,
	inviteAcceptErrorText,
	inviteValidationOutcome,
	loginAfterAcceptText,
} from './invite-flow'

describe('inviteValidationOutcome', () => {
	test('200 — приглашение действительно, поля из тела', () => {
		assert.deepEqual(inviteValidationOutcome(200, { firstName: 'Иван', lastName: 'Петров', login: 'ivan' }), {
			valid: true,
			firstName: 'Иван',
			lastName: 'Петров',
			login: 'ivan',
		})
	})

	test('200 без полей — пустые строки', () => {
		assert.deepEqual(inviteValidationOutcome(200, { firstName: null }), {
			valid: true,
			firstName: '',
			lastName: '',
			login: '',
		})
	})

	test.each(
		[
			{ name: '404, 410 и 500', statuses: [404, 410, 500], body: { error: 'x' } as unknown },
			{ name: '200 с телом не объектом', statuses: [200], body: null as unknown },
		].map((row): [string, typeof row] => [row.name, row])
	)('%s — недействительно', (_name, { statuses, body }) => {
		for (const status of statuses) {
			assert.deepEqual(inviteValidationOutcome(status, body), {
				valid: false,
				firstName: '',
				lastName: '',
				login: '',
			})
		}
	})
})

describe('inviteAcceptErrorText', () => {
	test.each(
		(
			[
				{
					name: 'первая ошибка поля логина',
					cases: [[{ details: { fieldErrors: { login: ['Логин занят'] } } }, 'Логин занят']],
				},
				{
					name: 'порядок полей: логин, пароль, токен, затем error',
					cases: [
						[{ details: { fieldErrors: { password: ['Короткий пароль'], token: ['Токен'] } } }, 'Короткий пароль'],
						[{ details: { fieldErrors: { token: ['Токен'] } } }, 'Токен'],
						[{ error: 'Текст', details: { fieldErrors: {} } }, 'Текст'],
					],
				},
				{ name: 'текст error сервера', cases: [[{ error: 'Текст' }, 'Текст']] },
			] as { name: string; cases: [unknown, string][] }[]
		).map((row): [string, typeof row] => [row.name, row])
	)('%s', (_name, { cases }) => {
		for (const [body, expected] of cases) {
			assert.equal(inviteAcceptErrorText(body), expected)
		}
	})

	test('иное — запасной текст', () => {
		for (const body of [null, undefined, 'строка', {}, { details: { fieldErrors: {} } }, { error: 42 }]) {
			assert.equal(inviteAcceptErrorText(body), ACCEPT_FAILED_TEXT)
		}
		assert.equal(ACCEPT_FAILED_TEXT, 'Ошибка. Попробуйте позже.')
	})
})

describe('loginAfterAcceptText', () => {
	test('успешный вход — без текста, переход на /dashboard', () => {
		assert.equal(loginAfterAcceptText(200), null)
	})

	test.each(
		[
			{ name: '401 входа после принятия — учётная запись активирована, войти вручную', statuses: [401] },
			{ name: '429, 500 и сбой сети — тот же текст', statuses: [429, 500, 0] },
		].map((row): [string, typeof row] => [row.name, row])
	)('%s', (_name, { statuses }) => {
		for (const status of statuses) {
			assert.equal(loginAfterAcceptText(status), ACTIVATED_LOGIN_MANUALLY_TEXT)
		}
		assert.equal(
			ACTIVATED_LOGIN_MANUALLY_TEXT,
			'Готово! Учётная запись активирована. Теперь вы можете войти по логину.'
		)
	})
})

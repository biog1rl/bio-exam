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

	test('404, 410 и 500 — недействительно', () => {
		for (const status of [404, 410, 500]) {
			assert.deepEqual(inviteValidationOutcome(status, { error: 'x' }), {
				valid: false,
				firstName: '',
				lastName: '',
				login: '',
			})
		}
	})

	test('200 с телом не объектом — недействительно', () => {
		assert.equal(inviteValidationOutcome(200, null).valid, false)
	})
})

describe('inviteAcceptErrorText', () => {
	test('первая ошибка поля логина', () => {
		assert.equal(inviteAcceptErrorText({ details: { fieldErrors: { login: ['Логин занят'] } } }), 'Логин занят')
	})

	test('порядок полей: логин, пароль, токен, затем error', () => {
		assert.equal(
			inviteAcceptErrorText({ details: { fieldErrors: { password: ['Короткий пароль'], token: ['Токен'] } } }),
			'Короткий пароль'
		)
		assert.equal(inviteAcceptErrorText({ details: { fieldErrors: { token: ['Токен'] } } }), 'Токен')
		assert.equal(inviteAcceptErrorText({ error: 'Текст', details: { fieldErrors: {} } }), 'Текст')
	})

	test('текст error сервера', () => {
		assert.equal(inviteAcceptErrorText({ error: 'Текст' }), 'Текст')
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

	test('401 входа после принятия — учётная запись активирована, войти вручную', () => {
		assert.equal(loginAfterAcceptText(401), ACTIVATED_LOGIN_MANUALLY_TEXT)
		assert.equal(
			ACTIVATED_LOGIN_MANUALLY_TEXT,
			'Готово! Учётная запись активирована. Теперь вы можете войти по логину.'
		)
	})

	test('429, 500 и сбой сети — тот же текст', () => {
		for (const status of [429, 500, 0]) {
			assert.equal(loginAfterAcceptText(status), ACTIVATED_LOGIN_MANUALLY_TEXT)
		}
	})
})

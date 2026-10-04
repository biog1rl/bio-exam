import { describe, expect, it } from 'vitest'

import {
	actionErrorText,
	clearConfirmText,
	clearSuccessText,
	OWN_ACCOUNT_REVOKE_HINT,
	revokeConfirmText,
	revokeSuccessText,
	sessionActionsState,
} from './session-actions'

const ivan = { id: 'u-ivan', login: 'ivan' }

describe('sessionActionsState', () => {
	it('hides the block without users.edit', () => {
		expect(sessionActionsState({ meId: 'u-admin', user: ivan, canEdit: false, pending: false }).visible).toBe(false)
	})

	it('enables both actions for another user', () => {
		expect(sessionActionsState({ meId: 'u-admin', user: ivan, canEdit: true, pending: false })).toEqual({
			visible: true,
			revokeDisabled: false,
			revokeHint: null,
			clearDisabled: false,
		})
	})

	it('disables both actions without a user', () => {
		expect(sessionActionsState({ meId: 'u-admin', user: null, canEdit: true, pending: false })).toEqual({
			visible: true,
			revokeDisabled: true,
			revokeHint: null,
			clearDisabled: true,
		})
	})

	it('disables revoke on the own account with a hint and keeps clear available', () => {
		expect(sessionActionsState({ meId: 'u-ivan', user: ivan, canEdit: true, pending: false })).toEqual({
			visible: true,
			revokeDisabled: true,
			revokeHint: 'Выход завершает этот сеанс, смена пароля в профиле — остальные',
			clearDisabled: false,
		})
		expect(OWN_ACCOUNT_REVOKE_HINT).toBe('Выход завершает этот сеанс, смена пароля в профиле — остальные')
	})

	it('disables clear without a hint when the login is empty', () => {
		expect(
			sessionActionsState({ meId: 'u-admin', user: { id: 'u-x', login: '' }, canEdit: true, pending: false })
		).toEqual({
			visible: true,
			revokeDisabled: false,
			revokeHint: null,
			clearDisabled: true,
		})
	})

	it('disables both actions while a request is pending', () => {
		const state = sessionActionsState({ meId: 'u-admin', user: ivan, canEdit: true, pending: true })
		expect(state.revokeDisabled).toBe(true)
		expect(state.clearDisabled).toBe(true)
	})
})

describe('texts', () => {
	it('confirmations and successes', () => {
		expect(revokeConfirmText('ivan')).toBe(
			'Пользователь «ivan» выйдет на всех устройствах. Пароль не меняется, войти снова можно сразу.'
		)
		expect(clearConfirmText('ivan')).toBe(
			'Паузы после неверных паролей для логина «ivan» будут сброшены на всех адресах. Пользователь сможет войти сразу.'
		)
		expect(revokeSuccessText('ivan')).toBe('Сеансы пользователя «ivan» завершены')
		expect(clearSuccessText('ivan')).toBe('Ограничение входа для «ivan» снято')
	})

	it.each([
		['revoke', 500, 'Не удалось завершить сеансы. Попробуйте ещё раз.'],
		['clear', 500, 'Не удалось снять ограничение. Попробуйте ещё раз.'],
		['revoke', 404, 'Не удалось завершить сеансы. Попробуйте ещё раз.'],
		['clear', 0, 'Не удалось снять ограничение. Попробуйте ещё раз.'],
		['revoke', 403, 'Недостаточно прав для этого действия. Обратитесь к администратору.'],
		['clear', 403, 'Недостаточно прав для этого действия. Обратитесь к администратору.'],
	] as const)('actionErrorText(%s, %i)', (kind, status, expected) => {
		expect(actionErrorText(kind, status)).toBe(expected)
	})
})

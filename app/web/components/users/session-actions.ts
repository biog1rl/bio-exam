export type SessionActionKind = 'revoke' | 'clear'

export type SessionActionsInput = {
	meId: string | null
	user: { id: string; login: string | null } | null
	canEdit: boolean
	pending: boolean
}

export type SessionActionsState = {
	visible: boolean
	revokeDisabled: boolean
	revokeHint: string | null
	clearDisabled: boolean
}

export const OWN_ACCOUNT_REVOKE_HINT = 'Выход завершает этот сеанс, смена пароля в профиле — остальные'
export const FORBIDDEN_ACTION_TEXT = 'Недостаточно прав для этого действия. Обратитесь к администратору.'

export function sessionActionsState({ meId, user, canEdit, pending }: SessionActionsInput): SessionActionsState {
	if (!canEdit) return { visible: false, revokeDisabled: true, revokeHint: null, clearDisabled: true }
	if (!user) return { visible: true, revokeDisabled: true, revokeHint: null, clearDisabled: true }
	const ownAccount = meId !== null && meId === user.id
	return {
		visible: true,
		revokeDisabled: pending || ownAccount,
		revokeHint: ownAccount ? OWN_ACCOUNT_REVOKE_HINT : null,
		clearDisabled: pending || !user.login,
	}
}

export function revokeConfirmText(login: string): string {
	return `Пользователь «${login}» выйдет на всех устройствах. Пароль не меняется, войти снова можно сразу.`
}

export function clearConfirmText(login: string): string {
	return `Паузы после неверных паролей для логина «${login}» будут сброшены на всех адресах. Пользователь сможет войти сразу.`
}

export function revokeSuccessText(login: string): string {
	return `Сеансы пользователя «${login}» завершены`
}

export function clearSuccessText(login: string): string {
	return `Ограничение входа для «${login}» снято`
}

export function actionErrorText(kind: SessionActionKind, status: number): string {
	if (status === 403) return FORBIDDEN_ACTION_TEXT
	return kind === 'revoke'
		? 'Не удалось завершить сеансы. Попробуйте ещё раз.'
		: 'Не удалось снять ограничение. Попробуйте ещё раз.'
}

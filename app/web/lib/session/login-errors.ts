export const EMPTY_CREDENTIALS_TEXT = 'Пожалуйста, введите логин и пароль'
export const INVALID_CREDENTIALS_TEXT = 'Неверный логин или пароль'
export const NOT_ACTIVATED_TEXT = 'Аккаунт не активирован. Обратитесь к администратору.'
export const LOGIN_FAILED_TEXT = 'Не удалось войти. Попробуйте ещё раз.'
export const NETWORK_ERROR_TEXT = 'Не удалось связаться с сервером. Проверьте соединение.'
export const TOO_MANY_LATER_TEXT = 'Слишком много неудачных попыток входа. Попробуйте позже.'
export const READY_AGAIN_TEXT = 'Можно снова войти.'

export function TOO_MANY_WAIT_TEXT(wait: string): string {
	return `Слишком много неудачных попыток входа. Попробуйте через ${wait}.`
}

export function loginErrorText(status: number): string {
	if (status === 400) return EMPTY_CREDENTIALS_TEXT
	if (status === 401) return INVALID_CREDENTIALS_TEXT
	if (status === 403) return NOT_ACTIVATED_TEXT
	return LOGIN_FAILED_TEXT
}

export function parseRetryAfter(header: string | null | undefined): number | null {
	if (typeof header !== 'string' || !/^\d+$/.test(header)) return null
	const seconds = Number(header)
	return Number.isSafeInteger(seconds) && seconds > 0 ? seconds : null
}

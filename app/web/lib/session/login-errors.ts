export const EMPTY_CREDENTIALS_TEXT = 'Пожалуйста, введите логин и пароль'
export const INVALID_CREDENTIALS_TEXT = 'Неверный логин или пароль'
export const NOT_ACTIVATED_TEXT = 'Аккаунт не активирован. Обратитесь к администратору.'
export const LOGIN_FAILED_TEXT = 'Не удалось войти. Попробуйте ещё раз.'
export const NETWORK_ERROR_TEXT = 'Не удалось связаться с сервером. Проверьте соединение.'
export const TOO_MANY_LATER_TEXT = 'Слишком много неудачных попыток входа. Попробуйте позже.'
export const READY_AGAIN_TEXT = 'Можно снова войти.'

export function TOO_MANY_WAIT_TEXT(seconds: number): string {
	return `Слишком много неудачных попыток входа. Попробуйте через ${formatWait(seconds)}.`
}

function loginErrorText(status: number): string {
	if (status === 400) return EMPTY_CREDENTIALS_TEXT
	if (status === 401) return INVALID_CREDENTIALS_TEXT
	if (status === 403) return NOT_ACTIVATED_TEXT
	return LOGIN_FAILED_TEXT
}

function parseRetryAfter(header: string | null | undefined): number | null {
	if (typeof header !== 'string' || !/^\d+$/.test(header)) return null
	const seconds = Number(header)
	return Number.isSafeInteger(seconds) && seconds > 0 ? seconds : null
}

export function formatWait(seconds: number): string {
	const total = Math.max(0, Math.ceil(seconds))
	if (total < 60) return `${total} с`
	const minutes = Math.floor(total / 60)
	const rest = total % 60
	return rest > 0 ? `${minutes} мин ${rest} с` : `${minutes} мин`
}

export type LoginError =
	| { kind: 'none' }
	| { kind: 'text'; text: string }
	| { kind: 'wait'; until: number; initial: number; login: string }
	| { kind: 'later' }
	| { kind: 'ready' }

export function loginFailure(
	status: number,
	retryAfterHeader: string | null | undefined,
	login: string,
	nowMs: number
): LoginError {
	if (status !== 429) return { kind: 'text', text: loginErrorText(status) }
	const retryAfter = parseRetryAfter(retryAfterHeader)
	if (retryAfter === null) return { kind: 'later' }
	return { kind: 'wait', until: nowMs + retryAfter * 1000, initial: retryAfter, login }
}

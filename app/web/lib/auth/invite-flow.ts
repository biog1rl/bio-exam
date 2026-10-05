export const ACCEPT_FAILED_TEXT = 'Ошибка. Попробуйте позже.'
export const ACTIVATED_LOGIN_MANUALLY_TEXT = 'Готово! Учётная запись активирована. Теперь вы можете войти по логину.'

export type InviteValidation = { valid: boolean; firstName: string; lastName: string; login: string }

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function text(value: unknown): string {
	return typeof value === 'string' ? value : ''
}

function firstFieldError(errors: Record<string, unknown>, field: string): string {
	const list = errors[field]
	return Array.isArray(list) ? text(list[0]) : ''
}

function isSuccess(status: number): boolean {
	return status >= 200 && status < 300
}

export function inviteValidationOutcome(status: number, body: unknown): InviteValidation {
	const record = asRecord(body)
	if (!isSuccess(status) || !record) return { valid: false, firstName: '', lastName: '', login: '' }
	return {
		valid: true,
		firstName: text(record.firstName),
		lastName: text(record.lastName),
		login: text(record.login),
	}
}

export function inviteAcceptErrorText(body: unknown): string {
	const record = asRecord(body)
	if (!record) return ACCEPT_FAILED_TEXT
	const fieldErrors = asRecord(asRecord(record.details)?.fieldErrors)
	const fromFields = fieldErrors
		? firstFieldError(fieldErrors, 'login') ||
			firstFieldError(fieldErrors, 'password') ||
			firstFieldError(fieldErrors, 'token')
		: ''
	return fromFields || text(record.error) || ACCEPT_FAILED_TEXT
}

export function loginAfterAcceptText(status: number): string | null {
	return isSuccess(status) ? null : ACTIVATED_LOGIN_MANUALLY_TEXT
}

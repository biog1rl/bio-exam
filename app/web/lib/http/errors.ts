import { AuthExpiredError, RequestError, type RequestFailure } from './request'

const NETWORK_MESSAGE = 'Нет связи с сервером. Проверьте подключение и повторите попытку.'
const MALFORMED_MESSAGE = 'Сервер вернул некорректный ответ. Повторите попытку позже.'
const FORBIDDEN_MESSAGE = 'Недостаточно прав для этого действия. Обратитесь к администратору.'
const ARCHIVE_READ_FAILED_MESSAGE = 'Не удалось скачать архив. Попробуйте ещё раз.'

const CYRILLIC = /[а-яё]/i

export type LoadErrorView = { show: boolean; reason: string; canRetry: boolean }

export function readApiError(body: unknown): string | null {
	if (!body || typeof body !== 'object') return null
	const error = (body as Record<string, unknown>).error
	if (typeof error !== 'string') return null
	const text = error.trim()
	return text && CYRILLIC.test(text) ? text : null
}

export function failureMessage(failure: RequestFailure, fallback?: string): string {
	switch (failure.kind) {
		case 'network':
			return NETWORK_MESSAGE
		case 'malformed':
			return MALFORMED_MESSAGE
		case 'http': {
			const status = failure.status ?? 0
			if (status >= 500) return fallback ?? `Ошибка сервера (код ${status}).`
			const server = readApiError(failure.body)
			if (server) return server
			if (status === 403) return FORBIDDEN_MESSAGE
			return fallback ?? `Запрос отклонён (код ${status}).`
		}
		default:
			return ''
	}
}

export function failureOf(error: unknown): RequestFailure {
	if (error instanceof RequestError) {
		const failure: RequestFailure = { ok: false, kind: error.kind, message: error.message }
		if (error.status !== undefined) failure.status = error.status
		if (error.body !== undefined) failure.body = error.body
		return failure
	}
	if (error instanceof AuthExpiredError) return { ok: false, kind: 'auth', message: '' }
	return { ok: false, kind: 'network', message: NETWORK_MESSAGE }
}

export function loadErrorView(failure: RequestFailure): LoadErrorView {
	if (failure.kind === 'auth' || failure.kind === 'aborted') return { show: false, reason: '', canRetry: false }
	const terminal = failure.kind === 'http' && (failure.status === 403 || failure.status === 404)
	return { show: true, reason: failure.message || failureMessage(failure), canRetry: !terminal }
}

export function exportFailureMessage(failure: RequestFailure, fallback: string): string {
	if (failure.kind === 'network' && failure.status !== undefined) return ARCHIVE_READ_FAILED_MESSAGE
	if (failure.kind === 'http' && failure.status === 403) return FORBIDDEN_MESSAGE
	return failureMessage(failure, fallback)
}

import assert from 'node:assert/strict'
import { describe, test, vi } from 'vitest'

vi.mock('@/lib/session/client', () => ({
	apiFetch: vi.fn(),
	AuthExpiredError: class AuthExpiredError extends Error {},
}))

import { exportFailureMessage, failureMessage, failureOf, loadErrorView, readApiError } from './errors'
import { RequestError, type RequestFailure, type RequestFailureKind } from './request'

const NETWORK = 'Нет связи с сервером. Проверьте подключение и повторите попытку.'
const MALFORMED = 'Сервер вернул некорректный ответ. Повторите попытку позже.'
const FORBIDDEN = 'Недостаточно прав для этого действия. Обратитесь к администратору.'
const ARCHIVE = 'Не удалось скачать архив. Попробуйте ещё раз.'

function failure(kind: RequestFailureKind, status?: number, body?: unknown): RequestFailure {
	const value: RequestFailure = { ok: false, kind, message: '' }
	if (status !== undefined) value.status = status
	if (body !== undefined) value.body = body
	return value
}

describe('readApiError', () => {
	test('возвращает русский текст поля error', () => {
		assert.equal(readApiError({ error: 'Логин уже используется' }), 'Логин уже используется')
	})

	test('английский текст, пустая строка, не строка и чужая форма — null', () => {
		for (const body of [{ error: 'Forbidden' }, { error: '' }, { error: 42 }, { message: 'Ошибка' }, null, 'Ошибка']) {
			assert.equal(readApiError(body), null)
		}
	})

	test('одной кириллической буквы достаточно', () => {
		assert.equal(readApiError({ error: 'ZIP: ошибка' }), 'ZIP: ошибка')
		assert.equal(readApiError({ error: 'Ё' }), 'Ё')
	})
})

describe('failureMessage', () => {
	test('network и malformed — тексты Поверхности 2 с точкой', () => {
		assert.equal(failureMessage(failure('network')), NETWORK)
		assert.equal(failureMessage(failure('network', 200), 'Ошибка X'), NETWORK)
		assert.equal(failureMessage(failure('malformed', 200)), MALFORMED)
	})

	test('403 без текста или с английским — полный текст 403, даже при запасном тексте', () => {
		assert.equal(failureMessage(failure('http', 403)), FORBIDDEN)
		assert.equal(failureMessage(failure('http', 403, { error: 'Forbidden' })), FORBIDDEN)
		assert.equal(failureMessage(failure('http', 403, { error: 'Forbidden' }), 'Ошибка экспорта'), FORBIDDEN)
	})

	test('403 с русским текстом — текст сервера', () => {
		assert.equal(failureMessage(failure('http', 403, { error: 'Нет доступа к попытке' })), 'Нет доступа к попытке')
	})

	test('4xx с английским текстом — запасной текст вызывающего', () => {
		assert.equal(failureMessage(failure('http', 404, { error: 'User not found' }), 'Ошибка X'), 'Ошибка X')
	})

	test('4xx без русского текста и без запасного — «Запрос отклонён (код N).»', () => {
		assert.equal(failureMessage(failure('http', 409)), 'Запрос отклонён (код 409).')
		assert.equal(failureMessage(failure('http', 401, { error: 'Unauthorized' })), 'Запрос отклонён (код 401).')
	})

	test('4xx с русским текстом — текст сервера без изменений и без точки', () => {
		assert.equal(failureMessage(failure('http', 400, { error: 'Логин уже используется' })), 'Логин уже используется')
		assert.equal(
			failureMessage(failure('http', 400, { error: 'Логин уже используется' }), 'Ошибка сохранения'),
			'Логин уже используется'
		)
	})

	test('5xx — текст сервера не показывается даже на русском', () => {
		assert.equal(failureMessage(failure('http', 503, { error: 'Хранилище недоступно' })), 'Ошибка сервера (код 503).')
		assert.equal(failureMessage(failure('http', 503, { error: 'Хранилище недоступно' }), 'Ошибка X'), 'Ошибка X')
		assert.equal(failureMessage(failure('http', 500, { error: 'Internal Server Error' })), 'Ошибка сервера (код 500).')
	})

	test('auth и aborted — пустая строка', () => {
		assert.equal(failureMessage(failure('auth')), '')
		assert.equal(failureMessage(failure('aborted'), 'Ошибка X'), '')
	})
})

describe('loadErrorView', () => {
	test('auth и aborted — блок не показывается', () => {
		assert.equal(loadErrorView(failure('auth')).show, false)
		assert.equal(loadErrorView(failure('aborted')).show, false)
	})

	test('403 и 404 — без «Повторить»', () => {
		for (const status of [403, 404]) {
			const view = loadErrorView(failure('http', status))
			assert.equal(view.show, true)
			assert.equal(view.canRetry, false)
		}
	})

	test('network, malformed и прочие http — с «Повторить»', () => {
		const cases = [
			failure('network'),
			failure('malformed', 200),
			failure('http', 400),
			failure('http', 409),
			failure('http', 413),
			failure('http', 500),
		]
		for (const value of cases) {
			const view = loadErrorView(value)
			assert.equal(view.show, true)
			assert.equal(view.canRetry, true)
		}
	})

	test('причина — текст отказа', () => {
		assert.equal(loadErrorView(failure('network')).reason, NETWORK)
		assert.equal(loadErrorView(failure('http', 403)).reason, FORBIDDEN)
		assert.equal(loadErrorView(failure('http', 502)).reason, 'Ошибка сервера (код 502).')
		assert.equal(loadErrorView({ ...failure('http', 400), message: 'Ошибка X' }).reason, 'Ошибка X')
	})
})

describe('failureOf', () => {
	test('RequestError отдаёт свои поля', () => {
		const error = new RequestError({
			ok: false,
			kind: 'http',
			status: 409,
			message: 'Запрос отклонён (код 409).',
			body: { error: 'Conflict' },
		})
		assert.deepEqual(failureOf(error), {
			ok: false,
			kind: 'http',
			status: 409,
			message: 'Запрос отклонён (код 409).',
			body: { error: 'Conflict' },
		})
	})

	test('RequestError auth — пустой текст', () => {
		const result = failureOf(new RequestError({ ok: false, kind: 'auth', message: '' }))
		assert.equal(result.kind, 'auth')
		assert.equal(result.message, '')
	})

	test('прочие ошибки — network', () => {
		for (const error of [new Error('boom'), new TypeError('Failed to fetch'), 'строка', undefined]) {
			const result = failureOf(error)
			assert.equal(result.kind, 'network')
			assert.equal(result.message, NETWORK)
		}
	})
})

describe('exportFailureMessage', () => {
	test('network со status — обрыв чтения архива', () => {
		assert.equal(exportFailureMessage(failure('network', 200), 'Ошибка экспорта'), ARCHIVE)
	})

	test('network без status — текст network', () => {
		assert.equal(exportFailureMessage(failure('network'), 'Ошибка экспорта'), NETWORK)
	})

	test('413 с русским текстом — текст сервера', () => {
		const text = 'Архив слишком большой для выгрузки, экспортируйте тесты по отдельности'
		assert.equal(exportFailureMessage(failure('http', 413, { error: text }), 'Ошибка экспорта'), text)
	})

	test('403 — текст 403', () => {
		assert.equal(exportFailureMessage(failure('http', 403, { error: 'Forbidden' }), 'Ошибка экспорта'), FORBIDDEN)
	})

	test('прочий http — запасной текст экспорта', () => {
		assert.equal(
			exportFailureMessage(failure('http', 404, { error: 'Test not found' }), 'Ошибка экспорта'),
			'Ошибка экспорта'
		)
		assert.equal(exportFailureMessage(failure('http', 500), 'Ошибка экспорта'), 'Ошибка экспорта')
	})

	test('auth — пусто', () => {
		assert.equal(exportFailureMessage(failure('auth'), 'Ошибка экспорта'), '')
	})
})

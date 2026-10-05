import assert from 'node:assert/strict'
import { describe, test, vi } from 'vitest'

vi.mock('@/lib/session/client', () => ({
	apiFetch: vi.fn(),
	AuthExpiredError: class AuthExpiredError extends Error {},
}))

import { AuthExpiredError } from '@/lib/session/client'

import { createRequester, MalformedBodyError, RequestError } from './request'

type Call = { url: string; init?: RequestInit }

function fake(reply: Response | Error | ((call: Call) => Response | Promise<Response>)) {
	const calls: Call[] = []
	const fetchImpl = async (url: string, init?: RequestInit): Promise<Response> => {
		calls.push({ url, init })
		if (reply instanceof Error) throw reply
		if (typeof reply === 'function') return reply({ url, init })
		return reply
	}
	return { calls, ...createRequester(fetchImpl) }
}

function json(status: number, body: unknown, headers?: Record<string, string>): Response {
	return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })
}

function parseValue(body: unknown): { value: string } {
	if (!body || typeof body !== 'object' || typeof (body as { value?: unknown }).value !== 'string') {
		throw new MalformedBodyError()
	}
	return { value: (body as { value: string }).value }
}

describe('request', () => {
	test('200 с JSON даёт ok, status и data', async () => {
		const { request } = fake(json(200, { value: 'week' }))
		assert.deepEqual(await request('/x'), { ok: true, status: 200, data: { value: 'week' } })
	})

	test('parse применяется к телу 2xx', async () => {
		const { request } = fake(json(200, { value: 'month', extra: 1 }))
		assert.deepEqual(await request('/x', { parse: parseValue }), { ok: true, status: 200, data: { value: 'month' } })
	})

	test('parse бросил MalformedBodyError — отказ malformed со status', async () => {
		const { request } = fake(json(200, { error: 'Forbidden' }))
		const outcome = await request('/x', { parse: parseValue })
		assert.equal(outcome.ok, false)
		if (outcome.ok) return
		assert.equal(outcome.kind, 'malformed')
		assert.equal(outcome.status, 200)
		assert.equal(outcome.message, 'Сервер вернул некорректный ответ. Повторите попытку позже.')
	})

	test('204 и пустое тело дают undefined', async () => {
		const noContent = fake(new Response(null, { status: 204 }))
		assert.deepEqual(await noContent.request('/x'), { ok: true, status: 204, data: undefined })
		const empty = fake(new Response('', { status: 200 }))
		assert.deepEqual(await empty.request('/x'), { ok: true, status: 200, data: undefined })
	})

	test('невалидный JSON при 2xx — malformed', async () => {
		const { request } = fake(new Response('<html>oops</html>', { status: 200 }))
		const outcome = await request('/x')
		assert.equal(outcome.ok, false)
		if (outcome.ok) return
		assert.equal(outcome.kind, 'malformed')
		assert.equal(outcome.status, 200)
	})

	test('500 с { error } — http, status, body сохранён, тело прочитано', async () => {
		const response = json(500, { error: 'Internal Server Error' })
		const { request } = fake(response)
		const outcome = await request('/x')
		assert.equal(outcome.ok, false)
		if (outcome.ok) return
		assert.equal(outcome.kind, 'http')
		assert.equal(outcome.status, 500)
		assert.deepEqual(outcome.body, { error: 'Internal Server Error' })
		assert.equal(response.bodyUsed, true)
	})

	test('не-2xx без JSON — http без body', async () => {
		const { request } = fake(new Response('Bad Gateway', { status: 502 }))
		const outcome = await request('/x')
		assert.equal(outcome.ok, false)
		if (outcome.ok) return
		assert.equal(outcome.kind, 'http')
		assert.equal(outcome.status, 502)
		assert.equal(outcome.body, undefined)
	})

	test('AuthExpiredError из apiFetch — auth', async () => {
		const { request } = fake(new AuthExpiredError())
		const outcome = await request('/x')
		assert.equal(outcome.ok, false)
		if (outcome.ok) return
		assert.equal(outcome.kind, 'auth')
		assert.equal(outcome.message, '')
	})

	test('401 при недоступном refresh — http 401', async () => {
		const { request } = fake(json(401, { error: 'Unauthorized' }))
		const outcome = await request('/x')
		assert.equal(outcome.ok, false)
		if (outcome.ok) return
		assert.equal(outcome.kind, 'http')
		assert.equal(outcome.status, 401)
	})

	test('fetch бросил TypeError — network', async () => {
		const { request } = fake(new TypeError('Failed to fetch'))
		const outcome = await request('/x')
		assert.equal(outcome.ok, false)
		if (outcome.ok) return
		assert.equal(outcome.kind, 'network')
		assert.equal(outcome.status, undefined)
		assert.equal(outcome.message, 'Нет связи с сервером. Проверьте подключение и повторите попытку.')
	})

	test('отменённый signal — aborted', async () => {
		const controller = new AbortController()
		controller.abort()
		const { request } = fake(new DOMException('The operation was aborted.', 'AbortError'))
		const outcome = await request('/x', { signal: controller.signal })
		assert.equal(outcome.ok, false)
		if (outcome.ok) return
		assert.equal(outcome.kind, 'aborted')
		assert.equal(outcome.message, '')
	})

	test('json сериализуется с Content-Type, метод и cache доходят до транспорта', async () => {
		const { request, calls } = fake(json(200, { value: 'all' }))
		await request('/x', { method: 'PUT', json: { value: 'all' } })
		const init = calls[0]?.init
		assert.equal(init?.method, 'PUT')
		assert.equal(init?.body, JSON.stringify({ value: 'all' }))
		assert.equal(new Headers(init?.headers).get('content-type'), 'application/json')
		assert.equal(init?.cache, 'no-store')
	})

	test('json без метода уходит POST', async () => {
		const { request, calls } = fake(json(200, {}))
		await request('/x', { json: { a: 1 } })
		assert.equal(calls[0]?.init?.method, 'POST')
	})

	test('GET без тела не ставит Content-Type', async () => {
		const { request, calls } = fake(json(200, {}))
		await request('/x')
		assert.equal(new Headers(calls[0]?.init?.headers).has('content-type'), false)
		assert.equal(calls[0]?.init?.body, undefined)
	})

	test('FormData передаётся как есть без Content-Type', async () => {
		const { request, calls } = fake(json(200, {}))
		const form = new FormData()
		form.set('file', 'x')
		await request('/upload', { method: 'POST', body: form })
		assert.equal(calls[0]?.init?.body, form)
		assert.equal(new Headers(calls[0]?.init?.headers).has('content-type'), false)
	})

	test('keepalive, signal, cache и заголовки вызывающего доходят до транспорта', async () => {
		const controller = new AbortController()
		const { request, calls } = fake(json(200, {}))
		await request('/x', {
			method: 'POST',
			json: {},
			keepalive: true,
			signal: controller.signal,
			cache: 'default',
			headers: { 'X-Trace': '1' },
		})
		const init = calls[0]?.init
		assert.equal(init?.keepalive, true)
		assert.equal(init?.signal, controller.signal)
		assert.equal(init?.cache, 'default')
		assert.equal(new Headers(init?.headers).get('x-trace'), '1')
	})

	test('fallbackMessage попадает в message отказа 4xx без русского текста', async () => {
		const { request } = fake(json(400, { error: 'Bad request' }))
		const outcome = await request('/x', { fallbackMessage: 'Ошибка сохранения' })
		assert.equal(outcome.ok, false)
		if (outcome.ok) return
		assert.equal(outcome.message, 'Ошибка сохранения')
	})
})

describe('requestJson', () => {
	test('при ok возвращает data', async () => {
		const { requestJson } = fake(json(200, { value: 'week' }))
		assert.deepEqual(await requestJson('/x', { parse: parseValue }), { value: 'week' })
	})

	test('при отказе бросает RequestError с kind, status и body', async () => {
		const { requestJson } = fake(json(404, { error: 'Test not found' }))
		await assert.rejects(requestJson('/x'), (error: unknown) => {
			assert.ok(error instanceof RequestError)
			assert.equal(error.kind, 'http')
			assert.equal(error.status, 404)
			assert.deepEqual(error.body, { error: 'Test not found' })
			return true
		})
	})

	test('auth приходит как RequestError kind auth', async () => {
		const { requestJson } = fake(new AuthExpiredError())
		await assert.rejects(requestJson('/x'), (error: unknown) => {
			assert.ok(error instanceof RequestError)
			assert.equal(error.kind, 'auth')
			return true
		})
	})
})

describe('requestBlob', () => {
	function zip(headers?: Record<string, string>): Response {
		return new Response(new Uint8Array([0x50, 0x4b, 0x05, 0x06]), { status: 200, headers })
	}

	test('имя из filename="…"', async () => {
		const { requestBlob } = fake(zip({ 'content-disposition': 'attachment; filename="a.zip"' }))
		const outcome = await requestBlob('/export', { filename: 'test.zip' })
		assert.equal(outcome.ok, true)
		if (!outcome.ok) return
		assert.equal(outcome.data.filename, 'a.zip')
		assert.equal(outcome.data.blob.size, 4)
	})

	test("имя из filename*=UTF-8''… важнее filename", async () => {
		const { requestBlob } = fake(
			zip({
				'content-disposition': `attachment; filename="tema.zip"; filename*=UTF-8''${encodeURIComponent('тема.zip')}`,
			})
		)
		const outcome = await requestBlob('/export', { filename: 'test.zip' })
		assert.equal(outcome.ok, true)
		if (!outcome.ok) return
		assert.equal(outcome.data.filename, 'тема.zip')
	})

	test('без Content-Disposition — запасное имя вызывающего', async () => {
		const { requestBlob } = fake(zip())
		const outcome = await requestBlob('/export', { filename: 'biology.zip' })
		assert.equal(outcome.ok, true)
		if (!outcome.ok) return
		assert.equal(outcome.data.filename, 'biology.zip')
	})

	test('чтение тела оборвалось после 200 — network со status 200', async () => {
		const body = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(new Uint8Array([0x50, 0x4b]))
				controller.error(new TypeError('terminated'))
			},
		})
		const { requestBlob } = fake(new Response(body, { status: 200 }))
		const outcome = await requestBlob('/export', { filename: 'test.zip', fallbackMessage: 'Ошибка экспорта' })
		assert.equal(outcome.ok, false)
		if (outcome.ok) return
		assert.equal(outcome.kind, 'network')
		assert.equal(outcome.status, 200)
	})

	test('413 с JSON error — http 413 с body', async () => {
		const text = 'Архив слишком большой для выгрузки, экспортируйте тесты по отдельности'
		const response = json(413, { error: text })
		const { requestBlob } = fake(response)
		const outcome = await requestBlob('/export', { filename: 'test.zip', fallbackMessage: 'Ошибка экспорта' })
		assert.equal(outcome.ok, false)
		if (outcome.ok) return
		assert.equal(outcome.kind, 'http')
		assert.equal(outcome.status, 413)
		assert.deepEqual(outcome.body, { error: text })
		assert.equal(outcome.message, text)
		assert.equal(response.bodyUsed, true)
	})

	test('fetch бросил — network без status', async () => {
		const { requestBlob } = fake(new TypeError('Failed to fetch'))
		const outcome = await requestBlob('/export', { filename: 'test.zip' })
		assert.equal(outcome.ok, false)
		if (outcome.ok) return
		assert.equal(outcome.kind, 'network')
		assert.equal(outcome.status, undefined)
	})

	test('по умолчанию GET с cache no-store', async () => {
		const { requestBlob, calls } = fake(zip())
		await requestBlob('/export', { filename: 'test.zip' })
		assert.equal(calls[0]?.init?.method, 'GET')
		assert.equal(calls[0]?.init?.cache, 'no-store')
	})
})

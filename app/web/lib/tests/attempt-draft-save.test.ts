import assert from 'node:assert/strict'
import { afterEach, test, vi } from 'vitest'

import { KEEPALIVE_BODY_LIMIT_BYTES, saveAttemptDraft } from './api'

const Q1 = '22222222-2222-4222-8222-222222222222'
const URL = '/api/tests/public/tests/t1/sessions/s1/answers'

function stubFetch(reply: () => Promise<Response>) {
	const fetchMock = vi.fn((_url: string, _init?: RequestInit) => reply())
	vi.stubGlobal('fetch', fetchMock)
	return fetchMock
}

function respond(status: number) {
	return stubFetch(async () => new Response(null, { status }))
}

afterEach(() => {
	vi.unstubAllGlobals()
})

test('KEEPALIVE_BODY_LIMIT_BYTES равен 60000', () => {
	assert.equal(KEEPALIVE_BODY_LIMIT_BYTES, 60_000)
})

test('saveAttemptDraft шлёт PATCH черновика попытки одним запросом', async () => {
	const fetchMock = respond(200)
	const body = { questionId: Q1, value: 'a' }
	const result = await saveAttemptDraft('t1', 's1', body, { keepalive: false })
	assert.deepEqual(result, { kind: 'response', status: 200 })
	assert.equal(fetchMock.mock.calls.length, 1)
	const [url, init] = fetchMock.mock.calls[0]!
	assert.equal(url, URL)
	assert.equal(init?.method, 'PATCH')
	assert.equal(init?.credentials, 'include')
	assert.equal(new Headers(init?.headers).get('Content-Type'), 'application/json')
	assert.equal(init?.body, JSON.stringify(body))
	assert.equal(init?.keepalive, false)
})

test('saveAttemptDraft возвращает статус любого ответа', async () => {
	for (const status of [200, 400, 403, 404, 500]) {
		respond(status)
		assert.deepEqual(await saveAttemptDraft('t1', 's1', { telemetry: {} }, { keepalive: false }), {
			kind: 'response',
			status,
		})
		vi.unstubAllGlobals()
	}
})

test('saveAttemptDraft при исключении fetch возвращает network', async () => {
	stubFetch(async () => {
		throw new TypeError('Failed to fetch')
	})
	assert.deepEqual(await saveAttemptDraft('t1', 's1', { questionId: Q1, value: 'a' }, { keepalive: false }), {
		kind: 'network',
	})
})

test('saveAttemptDraft с keepalive и малым телом шлёт fetch с keepalive true', async () => {
	const fetchMock = respond(200)
	const result = await saveAttemptDraft('t1', 's1', { questionId: Q1, value: 'a' }, { keepalive: true })
	assert.deepEqual(result, { kind: 'response', status: 200 })
	assert.equal(fetchMock.mock.calls.length, 1)
	assert.equal(fetchMock.mock.calls[0]![1]?.keepalive, true)
})

test('saveAttemptDraft с keepalive и телом больше лимита в байтах UTF-8 не шлёт запрос', async () => {
	const fetchMock = respond(200)
	const value = 'я'.repeat(31_000)
	const body = { questionId: Q1, value }
	assert.ok(JSON.stringify(body).length < KEEPALIVE_BODY_LIMIT_BYTES)
	assert.ok(new TextEncoder().encode(JSON.stringify(body)).length > KEEPALIVE_BODY_LIMIT_BYTES)
	assert.deepEqual(await saveAttemptDraft('t1', 's1', body, { keepalive: true }), { kind: 'too-large' })
	assert.equal(fetchMock.mock.calls.length, 0)
})

test('saveAttemptDraft без keepalive шлёт большое тело', async () => {
	const fetchMock = respond(200)
	const body = { questionId: Q1, value: 'я'.repeat(31_000) }
	assert.deepEqual(await saveAttemptDraft('t1', 's1', body, { keepalive: false }), { kind: 'response', status: 200 })
	assert.equal(fetchMock.mock.calls.length, 1)
})

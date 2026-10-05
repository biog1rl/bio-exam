import assert from 'node:assert/strict'
import { beforeEach, describe, test, vi } from 'vitest'

vi.mock('@/lib/session/client', () => ({
	apiFetch: vi.fn(),
	AuthExpiredError: class AuthExpiredError extends Error {},
}))

import { RequestError } from '@/lib/http/request'
import { apiFetch, AuthExpiredError } from '@/lib/session/client'

import {
	AttemptRequestError,
	fetchChartData,
	fetchChartDefaultRange,
	fetchMyTestAttempts,
	fetchPublicTestById,
	fetchPublicTestBySlug,
	fetchPublicTestsList,
	fetchPublicTestSummary,
	fetchTopicTests,
	KEEPALIVE_BODY_LIMIT_BYTES,
	saveAttemptDraft,
	startTestSession,
	submitPublicTestAnswers,
} from './api'

const apiFetchMock = vi.mocked(apiFetch)

const Q1 = '22222222-2222-4222-8222-222222222222'

function json(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function empty(status: number): Response {
	return new Response(null, { status })
}

function calledUrl(index = 0): string {
	return String(apiFetchMock.mock.calls[index]?.[0])
}

function calledInit(index = 0): RequestInit | undefined {
	return apiFetchMock.mock.calls[index]?.[1]
}

async function settle<T>(promise: Promise<T>): Promise<{ value?: T; error?: unknown }> {
	try {
		return { value: await promise }
	} catch (error) {
		return { error }
	}
}

beforeEach(() => {
	apiFetchMock.mockReset()
})

describe('saveAttemptDraft', () => {
	test('враждебный sessionId кодируется и не меняет путь и параметры', async () => {
		apiFetchMock.mockResolvedValueOnce(empty(200))
		const result = await saveAttemptDraft('t1', '../x?y', { questionId: Q1, value: 'a' }, { keepalive: true })
		assert.deepEqual(result, { kind: 'response', status: 200 })
		assert.equal(calledUrl(), '/api/tests/public/tests/t1/sessions/..%2Fx%3Fy/answers')
		const init = calledInit()
		assert.equal(init?.method, 'PATCH')
		assert.equal(init?.keepalive, true)
		assert.equal(init?.body, JSON.stringify({ questionId: Q1, value: 'a' }))
		assert.equal(new Headers(init?.headers).get('Content-Type'), 'application/json')
	})

	test('враждебный testId тоже кодируется', async () => {
		apiFetchMock.mockResolvedValueOnce(empty(200))
		await saveAttemptDraft('a/b#c', 's1', { telemetry: {} }, { keepalive: false })
		assert.equal(calledUrl(), '/api/tests/public/tests/a%2Fb%23c/sessions/s1/answers')
	})

	test('любой ответ сервера — response со статусом', async () => {
		for (const status of [200, 204, 400, 403, 404, 409, 500]) {
			apiFetchMock.mockResolvedValueOnce(status === 204 ? empty(204) : json(status, { error: 'x' }))
			assert.deepEqual(await saveAttemptDraft('t1', 's1', { telemetry: {} }, { keepalive: false }), {
				kind: 'response',
				status,
			})
		}
	})

	test('2xx с телом не JSON — тоже response', async () => {
		apiFetchMock.mockResolvedValueOnce(new Response('<html>', { status: 200 }))
		assert.deepEqual(await saveAttemptDraft('t1', 's1', { telemetry: {} }, { keepalive: false }), {
			kind: 'response',
			status: 200,
		})
	})

	test('сбой сети — network', async () => {
		apiFetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
		assert.deepEqual(await saveAttemptDraft('t1', 's1', { telemetry: {} }, { keepalive: false }), { kind: 'network' })
	})

	test('AuthExpiredError — network', async () => {
		apiFetchMock.mockRejectedValueOnce(new AuthExpiredError())
		assert.deepEqual(await saveAttemptDraft('t1', 's1', { telemetry: {} }, { keepalive: true }), { kind: 'network' })
	})

	test('тело больше лимита при keepalive — too-large без запроса', async () => {
		const body = { questionId: Q1, value: 'я'.repeat(31_000) }
		assert.ok(new TextEncoder().encode(JSON.stringify(body)).length > KEEPALIVE_BODY_LIMIT_BYTES)
		assert.deepEqual(await saveAttemptDraft('t1', 's1', body, { keepalive: true }), { kind: 'too-large' })
		assert.equal(apiFetchMock.mock.calls.length, 0)
	})
})

describe('startTestSession и submitPublicTestAnswers', () => {
	test('422 TIME_EXPIRED при старте — AttemptRequestError с кодом и attemptId', async () => {
		apiFetchMock.mockResolvedValueOnce(json(422, { error: 'TIME_EXPIRED', attemptId: 'a1' }))
		const { error } = await settle(startTestSession('t1'))
		assert.ok(error instanceof AttemptRequestError)
		assert.equal(error.status, 422)
		assert.equal(error.code, 'TIME_EXPIRED')
		assert.equal(error.attemptId, 'a1')
		assert.equal(calledUrl(), '/api/tests/public/tests/t1/start')
		assert.equal(calledInit()?.method, 'POST')
	})

	test('422 TIME_EXPIRED при отправке — AttemptRequestError с кодом и attemptId', async () => {
		apiFetchMock.mockResolvedValueOnce(json(422, { error: 'TIME_EXPIRED', attemptId: 'a1' }))
		const request = { sessionId: 's1', clientAttemptId: 'c1', answers: {}, telemetry: {} }
		const { error } = await settle(submitPublicTestAnswers('t1', request as never))
		assert.ok(error instanceof AttemptRequestError)
		assert.equal(error.status, 422)
		assert.equal(error.code, 'TIME_EXPIRED')
		assert.equal(error.attemptId, 'a1')
		assert.equal(calledUrl(), '/api/tests/public/tests/t1/submit')
		const init = calledInit()
		assert.equal(init?.method, 'POST')
		assert.equal(init?.body, JSON.stringify(request))
		assert.equal(new Headers(init?.headers).get('Content-Type'), 'application/json')
	})

	test('отказ без тела — AttemptRequestError без кода', async () => {
		apiFetchMock.mockResolvedValueOnce(empty(403))
		const { error } = await settle(startTestSession('t1'))
		assert.ok(error instanceof AttemptRequestError)
		assert.equal(error.status, 403)
		assert.equal(error.code, null)
		assert.equal(error.attemptId, null)
	})

	test('сбой сети при старте — исключение, не AttemptRequestError', async () => {
		apiFetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
		const { error } = await settle(startTestSession('t1'))
		assert.ok(error instanceof Error)
		assert.ok(!(error instanceof AttemptRequestError))
	})

	test('успех отдаёт тело', async () => {
		const session = { sessionId: 's1', startedAt: '2026-01-01T00:00:00.000Z' }
		apiFetchMock.mockResolvedValueOnce(json(200, session))
		assert.deepEqual(await startTestSession('t 1'), session)
		assert.equal(calledUrl(), '/api/tests/public/tests/t%201/start')
	})
})

describe('чтение каталога ученика', () => {
	test('fetchPublicTestBySlug кодирует оба сегмента', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, { test: {}, questions: [] }))
		await fetchPublicTestBySlug('тема', 'тест')
		assert.equal(calledUrl(), '/api/tests/public/topics/%D1%82%D0%B5%D0%BC%D0%B0/tests/%D1%82%D0%B5%D1%81%D1%82')
	})

	test('fetchPublicTestSummary кодирует сегменты и оставляет view=summary', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, { test: {} }))
		await fetchPublicTestSummary('a?b', 'c/d')
		assert.equal(calledUrl(), '/api/tests/public/topics/a%3Fb/tests/c%2Fd?view=summary')
	})

	test('fetchPublicTestById, fetchTopicTests, fetchMyTestAttempts, fetchChartData кодируют сегменты', async () => {
		apiFetchMock.mockImplementation(async () => json(200, {}))
		await fetchPublicTestById('../x')
		await fetchTopicTests('a/b')
		await fetchMyTestAttempts('t?1', { offset: 0, limit: 5 })
		await fetchChartData('t#1', { from: '2026-01-01', to: '2026-02-01' })
		assert.deepEqual(
			apiFetchMock.mock.calls.map((call) => call[0]),
			[
				'/api/tests/public/tests/..%2Fx',
				'/api/tests/public/topics/a%2Fb/tests',
				'/api/tests/public/tests/t%3F1/attempts/me?offset=0&limit=5',
				'/api/tests/public/tests/t%231/chart-data?from=2026-01-01&to=2026-02-01',
			]
		)
	})

	test('fetchPublicTestsList отдаёт тело и шлёт GET', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, { tests: [] }))
		assert.deepEqual(await fetchPublicTestsList(), { tests: [] })
		assert.equal(calledUrl(), '/api/tests/public/tests')
		assert.equal(calledInit()?.method, 'GET')
		assert.equal(calledInit()?.cache, 'no-store')
	})

	test('отказ чтения — RequestError', async () => {
		apiFetchMock.mockResolvedValueOnce(json(500, { error: 'boom' }))
		const { error } = await settle(fetchPublicTestsList())
		assert.ok(error instanceof RequestError)
		assert.equal(error.kind, 'http')
		assert.equal(error.status, 500)
	})

	test('fetchChartDefaultRange при отказе отдаёт month', async () => {
		apiFetchMock.mockResolvedValueOnce(json(500, {}))
		assert.deepEqual(await fetchChartDefaultRange(), { value: 'month' })
		apiFetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
		assert.deepEqual(await fetchChartDefaultRange(), { value: 'month' })
		apiFetchMock.mockResolvedValueOnce(json(200, { value: 'week' }))
		assert.deepEqual(await fetchChartDefaultRange(), { value: 'week' })
	})
})

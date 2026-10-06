import assert from 'node:assert/strict'
import { beforeEach, describe, test, vi } from 'vitest'

vi.mock('@/lib/session/client', () => ({
	apiFetch: vi.fn(),
	AuthExpiredError: class AuthExpiredError extends Error {},
}))

import { apiFetch, AuthExpiredError } from '@/lib/session/client'

import {
	AttemptRequestError,
	fetchChartData,
	fetchMyTestAttempts,
	fetchPublicTestBySlug,
	fetchPublicTestSummary,
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
	test.each(
		[
			{
				name: 'враждебный sessionId кодируется и не меняет путь и параметры',
				testId: 't1',
				sessionId: '../x?y',
				body: { questionId: Q1, value: 'a' } as Parameters<typeof saveAttemptDraft>[2],
				keepalive: true,
				url: '/api/tests/public/tests/t1/sessions/..%2Fx%3Fy/answers',
			},
			{
				name: 'враждебный testId тоже кодируется',
				testId: 'a/b#c',
				sessionId: 's1',
				body: { telemetry: {} } as Parameters<typeof saveAttemptDraft>[2],
				keepalive: false,
				url: '/api/tests/public/tests/a%2Fb%23c/sessions/s1/answers',
			},
		].map((row): [string, typeof row] => [row.name, row])
	)('%s', async (_name, { testId, sessionId, body, keepalive, url }) => {
		apiFetchMock.mockResolvedValueOnce(empty(200))
		const result = await saveAttemptDraft(testId, sessionId, body, { keepalive })
		assert.deepEqual(result, { kind: 'response', status: 200 })
		assert.equal(calledUrl(), url)
		const init = calledInit()
		assert.equal(init?.method, 'PATCH')
		assert.equal(init?.keepalive, keepalive)
		assert.equal(init?.body, JSON.stringify(body))
		assert.equal(new Headers(init?.headers).get('Content-Type'), 'application/json')
	})

	test('2xx с телом не JSON — тоже response', async () => {
		apiFetchMock.mockResolvedValueOnce(new Response('<html>', { status: 200 }))
		assert.deepEqual(await saveAttemptDraft('t1', 's1', { telemetry: {} }, { keepalive: false }), {
			kind: 'response',
			status: 200,
		})
	})

	test('AuthExpiredError — network', async () => {
		apiFetchMock.mockRejectedValueOnce(new AuthExpiredError())
		assert.deepEqual(await saveAttemptDraft('t1', 's1', { telemetry: {} }, { keepalive: true }), { kind: 'network' })
	})
})

describe('startTestSession и submitPublicTestAnswers', () => {
	test.each(
		[
			{
				name: '422 TIME_EXPIRED при старте — AttemptRequestError с кодом и attemptId',
				request: undefined as Record<string, unknown> | undefined,
				url: '/api/tests/public/tests/t1/start',
			},
			{
				name: '422 TIME_EXPIRED при отправке — AttemptRequestError с кодом и attemptId',
				request: { sessionId: 's1', clientAttemptId: 'c1', answers: {}, telemetry: {} } as
					| Record<string, unknown>
					| undefined,
				url: '/api/tests/public/tests/t1/submit',
			},
		].map((row): [string, typeof row] => [row.name, row])
	)('%s', async (_name, { request, url }) => {
		apiFetchMock.mockResolvedValueOnce(json(422, { error: 'TIME_EXPIRED', attemptId: 'a1' }))
		const { error } = await settle<unknown>(
			request === undefined ? startTestSession('t1') : submitPublicTestAnswers('t1', request as never)
		)
		assert.ok(error instanceof AttemptRequestError)
		assert.equal(error.status, 422)
		assert.equal(error.code, 'TIME_EXPIRED')
		assert.equal(error.attemptId, 'a1')
		assert.equal(calledUrl(), url)
		const init = calledInit()
		assert.equal(init?.method, 'POST')
		if (request !== undefined) {
			assert.equal(init?.body, JSON.stringify(request))
			assert.equal(new Headers(init?.headers).get('Content-Type'), 'application/json')
		}
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
	test.each(
		[
			{
				name: 'fetchPublicTestBySlug кодирует оба сегмента',
				run: () => fetchPublicTestBySlug('тема', 'тест'),
				urls: ['/api/tests/public/topics/%D1%82%D0%B5%D0%BC%D0%B0/tests/%D1%82%D0%B5%D1%81%D1%82'],
			},
			{
				name: 'fetchPublicTestSummary кодирует сегменты и оставляет view=summary',
				run: () => fetchPublicTestSummary('a?b', 'c/d'),
				urls: ['/api/tests/public/topics/a%3Fb/tests/c%2Fd?view=summary'],
			},
			{
				name: 'fetchMyTestAttempts, fetchChartData кодируют сегменты',
				run: async () => {
					await fetchMyTestAttempts('t?1', { offset: 0, limit: 5 })
					await fetchChartData('t#1', { from: '2026-01-01', to: '2026-02-01' })
				},
				urls: [
					'/api/tests/public/tests/t%3F1/attempts/me?offset=0&limit=5',
					'/api/tests/public/tests/t%231/chart-data?from=2026-01-01&to=2026-02-01',
				],
			},
		].map((row): [string, typeof row] => [row.name, row])
	)('%s', async (_name, { run, urls }) => {
		apiFetchMock.mockImplementation(async () => json(200, { test: {}, questions: [] }))
		await run()
		assert.deepEqual(
			apiFetchMock.mock.calls.map((call) => call[0]),
			urls
		)
	})
})

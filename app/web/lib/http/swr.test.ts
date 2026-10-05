import assert from 'node:assert/strict'
import { beforeEach, describe, test, vi } from 'vitest'

vi.mock('@/lib/session/client', () => ({
	apiFetch: vi.fn(),
	AuthExpiredError: class AuthExpiredError extends Error {},
}))

import { apiFetch } from '@/lib/session/client'

import { MalformedBodyError, RequestError } from './request'
import { fetcherWith, swrFetcher } from './swr'

const apiFetchMock = vi.mocked(apiFetch)

function json(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

beforeEach(() => {
	apiFetchMock.mockReset()
})

describe('swrFetcher', () => {
	test('идёт через apiFetch по строке ключа и возвращает тело без преобразования', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, { items: [1, 2], extra: true }))
		assert.deepEqual(await swrFetcher('/x'), { items: [1, 2], extra: true })
		assert.equal(apiFetchMock.mock.calls.length, 1)
		assert.equal(apiFetchMock.mock.calls[0]?.[0], '/x')
		assert.equal(apiFetchMock.mock.calls[0]?.[1]?.cache, 'no-store')
	})

	test('отказ сервера бросает RequestError', async () => {
		apiFetchMock.mockResolvedValueOnce(json(500, { error: 'Internal Server Error' }))
		await assert.rejects(swrFetcher('/x'), (error: unknown) => {
			assert.ok(error instanceof RequestError)
			assert.equal(error.kind, 'http')
			assert.equal(error.status, 500)
			return true
		})
	})
})

describe('fetcherWith', () => {
	test('применяет parse к телу', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, { n: 2 }))
		const fetcher = fetcherWith((body: unknown) => ({ doubled: ((body as { n: number }).n ?? 0) * 2 }))
		assert.deepEqual(await fetcher('/x'), { doubled: 4 })
		assert.equal(apiFetchMock.mock.calls[0]?.[0], '/x')
	})

	test('MalformedBodyError из parse даёт RequestError kind malformed', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, { error: 'Forbidden' }))
		const fetcher = fetcherWith((): never => {
			throw new MalformedBodyError()
		})
		await assert.rejects(fetcher('/x'), (error: unknown) => {
			assert.ok(error instanceof RequestError)
			assert.equal(error.kind, 'malformed')
			assert.equal(error.status, 200)
			return true
		})
	})
})

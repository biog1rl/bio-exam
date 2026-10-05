import assert from 'node:assert/strict'
import { beforeEach, describe, test, vi } from 'vitest'

vi.mock('@/lib/session/client', () => ({
	apiFetch: vi.fn(),
	AuthExpiredError: class AuthExpiredError extends Error {},
}))

import { apiFetch } from '@/lib/session/client'

import { searchAll } from './api'

const apiFetchMock = vi.mocked(apiFetch)

function json(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

const RESPONSE = {
	query: 'клетка',
	total: 1,
	categories: [
		{
			scope: 'tests',
			title: 'Тесты',
			available: true,
			items: [
				{
					type: 'test',
					id: 't1',
					title: 'Клетка',
					subtitle: 'Биология · kletka',
					snippetHtml: '',
					href: '/admin/tests/biology/kletka',
					score: 1,
				},
			],
		},
	],
}

beforeEach(() => {
	apiFetchMock.mockReset()
})

describe('searchAll', () => {
	test('строит /api/search с q, scope и limit и отдаёт выдачу как есть', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, RESPONSE))
		const outcome = await searchAll('клетка', 'tests', 5)
		assert.deepEqual(outcome, { ok: true, status: 200, data: RESPONSE })
		const url = String(apiFetchMock.mock.calls[0]?.[0])
		const params = new URL(url, 'http://local').searchParams
		assert.ok(url.startsWith('/api/search?'))
		assert.equal(params.get('q'), 'клетка')
		assert.equal(params.get('scope'), 'tests')
		assert.equal(params.get('limit'), '5')
		assert.equal(apiFetchMock.mock.calls[0]?.[1]?.method, 'GET')
	})

	test('по умолчанию scope all и limit 10', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, RESPONSE))
		await searchAll('кл')
		const params = new URL(String(apiFetchMock.mock.calls[0]?.[0]), 'http://local').searchParams
		assert.equal(params.get('scope'), 'all')
		assert.equal(params.get('limit'), '10')
	})

	test('передаёт signal в запрос', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, RESPONSE))
		const controller = new AbortController()
		await searchAll('клетка', 'all', 10, controller.signal)
		assert.equal(apiFetchMock.mock.calls[0]?.[1]?.signal, controller.signal)
	})

	test('отменённый signal — aborted', async () => {
		const controller = new AbortController()
		controller.abort()
		apiFetchMock.mockRejectedValueOnce(new Error('The operation was aborted'))
		const outcome = await searchAll('клетка', 'all', 10, controller.signal)
		assert.equal(outcome.ok, false)
		if (outcome.ok) return
		assert.equal(outcome.kind, 'aborted')
		assert.equal(outcome.message, '')
	})

	test('500 — http 500 без текста сервера', async () => {
		apiFetchMock.mockResolvedValueOnce(json(500, { error: 'Internal Server Error' }))
		const outcome = await searchAll('клетка')
		assert.equal(outcome.ok, false)
		if (outcome.ok) return
		assert.equal(outcome.kind, 'http')
		assert.equal(outcome.status, 500)
		assert.equal(outcome.message, 'Ошибка сервера (код 500).')
	})

	test('сбой сети — network', async () => {
		apiFetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
		const outcome = await searchAll('клетка')
		assert.equal(outcome.ok, false)
		if (outcome.ok) return
		assert.equal(outcome.kind, 'network')
	})

	test('categories не массив — malformed', async () => {
		for (const body of [{ categories: null }, { query: 'x' }, [], null, 'x']) {
			apiFetchMock.mockResolvedValueOnce(json(200, body))
			const outcome = await searchAll('клетка')
			assert.equal(outcome.ok, false)
			if (outcome.ok) continue
			assert.equal(outcome.kind, 'malformed')
		}
	})
})

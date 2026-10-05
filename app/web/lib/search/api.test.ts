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
	test.each(
		[
			{
				name: 'строит /api/search с q, scope и limit и отдаёт выдачу как есть',
				args: ['клетка', 'tests', 5] as Parameters<typeof searchAll>,
				q: 'клетка',
				scope: 'tests',
				limit: '5',
			},
			{
				name: 'по умолчанию scope all и limit 10',
				args: ['кл'] as Parameters<typeof searchAll>,
				q: 'кл',
				scope: 'all',
				limit: '10',
			},
			{
				name: 'передаёт signal в запрос',
				args: ['клетка', 'all', 10, new AbortController().signal] as Parameters<typeof searchAll>,
				q: 'клетка',
				scope: 'all',
				limit: '10',
			},
		].map((row): [string, typeof row] => [row.name, row])
	)('%s', async (_name, { args, q, scope, limit }) => {
		apiFetchMock.mockResolvedValueOnce(json(200, RESPONSE))
		const outcome = await searchAll(...args)
		assert.deepEqual(outcome, { ok: true, status: 200, data: RESPONSE })
		const url = String(apiFetchMock.mock.calls[0]?.[0])
		const params = new URL(url, 'http://local').searchParams
		assert.ok(url.startsWith('/api/search?'))
		assert.equal(params.get('q'), q)
		assert.equal(params.get('scope'), scope)
		assert.equal(params.get('limit'), limit)
		const init = apiFetchMock.mock.calls[0]?.[1]
		assert.equal(init?.method, 'GET')
		if (args[3]) assert.equal(init?.signal, args[3])
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

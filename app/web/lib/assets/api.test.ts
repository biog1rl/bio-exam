import assert from 'node:assert/strict'
import { beforeEach, describe, test, vi } from 'vitest'

vi.mock('@/lib/session/client', () => ({
	apiFetch: vi.fn(),
	AuthExpiredError: class AuthExpiredError extends Error {},
}))

import { RequestError } from '@/lib/http/request'
import { apiFetch } from '@/lib/session/client'

import { fetchSignedUrl, listAssets, uploadAsset } from './api'

const apiFetchMock = vi.mocked(apiFetch)

function json(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

const ASSET = {
	filename: 'a.webp',
	path: 'images/a.webp',
	signedUrl: '/api/docs/assets/proxy?path=images%2Fa.webp',
	size: 10,
	createdAt: '2026-01-01T00:00:00.000Z',
}

beforeEach(() => {
	apiFetchMock.mockReset()
})

describe('listAssets', () => {
	test('GET /api/docs/assets?limit=&offset= отдаёт страницу', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, { assets: [ASSET], total: 1 }))
		const outcome = await listAssets(20, 0)
		assert.deepEqual(outcome, { ok: true, status: 200, data: { assets: [ASSET], total: 1 } })
		assert.equal(apiFetchMock.mock.calls[0]?.[0], '/api/docs/assets?limit=20&offset=0')
		assert.equal(apiFetchMock.mock.calls[0]?.[1]?.method, 'GET')
	})

	test('чужая форма — malformed', async () => {
		for (const body of [{ assets: null, total: 0 }, { assets: [] }, { error: 'x' }, null]) {
			apiFetchMock.mockResolvedValueOnce(json(200, body))
			const outcome = await listAssets(20, 0)
			assert.equal(outcome.ok, false)
			if (outcome.ok) continue
			assert.equal(outcome.kind, 'malformed')
		}
	})
})

describe('uploadAsset', () => {
	test('POST /api/docs/assets с FormData без Content-Type', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, { success: true, path: 'images/a.webp', filename: 'a.webp' }))
		const form = new FormData()
		form.append('file', new Blob(['x'], { type: 'image/webp' }), 'a.webp')
		form.append('docPath', 'biology/kletka')
		const outcome = await uploadAsset(form)
		assert.deepEqual(outcome, {
			ok: true,
			status: 200,
			data: { success: true, path: 'images/a.webp', filename: 'a.webp' },
		})
		const [url, init] = apiFetchMock.mock.calls[0] ?? []
		assert.equal(url, '/api/docs/assets')
		assert.equal(init?.method, 'POST')
		assert.equal(init?.body, form)
		const headers = (init?.headers ?? {}) as Record<string, string>
		assert.ok(!Object.keys(headers).some((name) => name.toLowerCase() === 'content-type'))
	})

	test('ответ без path — malformed', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, { success: true }))
		const outcome = await uploadAsset(new FormData())
		assert.equal(outcome.ok, false)
		if (outcome.ok) return
		assert.equal(outcome.kind, 'malformed')
	})
})

describe('fetchSignedUrl', () => {
	test('GET /api/docs/assets/signed?path=<encoded> отдаёт строку signedUrl', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, { signedUrl: '/api/docs/assets/proxy?path=images%2Fa.webp' }))
		assert.equal(await fetchSignedUrl('images/a b.webp'), '/api/docs/assets/proxy?path=images%2Fa.webp')
		assert.equal(apiFetchMock.mock.calls[0]?.[0], '/api/docs/assets/signed?path=images%2Fa%20b.webp')
	})

	test('ответ без строки signedUrl — исключение RequestError malformed', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, { signedUrl: 1 }))
		await assert.rejects(fetchSignedUrl('images/a.webp'), (error: unknown) => {
			assert.ok(error instanceof RequestError)
			assert.equal(error.kind, 'malformed')
			return true
		})
	})
})

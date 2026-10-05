import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/session/client', () => ({
	apiFetch: vi.fn(),
	AuthExpiredError: class AuthExpiredError extends Error {},
}))

import { apiFetch } from '@/lib/session/client'

import { getSignedUrl, prefetchSignedUrls, resolvesViaApi } from './image-signed-url-cache'

const fetchMock = vi.mocked(apiFetch)

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function okResponse(signedUrl: string): Response {
	return jsonResponse(200, { signedUrl })
}

function calledUrls(): string[] {
	return fetchMock.mock.calls.map(([url]) => String(url))
}

beforeEach(() => {
	fetchMock.mockReset()
})

afterEach(() => {
	vi.useRealTimers()
})

describe('resolvesViaApi', () => {
	it.each([
		'images/a.webp',
		'https://x.supabase.co/storage/v1/object/public/main/images/a.webp',
		'/uploads/images/a.webp',
		'uploads/images/a.webp',
		'https://example.com/a.png',
		'/api/docs/assets/proxy?path=images%2Fa.webp',
	])('%s разрешается через API', (src) => {
		expect(resolvesViaApi(src)).toBe(true)
	})

	it.each(['', 'data:image/png;base64,AA', 'blob:http://x/1'])('%s используется как есть', (src) => {
		expect(resolvesViaApi(src)).toBe(false)
	})
})

describe('getSignedUrl', () => {
	it('запрашивает /signed по src один раз и берёт кэш в пределах 50 минут', async () => {
		vi.useFakeTimers()
		vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
		fetchMock.mockImplementation(async () => okResponse('/api/docs/assets/proxy?path=images%2Fa.webp&v=1'))

		const first = await getSignedUrl('images/a.webp')
		vi.setSystemTime(new Date('2026-01-01T00:49:00Z'))
		const second = await getSignedUrl('images/a.webp')

		expect(first).toBe('/api/docs/assets/proxy?path=images%2Fa.webp&v=1')
		expect(second).toBe(first)
		expect(fetchMock).toHaveBeenCalledTimes(1)
		expect(calledUrls()).toEqual(['/api/docs/assets/signed?path=images%2Fa.webp'])
	})

	it('после 50 минут запрашивает URL заново', async () => {
		vi.useFakeTimers()
		vi.setSystemTime(new Date('2026-02-01T00:00:00Z'))
		fetchMock.mockImplementation(async () => okResponse('/api/docs/assets/proxy?path=images%2Fb.webp'))

		await getSignedUrl('images/b.webp')
		vi.setSystemTime(new Date('2026-02-01T00:51:00Z'))
		await getSignedUrl('images/b.webp')

		expect(fetchMock).toHaveBeenCalledTimes(2)
	})

	it('неуспешный ответ даёт исключение', async () => {
		fetchMock.mockImplementation(async () => jsonResponse(400, { error: 'Invalid path' }))

		await expect(getSignedUrl('images/missing.webp')).rejects.toThrow()
	})
})

describe('prefetchSignedUrls', () => {
	it('запрашивает только src, которые разрешаются через API, и не падает на ошибке', async () => {
		fetchMock.mockImplementation(async (url: string) =>
			url.includes('broken') ? jsonResponse(400, null) : okResponse('/ok')
		)

		await prefetchSignedUrls([
			'data:image/png;base64,AA',
			'blob:http://x/1',
			'',
			'images/broken.webp',
			'uploads/images/c.webp',
		])

		expect(calledUrls()).toEqual([
			'/api/docs/assets/signed?path=images%2Fbroken.webp',
			'/api/docs/assets/signed?path=uploads%2Fimages%2Fc.webp',
		])
	})
})

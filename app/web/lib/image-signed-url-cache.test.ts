import { afterEach, describe, expect, it, vi } from 'vitest'

import { getSignedUrl, prefetchSignedUrls, resolvesViaApi } from './image-signed-url-cache'

function okResponse(signedUrl: string) {
	return { ok: true, status: 200, json: async () => ({ signedUrl }) }
}

afterEach(() => {
	vi.unstubAllGlobals()
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
		const fetchMock = vi.fn(async () => okResponse('/api/docs/assets/proxy?path=images%2Fa.webp&v=1'))
		vi.stubGlobal('fetch', fetchMock)

		const first = await getSignedUrl('images/a.webp')
		vi.setSystemTime(new Date('2026-01-01T00:49:00Z'))
		const second = await getSignedUrl('images/a.webp')

		expect(first).toBe('/api/docs/assets/proxy?path=images%2Fa.webp&v=1')
		expect(second).toBe(first)
		expect(fetchMock).toHaveBeenCalledTimes(1)
		expect(fetchMock).toHaveBeenCalledWith('/api/docs/assets/signed?path=images%2Fa.webp')
	})

	it('после 50 минут запрашивает URL заново', async () => {
		vi.useFakeTimers()
		vi.setSystemTime(new Date('2026-02-01T00:00:00Z'))
		const fetchMock = vi.fn(async () => okResponse('/api/docs/assets/proxy?path=images%2Fb.webp'))
		vi.stubGlobal('fetch', fetchMock)

		await getSignedUrl('images/b.webp')
		vi.setSystemTime(new Date('2026-02-01T00:51:00Z'))
		await getSignedUrl('images/b.webp')

		expect(fetchMock).toHaveBeenCalledTimes(2)
	})

	it('неуспешный ответ даёт исключение', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => ({ ok: false, status: 400, json: async () => ({ error: 'Invalid path' }) }))
		)

		await expect(getSignedUrl('images/missing.webp')).rejects.toThrow()
	})
})

describe('prefetchSignedUrls', () => {
	it('запрашивает только src, которые разрешаются через API, и не падает на ошибке', async () => {
		const fetchMock = vi.fn(async (url: string) =>
			url.includes('broken') ? { ok: false, status: 400, json: async () => null } : okResponse('/ok')
		)
		vi.stubGlobal('fetch', fetchMock)

		await prefetchSignedUrls([
			'data:image/png;base64,AA',
			'blob:http://x/1',
			'',
			'images/broken.webp',
			'uploads/images/c.webp',
		])

		expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
			'/api/docs/assets/signed?path=images%2Fbroken.webp',
			'/api/docs/assets/signed?path=uploads%2Fimages%2Fc.webp',
		])
	})
})

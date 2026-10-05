import { fetchSignedUrl } from '@/lib/assets/api'

type CacheEntry = {
	signedUrl: string
	expiresAt: number
}

const cache = new Map<string, CacheEntry>()

const CACHE_TTL_MS = 50 * 60 * 1000

export function resolvesViaApi(src: string): boolean {
	return Boolean(src) && !src.startsWith('data:') && !src.startsWith('blob:')
}

export async function getSignedUrl(src: string): Promise<string> {
	const now = Date.now()
	const cached = cache.get(src)
	if (cached && cached.expiresAt > now) {
		return cached.signedUrl
	}

	const signedUrl = await fetchSignedUrl(src)

	cache.set(src, {
		signedUrl,
		expiresAt: now + CACHE_TTL_MS,
	})

	return signedUrl
}

export async function prefetchSignedUrls(srcs: string[]): Promise<void> {
	for (const src of srcs) {
		if (!resolvesViaApi(src)) continue
		try {
			await getSignedUrl(src)
		} catch {}
	}
}

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

	const response = await fetch(`/api/docs/assets/signed?path=${encodeURIComponent(src)}`)
	if (!response.ok) {
		throw new Error(`Failed to get signed URL for ${src}`)
	}
	const data: { signedUrl: string } = await response.json()

	cache.set(src, {
		signedUrl: data.signedUrl,
		expiresAt: now + CACHE_TTL_MS,
	})

	return data.signedUrl
}

export async function prefetchSignedUrls(srcs: string[]): Promise<void> {
	for (const src of srcs) {
		if (!resolvesViaApi(src)) continue
		try {
			await getSignedUrl(src)
		} catch {}
	}
}

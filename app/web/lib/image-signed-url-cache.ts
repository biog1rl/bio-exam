/**
 * Module-level cache для signed URLs изображений.
 * Ключ: storage path (e.g. "images/abc.webp")
 * Значение: { signedUrl, expiresAt (Date.now() + TTL) }
 *
 * TTL кэша: 50 минут (3000000 мс) — меньше чем серверный TTL 60 минут, чтобы URL не истёк в процессе использования.
 */

type CacheEntry = {
	signedUrl: string
	expiresAt: number
}

const cache = new Map<string, CacheEntry>()

const CACHE_TTL_MS = 50 * 60 * 1000 // 50 минут

/**
 * Определяет, является ли src storage path (а не URL/data URI).
 * Storage path: "images/abc123.webp" — не начинается с http, https, data:, blob:, /
 */
export function isStoragePath(src: string): boolean {
	return (
		Boolean(src) &&
		!src.startsWith('http') &&
		!src.startsWith('data:') &&
		!src.startsWith('blob:') &&
		!src.startsWith('/')
	)
}

/**
 * Получает signed URL для storage path. Использует кэш если URL ещё валидный.
 */
export async function getSignedUrl(storagePath: string): Promise<string> {
	const now = Date.now()
	const cached = cache.get(storagePath)
	if (cached && cached.expiresAt > now) {
		return cached.signedUrl
	}

	const response = await fetch(`/api/docs/assets/signed?path=${encodeURIComponent(storagePath)}`)
	if (!response.ok) {
		throw new Error(`Failed to get signed URL for ${storagePath}`)
	}
	const data: { signedUrl: string } = await response.json()

	cache.set(storagePath, {
		signedUrl: data.signedUrl,
		expiresAt: now + CACHE_TTL_MS,
	})

	return data.signedUrl
}

/**
 * Prefetch signed URLs для массива storage paths (последовательно, не параллельно).
 * Используется в TestRunner для предзагрузки изображений следующих вопросов.
 */
export async function prefetchSignedUrls(paths: string[]): Promise<void> {
	for (const p of paths) {
		if (isStoragePath(p)) {
			try {
				await getSignedUrl(p)
			} catch {
				// Не блокируем prefetch при ошибке одного URL
			}
		}
	}
}

const TOKEN_IN_HASH = /^#([A-Za-z0-9_-]{43})$/

export type CachedLink = { url: string; token: string }

function cacheKey(sessionId: string, questionId: string): string {
	return `${sessionId}:${questionId}`
}

function storage(): Storage | null {
	try {
		return typeof window === 'undefined' ? null : window.sessionStorage
	} catch {
		return null
	}
}

export function readCachedLink(sessionId: string, questionId: string): CachedLink | null {
	try {
		const url = storage()?.getItem(cacheKey(sessionId, questionId)) ?? null
		if (url === null) return null
		const token = TOKEN_IN_HASH.exec(new URL(url).hash)?.[1]
		return token ? { url, token } : null
	} catch {
		return null
	}
}

export function storeCachedLink(sessionId: string, questionId: string, url: string): void {
	try {
		storage()?.setItem(cacheKey(sessionId, questionId), url)
	} catch {
		return
	}
}

export function dropCachedLink(sessionId: string, questionId: string): void {
	try {
		storage()?.removeItem(cacheKey(sessionId, questionId))
	} catch {
		return
	}
}

export function requireApiOrigin(): string {
	const raw = process.env.API_ORIGIN
	if (!raw) throw new Error('API_ORIGIN is not set: web cannot reach Express')
	let parsed: URL
	try {
		parsed = new URL(raw)
	} catch {
		throw new Error('API_ORIGIN is not a valid URL: web cannot reach Express')
	}
	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
		throw new Error('API_ORIGIN must use http or https: web cannot reach Express')
	}
	return parsed.origin
}

export function apiUrl(path: string): URL {
	return new URL(path, requireApiOrigin())
}

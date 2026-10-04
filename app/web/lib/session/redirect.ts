const CALLBACK_BASE = 'http://callback.invalid'

export const DEFAULT_CALLBACK_PATH = '/dashboard'

const LOGGED_OUT_PARAM = 'loggedOut'

export const LOGGED_OUT_PATH = `/login?${LOGGED_OUT_PARAM}=1`

export function isLoggedOutNotice(params: { get(name: string): string | null }): boolean {
	return params.get(LOGGED_OUT_PARAM) === '1'
}

export function buildLoginRedirect(callbackPath: string): string {
	const searchParams = new URLSearchParams({ callbackUrl: callbackPath })
	return `/login?${searchParams.toString()}`
}

function hasForbiddenCharacter(value: string): boolean {
	for (const char of value) {
		const code = char.charCodeAt(0)
		if (code < 0x20 || code === 0x7f || char === '\\') return true
	}
	return false
}

export function safeCallbackPath(raw: string | null | undefined, fallback: string = DEFAULT_CALLBACK_PATH): string {
	if (typeof raw !== 'string' || !raw.startsWith('/')) return fallback
	if (raw[1] === '/' || raw[1] === '\\') return fallback
	if (hasForbiddenCharacter(raw)) return fallback

	let parsed: URL
	try {
		parsed = new URL(raw, CALLBACK_BASE)
	} catch {
		return fallback
	}
	if (parsed.origin !== CALLBACK_BASE) return fallback

	const path = `${parsed.pathname}${parsed.search}${parsed.hash}`
	if (path.startsWith('//') || path.startsWith('/\\')) return fallback
	return path
}

const DEFAULT_SESSION_COOKIE_CANDIDATES = ['bio_exam_session', 'bio-exam_session'] as const

export const REFRESH_COOKIE_NAME = 'refresh_token'

function getSessionCookieCandidates(configuredName?: string | null): string[] {
	return Array.from(
		new Set(
			[configuredName, ...DEFAULT_SESSION_COOKIE_CANDIDATES].filter(
				(value): value is string => typeof value === 'string' && value.length > 0
			)
		)
	)
}

export function readSessionCookieValue(
	cookieStore: { get(name: string): { value?: string } | undefined },
	configuredName?: string | null
): string | null {
	for (const candidate of getSessionCookieCandidates(configuredName)) {
		const value = cookieStore.get(candidate)?.value
		if (value) return value
	}
	return null
}

export function expiredSessionCookies(configuredName?: string | null): string[] {
	return [...getSessionCookieCandidates(configuredName), REFRESH_COOKIE_NAME].map(
		(name) => `${name}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`
	)
}

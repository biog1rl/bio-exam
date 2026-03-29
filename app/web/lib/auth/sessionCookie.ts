const DEFAULT_SESSION_COOKIE_CANDIDATES = ['bio_exam_session', 'bio-exam_session'] as const

export function getSessionCookieCandidates(configuredName?: string | null): string[] {
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

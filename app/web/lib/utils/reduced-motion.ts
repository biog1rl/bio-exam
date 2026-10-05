const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

type MatchMedia = (query: string) => { matches: boolean }

function globalMatchMedia(): MatchMedia | undefined {
	const candidate = (globalThis as { matchMedia?: unknown }).matchMedia
	if (typeof candidate !== 'function') return undefined
	return (query) => (candidate as MatchMedia).call(globalThis, query)
}

export function prefersReducedMotion(matchMedia?: MatchMedia): boolean {
	const query = matchMedia ?? globalMatchMedia()
	if (!query) return false
	return query(REDUCED_MOTION_QUERY).matches
}

export function replaceSearchParams(patch: Record<string, string | null | undefined>): void {
	const next = new URLSearchParams(window.location.search)
	for (const [name, value] of Object.entries(patch)) {
		if (value) next.set(name, value)
		else next.delete(name)
	}
	const query = next.toString()
	window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`)
}

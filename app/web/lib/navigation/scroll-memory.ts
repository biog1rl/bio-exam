export type NavigationKind = 'push' | 'pop'

const MAX_ENTRIES = 50

export function createScrollMemory(limit = MAX_ENTRIES) {
	const positions = new Map<string, number>()

	return {
		save(key: string, top: number): void {
			positions.delete(key)
			positions.set(key, Math.max(0, top))
			if (positions.size > limit) {
				const oldest = positions.keys().next().value
				if (oldest !== undefined) positions.delete(oldest)
			}
		},
		target(key: string, kind: NavigationKind, hasHash: boolean): number | null {
			if (hasHash) return null
			return kind === 'pop' ? (positions.get(key) ?? 0) : 0
		},
	}
}

import { ROLE_KEYS, type RoleKey } from './roles'

const ROLE_LOOKUP = new Set<RoleKey>(ROLE_KEYS)

function toStringArray(source: unknown): string[] {
	if (Array.isArray(source)) {
		return source.map((value) => (typeof value === 'string' ? value.trim() : '')).filter((value) => value.length > 0)
	}
	if (typeof source === 'string' && source.trim()) {
		return [source.trim()]
	}
	return []
}

export function normaliseRoleKeys(source: unknown): RoleKey[] {
	const collected = toStringArray(source).map((value) => value.toLowerCase())
	const result: RoleKey[] = []
	for (const value of collected) {
		const key = value as RoleKey
		if (ROLE_LOOKUP.has(key) && !result.includes(key)) {
			result.push(key)
		}
	}
	return result
}

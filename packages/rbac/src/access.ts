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

export type SubjectActionMap<S extends string> = Partial<Record<S, ReadonlyArray<string>>>

export type AccessRule = {
	inherit: boolean
	roles: SubjectActionMap<RoleKey>
	users: SubjectActionMap<string>
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

export function normaliseUserIdentifiers(source: unknown): string[] {
	const collected = toStringArray(source).map((value) => value.toLowerCase())
	return Array.from(new Set(collected))
}

function normaliseActionList(source: unknown, allowed: readonly string[], ensureRead: boolean): string[] {
	const allowedSet = new Set(allowed.map((value) => value.toLowerCase()))

	let collected: string[] = []
	if (Array.isArray(source)) {
		collected = toStringArray(source).map((value) => value.toLowerCase())
	} else if (typeof source === 'string') {
		collected = [source.trim().toLowerCase()]
	} else if (source && typeof source === 'object') {
		collected = Object.entries(source as Record<string, unknown>)
			.filter(([, enabled]) => Boolean(enabled))
			.map(([key]) => key.trim().toLowerCase())
	}

	const ordered: string[] = []
	for (const action of allowed) {
		const lower = action.toLowerCase()
		if (collected.includes(lower) && !ordered.includes(lower)) {
			ordered.push(lower)
		}
	}

	if (ensureRead && allowedSet.has('read') && !ordered.includes('read')) {
		ordered.unshift('read')
	}

	if (ensureRead && allowedSet.has('read') && ordered.length === 0) {
		ordered.push('read')
	}

	return ordered
}

export function normaliseRoleAccessMap(
	source: unknown,
	allowed: readonly string[],
	options?: { ensureRead?: boolean; exclude?: RoleKey[] }
): SubjectActionMap<RoleKey> {
	const ensureRead = options?.ensureRead ?? false
	const exclude = new Set<RoleKey>(options?.exclude ?? [])
	const result: SubjectActionMap<RoleKey> = {}

	if (Array.isArray(source)) {
		for (const key of normaliseRoleKeys(source)) {
			if (exclude.has(key)) continue
			result[key] = normaliseActionList(['read'], allowed, ensureRead)
		}
		return result
	}

	if (!source || typeof source !== 'object') return result

	for (const [rawKey, rawValue] of Object.entries(source as Record<string, unknown>)) {
		const key = normaliseRoleKeys([rawKey])[0]
		if (!key || exclude.has(key)) continue
		const actions = normaliseActionList(rawValue, allowed, ensureRead)
		result[key] = actions
	}
	return result
}

export function normaliseUserAccessMap(
	source: unknown,
	allowed: readonly string[],
	options?: { ensureRead?: boolean }
): SubjectActionMap<string> {
	const ensureRead = options?.ensureRead ?? false
	const result: Record<string, ReadonlyArray<string>> = {}

	if (Array.isArray(source)) {
		for (const key of normaliseUserIdentifiers(source)) {
			result[key] = normaliseActionList(['read'], allowed, ensureRead)
		}
		return result
	}

	if (!source || typeof source !== 'object') return result

	for (const [rawKey, rawValue] of Object.entries(source as Record<string, unknown>)) {
		const key = normaliseUserIdentifiers(rawKey)[0] ?? rawKey.toLowerCase()
		if (!key) continue
		const actions = normaliseActionList(rawValue, allowed, ensureRead)
		result[key] = actions
	}
	return result
}

export function createAccessRule(input?: Partial<AccessRule> | null): AccessRule {
	const allowedDocsActions = ['read', 'write', 'permissions'] as const
	return {
		inherit: input?.inherit !== undefined ? Boolean(input.inherit) : true,
		roles: input?.roles ? normaliseRoleAccessMap(input.roles, allowedDocsActions, { ensureRead: false }) : {},
		users: input?.users ? normaliseUserAccessMap(input.users, allowedDocsActions, { ensureRead: false }) : {},
	}
}

export function accessRuleToSerializable(rule: AccessRule): AccessRule {
	const allowedDocsActions = ['read', 'write', 'permissions'] as const
	return {
		inherit: Boolean(rule.inherit),
		roles: normaliseRoleAccessMap(rule.roles, allowedDocsActions, { ensureRead: false }),
		users: normaliseUserAccessMap(rule.users, allowedDocsActions, { ensureRead: false }),
	}
}

export { normaliseActionList }

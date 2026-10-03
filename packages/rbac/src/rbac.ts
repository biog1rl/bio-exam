import { PERMISSION_DOMAINS, type PermissionDomain, type ActionOf, type PermissionKey } from './domains'
import { ROLE_REGISTRY, type RoleKey, type RoleGrant, type RoleConfig } from './roles'

function expandDomainGrant<D extends PermissionDomain>(domain: D, grant: Array<ActionOf<D> | '*'>): Array<ActionOf<D>> {
	if (grant.includes('*')) return [...PERMISSION_DOMAINS[domain].actions] as Array<ActionOf<D>>
	const set = new Set<ActionOf<D>>(grant as Array<ActionOf<D>>)
	return Array.from(set)
}

function expandGrants(grants: RoleGrant | undefined): Set<PermissionKey> {
	const keys: string[] = []
	if (!grants) return new Set<PermissionKey>()
	for (const domain of Object.keys(grants) as PermissionDomain[]) {
		const actions = expandDomainGrant(domain, (grants[domain] ?? []) as Array<ActionOf<typeof domain> | '*'>)
		for (const a of actions) keys.push(`${domain}.${a}`)
	}
	return new Set(keys as PermissionKey[])
}

function expandRole(roleKey: RoleKey, seen: Set<RoleKey> = new Set()): Set<PermissionKey> {
	if (seen.has(roleKey)) return new Set<PermissionKey>()
	seen.add(roleKey)
	const cfg: RoleConfig | undefined = ROLE_REGISTRY[roleKey] as unknown as RoleConfig | undefined
	const base = expandGrants(cfg?.grants)
	const parents = (cfg?.inherits ?? []) as RoleKey[]
	for (const rk of parents) {
		if (!(rk in ROLE_REGISTRY)) continue
		for (const k of expandRole(rk, seen)) base.add(k)
	}
	return base
}

export function buildPermissionSet(roles: ReadonlyArray<RoleKey>): Set<PermissionKey> {
	const acc = new Set<PermissionKey>()
	for (const rk of roles) {
		if (!(rk in ROLE_REGISTRY)) continue
		for (const key of expandRole(rk)) acc.add(key)
	}
	return acc
}

export function can<D extends PermissionDomain>(
	perms: ReadonlySet<PermissionKey>,
	domain: D,
	action: ActionOf<D>
): boolean
export function can(perms: ReadonlySet<PermissionKey>, key: PermissionKey): boolean
export function can(perms: ReadonlySet<PermissionKey>, a: unknown, b?: unknown): boolean {
	if (typeof a === 'string' && b === undefined) return perms.has(a as PermissionKey)
	if (typeof a === 'string' && typeof b === 'string') {
		const domain = a as PermissionDomain
		const allowed = (PERMISSION_DOMAINS[domain]?.actions as readonly string[] | undefined) ?? []
		if (!allowed.includes(b)) return false
		return perms.has(`${domain}.${b}` as PermissionKey)
	}
	return false
}

export type { PermissionKey, PermissionDomain, ActionOf } from './domains'
export type { RoleKey, RoleConfig, RoleGrant } from './roles'

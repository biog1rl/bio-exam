import { PERMISSION_DOMAINS, type PermissionDomain, type ActionOf, type PermissionKey } from './domains'

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

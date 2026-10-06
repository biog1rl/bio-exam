import { ROLE_REGISTRY, type RoleKey } from '@bio-exam/rbac'

import type { RbacRoleRow, RbacRolesResponse, RoleGrantTarget } from '@/lib/rbac/api'
import type { GrantsResponse } from '@/lib/users/api'

export const IMMUTABLE_ROLE_KEY: RoleKey = ROLE_REGISTRY.admin.key

export function permissionKey(domain: string, action: string): string {
	return `${domain}.${action}`
}

export function roleDefaultAllows(role: RbacRoleRow, domain: string, action: string): boolean {
	const granted = role.grants[domain] ?? []
	return granted.includes(action) || granted.includes('*')
}

export function roleOverrides(data: RbacRolesResponse | undefined): Map<string, boolean> {
	const map = new Map<string, boolean>()
	for (const row of data?.overrides ?? []) map.set(`${row.roleKey}:${permissionKey(row.domain, row.action)}`, row.allow)
	return map
}

export function roleAllows(
	role: RbacRoleRow,
	overrides: ReadonlyMap<string, boolean>,
	domain: string,
	action: string
): boolean {
	if (role.key === IMMUTABLE_ROLE_KEY) return true
	return overrides.get(`${role.key}:${permissionKey(domain, action)}`) ?? roleDefaultAllows(role, domain, action)
}

export function withRoleOverride(
	data: RbacRolesResponse,
	target: RoleGrantTarget,
	allow: boolean | null
): RbacRolesResponse {
	const { roleKey, domain, action } = target
	const overrides = data.overrides.filter(
		(row) => !(row.roleKey === roleKey && row.domain === domain && row.action === action)
	)
	if (allow !== null) overrides.push({ roleKey, domain, action, allow })
	return { ...data, overrides }
}

export function withUserOverride(
	data: GrantsResponse,
	domain: string,
	action: string,
	allow: boolean | null
): GrantsResponse {
	const key = permissionKey(domain, action)
	const userOverrides = data.userOverrides.filter((row) => !(row.domain === domain && row.action === action))
	if (allow !== null) userOverrides.push({ domain, action, allow })
	const effective = data.effective.filter((item) => item !== key)
	if (allow ?? data.roleKeys.includes(key)) effective.push(key)
	return { ...data, userOverrides, effective }
}

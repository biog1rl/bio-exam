import {
	PERMISSION_DOMAINS,
	ROLE_REGISTRY,
	normaliseRoleKeys,
	type PermissionDomain,
	type PermissionKey,
	type RoleKey,
} from '@bio-exam/rbac'

export type RoleDefinition = {
	readonly grants: Readonly<Partial<Record<PermissionDomain, ReadonlyArray<string>>>>
	readonly inherits?: ReadonlyArray<string>
}

export type RoleRegistry = Readonly<Record<string, RoleDefinition>>

export type RoleGrantRow = { roleKey: string; domain: string; action: string; allow: boolean }

export type UserGrantRow = { domain: string; action: string; allow: boolean }

export type GrantsSnapshot = {
	roles: string[]
	roleGrants: RoleGrantRow[]
	userGrants: UserGrantRow[]
}

export type AccessSet = {
	roles: RoleKey[]
	rolePermissions: ReadonlySet<PermissionKey>
	permissions: ReadonlySet<PermissionKey>
	snapshot: GrantsSnapshot
}

export interface GrantsLoader {
	load(userId: string): Promise<GrantsSnapshot>
}

export type AccessPolicy = {
	accessFor(userId: string): Promise<AccessSet>
}

function isDomain(domain: string): domain is PermissionDomain {
	return Object.hasOwn(PERMISSION_DOMAINS, domain)
}

export function isValidAction(domain: string, action: string): boolean {
	if (!isDomain(domain)) return false
	return (PERMISSION_DOMAINS[domain].actions as ReadonlyArray<string>).includes(action)
}

function permissionKey(domain: string, action: string): PermissionKey | null {
	return isValidAction(domain, action) ? (`${domain}.${action}` as PermissionKey) : null
}

function expandDomainGrant(domain: string, actions: ReadonlyArray<string>): PermissionKey[] {
	if (!isDomain(domain)) return []
	const listed = actions.includes('*') ? (PERMISSION_DOMAINS[domain].actions as ReadonlyArray<string>) : actions
	const keys: PermissionKey[] = []
	for (const action of listed) {
		const key = permissionKey(domain, action)
		if (key) keys.push(key)
	}
	return keys
}

function expandRole(registry: RoleRegistry, roleKey: string, seen: Set<string>, target: Set<PermissionKey>): void {
	if (seen.has(roleKey) || !Object.hasOwn(registry, roleKey)) return
	seen.add(roleKey)
	const definition = registry[roleKey]
	if (!definition) return
	for (const [domain, actions] of Object.entries(definition.grants)) {
		for (const key of expandDomainGrant(domain, actions ?? [])) target.add(key)
	}
	for (const parent of definition.inherits ?? []) expandRole(registry, parent, seen, target)
}

function applyGrants(target: Set<PermissionKey>, rows: ReadonlyArray<UserGrantRow>): void {
	for (const row of rows) {
		const key = permissionKey(row.domain, row.action)
		if (!key) continue
		if (row.allow) target.add(key)
		else target.delete(key)
	}
}

export function computeAccess(registry: RoleRegistry, snapshot: GrantsSnapshot): AccessSet {
	const ownRoles = new Set(snapshot.roles)
	const rolePermissions = new Set<PermissionKey>()
	const seen = new Set<string>()
	for (const roleKey of ownRoles) expandRole(registry, roleKey, seen, rolePermissions)
	applyGrants(
		rolePermissions,
		snapshot.roleGrants.filter((row) => ownRoles.has(row.roleKey))
	)
	const permissions = new Set(rolePermissions)
	applyGrants(permissions, snapshot.userGrants)
	return { roles: normaliseRoleKeys(snapshot.roles), rolePermissions, permissions, snapshot }
}

export function createAccessPolicy(options: { loader: GrantsLoader; registry?: RoleRegistry }): AccessPolicy {
	const registry = options.registry ?? ROLE_REGISTRY
	return {
		async accessFor(userId) {
			return computeAccess(registry, await options.loader.load(userId))
		},
	}
}

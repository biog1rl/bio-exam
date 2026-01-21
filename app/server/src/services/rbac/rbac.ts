// app/server/src/services/rbac/rbac.ts
import {
	ROLE_REGISTRY,
	PERMISSION_DOMAINS,
	type RoleKey,
	type PermissionKey,
	type PermissionDomain,
} from '@bio-exam/rbac'

import { and, eq, inArray } from 'drizzle-orm'

import { db } from '../../db/index.js'
import { rbacRoleGrants, rbacUserGrants, userRoles } from '../../db/schema.js'

/** Кэш для ролей и пользователей */
let rolesCache = new Map<string, Set<PermissionKey>>()
let userCache = new Map<string, Set<PermissionKey>>()

export function invalidateRBACCache(): void {
	rolesCache.clear()
	userCache.clear()
}

/** Валидна ли пара (domain, action) с точки зрения реестра доменов */
export function isValidAction(domain: string, action: string): boolean {
	const d = domain as PermissionDomain
	const info = PERMISSION_DOMAINS[d]
	if (!info) return false
	return (info.actions as readonly string[]).includes(action)
}

/** Развернуть '*' в конкретные действия домена и добавить в сет */
function addAllActionsOfDomain(target: Set<PermissionKey>, domain: PermissionDomain): void {
	const info = PERMISSION_DOMAINS[domain]
	if (!info) return
	for (const a of info.actions) {
		target.add(`${domain}.${a}` as PermissionKey)
	}
}

/** Построить сет прав для набора ролей, учитывая rbac_role_grants (allow/deny) */
export async function buildPermissionSet(roles: ReadonlyArray<RoleKey>): Promise<Set<PermissionKey>> {
	// ключ кэша — отсортированный список ролей
	const cacheKey = roles.slice().sort().join(',')
	const cached = rolesCache.get(cacheKey)
	if (cached) return new Set(cached)

	// 1) дефолтные права из ROLE_REGISTRY
	const base = new Set<PermissionKey>()
	for (const rk of roles) {
		const role = ROLE_REGISTRY[rk]
		if (!role) continue
		for (const [domainRaw, actions] of Object.entries(role.grants)) {
			const domain = domainRaw as PermissionDomain
			for (const a of actions) {
				if (a === '*') {
					addAllActionsOfDomain(base, domain)
				} else {
					const key = `${domain}.${a}` as PermissionKey
					base.add(key)
				}
			}
		}
	}

	// 2) role-level overrides (allow/deny) из БД только для интересующих ролей
	if (roles.length > 0) {
		const rows = await db
			.select()
			.from(rbacRoleGrants)
			.where(inArray(rbacRoleGrants.roleKey, roles as string[]))

		for (const r of rows) {
			const domain = r.domain as PermissionDomain
			const key = `${domain}.${r.action}` as PermissionKey
			if (r.allow) base.add(key)
			else base.delete(key) // deny снимает базовое право
		}
	}

	// кешируем итог
	const snapshot = new Set(base)
	rolesCache.set(cacheKey, snapshot)
	return base
}

/** Эффективные права пользователя: роли (+role overrides) + персональные overrides (allow/deny, приоритетнее ролей) */
export async function buildPermissionSetForUser(userId: string): Promise<Set<PermissionKey>> {
	const cached = userCache.get(userId)
	if (cached) return new Set(cached)

	// роли пользователя
	const rs = await db.select({ role: userRoles.roleKey }).from(userRoles).where(eq(userRoles.userId, userId))
	const roleKeys = rs.map((r) => r.role as RoleKey)

	// права от ролей с учётом role overrides
	const base = await buildPermissionSet(roleKeys)

	// пользовательские overrides (allow/deny)
	const rows = await db.select().from(rbacUserGrants).where(eq(rbacUserGrants.userId, userId))
	for (const r of rows) {
		const domain = r.domain as PermissionDomain
		const key = `${domain}.${r.action}` as PermissionKey
		if (r.allow) base.add(key)
		else base.delete(key) // deny у пользователя сильнее любых прав роли
	}

	const effective = new Set(base)
	userCache.set(userId, effective)
	return effective
}

import { eq, inArray } from 'drizzle-orm'

import type { db as Database } from '../../db/index.js'
import { rbacRoleGrants, rbacUserGrants, userRoles } from '../../db/schema.js'
import type { GrantsLoader, GrantsSnapshot } from './policy.js'

export type { GrantsLoader } from './policy.js'

export function createDrizzleGrantsLoader(database: typeof Database): GrantsLoader {
	return {
		async load(userId) {
			const roleRows = await database
				.select({ roleKey: userRoles.roleKey })
				.from(userRoles)
				.where(eq(userRoles.userId, userId))
			const roles = roleRows.map((row) => row.roleKey)
			const roleGrants =
				roles.length > 0
					? await database
							.select({
								roleKey: rbacRoleGrants.roleKey,
								domain: rbacRoleGrants.domain,
								action: rbacRoleGrants.action,
								allow: rbacRoleGrants.allow,
							})
							.from(rbacRoleGrants)
							.where(inArray(rbacRoleGrants.roleKey, roles))
					: []
			const userGrants = await database
				.select({ domain: rbacUserGrants.domain, action: rbacUserGrants.action, allow: rbacUserGrants.allow })
				.from(rbacUserGrants)
				.where(eq(rbacUserGrants.userId, userId))
			return {
				roles,
				roleGrants: roleGrants.map((row) => ({ ...row, allow: Boolean(row.allow) })),
				userGrants: userGrants.map((row) => ({ ...row, allow: Boolean(row.allow) })),
			}
		},
	}
}

function emptySnapshot(): GrantsSnapshot {
	return { roles: [], roleGrants: [], userGrants: [] }
}

export function createInMemoryGrantsLoader(snapshots: ReadonlyMap<string, GrantsSnapshot>): GrantsLoader {
	return {
		async load(userId) {
			const snapshot = snapshots.get(userId)
			if (!snapshot) return emptySnapshot()
			return {
				roles: [...snapshot.roles],
				roleGrants: snapshot.roleGrants.map((row) => ({ ...row })),
				userGrants: snapshot.userGrants.map((row) => ({ ...row })),
			}
		},
	}
}

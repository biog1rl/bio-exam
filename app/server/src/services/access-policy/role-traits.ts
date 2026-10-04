import { ROLE_REGISTRY, type PermissionKey } from '@bio-exam/rbac'

import { db } from '../../db/index.js'
import { rbacRoleGrants } from '../../db/schema.js'
import { computeAccess, type RoleGrantRow, type RoleRegistry } from './policy.js'

export type RoleTraits = { ownsZone: boolean; groupMember: boolean }

type TraitsExecutor = Pick<typeof db, 'select'>

const ZONE_WORK_PERMISSIONS: ReadonlyArray<PermissionKey> = ['tests.write', 'groups.manage_groups', 'users.invite']

const MANAGEMENT_PERMISSIONS: ReadonlyArray<PermissionKey> = [
	'tests.write',
	'tests.manage_assignments',
	'groups.manage_groups',
	'users.read',
	'users.edit',
	'users.invite',
]

export function roleTraits(permissions: ReadonlySet<PermissionKey>): RoleTraits {
	const ownsZone = !permissions.has('zone.all') && ZONE_WORK_PERMISSIONS.some((key) => permissions.has(key))
	const groupMember = !MANAGEMENT_PERMISSIONS.some((key) => permissions.has(key))
	return { ownsZone, groupMember }
}

export async function loadRoleTraits(
	executor: TraitsExecutor = db,
	registry: RoleRegistry = ROLE_REGISTRY
): Promise<Map<string, RoleTraits>> {
	const rows = await executor
		.select({
			roleKey: rbacRoleGrants.roleKey,
			domain: rbacRoleGrants.domain,
			action: rbacRoleGrants.action,
			allow: rbacRoleGrants.allow,
		})
		.from(rbacRoleGrants)
	const roleGrants: RoleGrantRow[] = rows.map((row) => ({ ...row, allow: Boolean(row.allow) }))
	const traits = new Map<string, RoleTraits>()
	for (const roleKey of Object.keys(registry)) {
		const access = computeAccess(registry, {
			roles: [roleKey],
			roleGrants: roleGrants.filter((row) => row.roleKey === roleKey),
			userGrants: [],
		})
		traits.set(roleKey, roleTraits(access.rolePermissions))
	}
	return traits
}

import { ROLE_REGISTRY, STUDENT_ROLE_KEY, type PermissionKey } from '@bio-exam/rbac'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthApp, type AuthApp } from '../../test-support/auth-app.js'
import { computeAccess } from './policy.js'

type RoleTraitsModule = typeof import('./role-traits.js')

let ctx: AuthApp
let traits: RoleTraitsModule

function permissionsOf(roleKey: string): ReadonlySet<PermissionKey> {
	return computeAccess(ROLE_REGISTRY, { roles: [roleKey], roleGrants: [], userGrants: [] }).permissions
}

beforeAll(async () => {
	ctx = await startAuthApp('test_role_traits')
	traits = await import('./role-traits.js')
}, 60_000)

afterAll(async () => {
	await ctx?.stop()
})

describe('roleTraits', () => {
	test('администратор с zone.all зоной не владеет и в группы не входит', () => {
		expect(traits.roleTraits(permissionsOf(ROLE_REGISTRY.admin.key))).toEqual({ ownsZone: false, groupMember: false })
	})

	test('учитель D-02 владеет зоной', () => {
		expect(traits.roleTraits(permissionsOf(ROLE_REGISTRY.teacher.key))).toEqual({ ownsZone: true, groupMember: false })
	})

	test('ученик без прав управления — участник групп', () => {
		expect(traits.roleTraits(permissionsOf(STUDENT_ROLE_KEY))).toEqual({ ownsZone: false, groupMember: true })
	})

	test('одно из прав зоны без zone.all — владелец зоны; любое право управления снимает groupMember', () => {
		expect(traits.roleTraits(new Set<PermissionKey>(['users.invite']))).toEqual({ ownsZone: true, groupMember: false })
		expect(traits.roleTraits(new Set<PermissionKey>(['groups.manage_groups', 'zone.all']))).toEqual({
			ownsZone: false,
			groupMember: false,
		})
		expect(traits.roleTraits(new Set<PermissionKey>(['tests.read']))).toEqual({ ownsZone: false, groupMember: true })
		for (const key of ['tests.manage_assignments', 'users.read', 'users.edit'] satisfies PermissionKey[]) {
			expect(traits.roleTraits(new Set<PermissionKey>([key]))).toEqual({ ownsZone: false, groupMember: false })
		}
	})
})

describe('loadRoleTraits', () => {
	test('признаки по реестру без переопределений', async () => {
		const loaded = await traits.loadRoleTraits()
		expect(loaded.get(ROLE_REGISTRY.admin.key)).toEqual({ ownsZone: false, groupMember: false })
		expect(loaded.get(ROLE_REGISTRY.teacher.key)).toEqual({ ownsZone: true, groupMember: false })
		expect(loaded.get(STUDENT_ROLE_KEY)).toEqual({ ownsZone: false, groupMember: true })
	})

	test('deny в rbac_role_grants снимает ownsZone у учителя, allow даёт его ученику', async () => {
		const teacherKey = ROLE_REGISTRY.teacher.key
		await ctx.db.insert(ctx.schema.rbacRoleGrants).values([
			{ roleKey: teacherKey, domain: 'tests', action: 'write', allow: false },
			{ roleKey: teacherKey, domain: 'groups', action: 'manage_groups', allow: false },
			{ roleKey: teacherKey, domain: 'users', action: 'invite', allow: false },
			{ roleKey: STUDENT_ROLE_KEY, domain: 'tests', action: 'write', allow: true },
		])
		const loaded = await traits.loadRoleTraits(ctx.db)
		expect(loaded.get(teacherKey)).toEqual({ ownsZone: false, groupMember: false })
		expect(loaded.get(STUDENT_ROLE_KEY)).toEqual({ ownsZone: true, groupMember: false })
	})
})

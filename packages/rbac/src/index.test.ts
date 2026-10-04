import { describe, expect, test } from 'vitest'

import * as rbac from './index'

// Рантайм-экспорты пакета. Тест защищает публичную поверхность при смене сборщика (tsup на tsdown).
const RUNTIME_EXPORTS = [
	'PERMISSION_DOMAINS',
	'ROLE_REGISTRY',
	'ROLE_KEYS',
	'ROLES_LIST',
	'roleDisplayName',
	'can',
	'normaliseRoleKeys',
	'normaliseUserIdentifiers',
	'normaliseRoleAccessMap',
	'normaliseUserAccessMap',
	'createAccessRule',
	'accessRuleToSerializable',
	'normaliseActionList',
]

describe('@bio-exam/rbac', () => {
	test('экспортирует ровно 13 рантайм-имён', () => {
		expect(Object.keys(rbac).sort()).toEqual([...RUNTIME_EXPORTS].sort())
	})

	test('can проверяет готовый набор прав', () => {
		const perms = new Set<rbac.PermissionKey>(['users.read'])
		expect(rbac.can(perms, 'users', 'read')).toBe(true)
		expect(rbac.can(perms, 'users.read')).toBe(true)
		expect(rbac.can(perms, 'users', 'edit')).toBe(false)
		expect(rbac.can(perms, 'tests.read')).toBe(false)
	})

	test('роль user без прав', () => {
		expect(rbac.ROLE_REGISTRY.user.grants).toEqual({})
		const keys = Object.values(rbac.ROLE_REGISTRY.user.grants as Record<string, readonly string[]>).flat()
		expect(keys).toEqual([])
	})
})

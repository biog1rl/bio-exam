import { describe, expect, test } from 'vitest'

import * as rbac from './index'

// Рантайм-экспорты пакета. Тест защищает публичную поверхность при смене сборщика (tsup на tsdown).
const RUNTIME_EXPORTS = [
	'PERMISSION_DOMAINS',
	'ROLE_REGISTRY',
	'ROLE_KEYS',
	'ROLES_LIST',
	'roleDisplayName',
	'buildPermissionSet',
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
	test('экспортирует ровно 14 рантайм-имён', () => {
		expect(Object.keys(rbac).sort()).toEqual([...RUNTIME_EXPORTS].sort())
	})

	test('роль admin может читать пользователей', () => {
		expect(rbac.can(rbac.buildPermissionSet(['admin']), 'users', 'read')).toBe(true)
	})
})

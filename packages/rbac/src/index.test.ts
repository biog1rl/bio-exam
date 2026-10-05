import { describe, expect, test } from 'vitest'

import * as rbac from './index'

// Рантайм-экспорты пакета. Тест защищает публичную поверхность при смене сборщика (tsup на tsdown).
const RUNTIME_EXPORTS = [
	'PERMISSION_DOMAINS',
	'ROLE_REGISTRY',
	'ROLE_KEYS',
	'ROLES_LIST',
	'STUDENT_ROLE_KEY',
	'STAFF_ROLE_KEYS',
	'roleDisplayName',
	'can',
	'normaliseRoleKeys',
	'normaliseUserIdentifiers',
	'normaliseRoleAccessMap',
	'normaliseUserAccessMap',
	'createAccessRule',
	'accessRuleToSerializable',
	'normaliseActionList',
	'SECTION_PERMISSIONS',
	'canAccessSection',
	'canOpenPath',
	'sectionForPath',
	'RESERVED_TOPIC_SLUGS',
	'isReservedTopicSlug',
]

describe('@bio-exam/rbac', () => {
	test('экспортирует ровно 21 рантайм-имя', () => {
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

	test('три роли в порядке admin, teacher, user', () => {
		expect(rbac.ROLE_KEYS).toEqual(['admin', 'teacher', 'user'])
		expect(rbac.ROLES_LIST.map((role) => role.key)).toEqual(['admin', 'teacher', 'user'])
	})

	test('названия ролей учителя и ученика', () => {
		expect(rbac.roleDisplayName('user')).toBe('Ученик')
		expect(rbac.roleDisplayName('teacher')).toBe('Учитель')
		expect(rbac.roleDisplayName('admin')).toBe('Администратор')
	})

	test('canOpenPath: адрес вне разделов открыт всем, раздел — по правам', () => {
		const none = new Set<rbac.PermissionKey>()
		const teacher = new Set<rbac.PermissionKey>(['tests.read', 'users.read', 'groups.manage_groups'])
		expect(rbac.canOpenPath(none, '/dashboard')).toBe(true)
		expect(rbac.canOpenPath(none, 'https://example.test/docs')).toBe(true)
		expect(rbac.canOpenPath(none, '/admin')).toBe(false)
		expect(rbac.canOpenPath(teacher, '/admin/tests')).toBe(true)
		expect(rbac.canOpenPath(teacher, '/admin/tests/scoring')).toBe(false)
		expect(rbac.canOpenPath(teacher, '/admin/settings/rbac')).toBe(false)
	})

	test('sectionForPath отрезает query, hash и завершающий слэш', () => {
		const settingsOnly = new Set<rbac.PermissionKey>(['settings.manage'])
		expect(rbac.sectionForPath('/admin?x=1')).toBe('admin')
		expect(rbac.sectionForPath('/admin#a')).toBe('admin')
		expect(rbac.sectionForPath('/admin/settings/rbac?x=1')).toBe('rbac')
		expect(rbac.sectionForPath('/admin/users/')).toBe('users')
		expect(rbac.canOpenPath(new Set<rbac.PermissionKey>(), '/admin?x=1')).toBe(false)
		expect(rbac.canOpenPath(settingsOnly, '/admin/settings/rbac?x')).toBe(false)
	})

	test('домен zone с единственным действием all', () => {
		expect(rbac.PERMISSION_DOMAINS.zone.actions).toEqual(['all'])
		expect(rbac.can(new Set<rbac.PermissionKey>(['zone.all']), 'zone', 'all')).toBe(true)
		expect(rbac.can(new Set<rbac.PermissionKey>(['tests.read']), 'zone.all')).toBe(false)
	})

	test('роль ученика и роли персонала', () => {
		expect(rbac.STUDENT_ROLE_KEY).toBe('user')
		expect(rbac.STAFF_ROLE_KEYS).toEqual(['admin', 'teacher'])
		expect(rbac.STAFF_ROLE_KEYS).toEqual(rbac.ROLES_LIST.filter((role) => role.staff === true).map((role) => role.key))
	})

	test('гранты учителя ровно по D-02', () => {
		expect(rbac.ROLE_REGISTRY.teacher.grants).toEqual({
			tests: ['read', 'write', 'manage_assignments'],
			groups: ['manage_groups'],
			users: ['read', 'invite'],
		})
		expect(rbac.ROLE_REGISTRY.teacher.order).toBe(5)
		expect(rbac.ROLE_REGISTRY.teacher.staff).toBe(true)
	})

	test('admin получает всю зону', () => {
		expect(rbac.ROLE_REGISTRY.admin.grants).toEqual({
			users: ['*'],
			rbac: ['*'],
			settings: ['*'],
			tests: ['*'],
			groups: ['*'],
			zone: ['*'],
		})
		expect(rbac.ROLE_REGISTRY.admin.staff).toBe(true)
	})
})

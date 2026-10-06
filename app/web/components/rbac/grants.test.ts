import assert from 'node:assert/strict'
import { describe, test } from 'vitest'

import type { RbacRoleRow } from '@/lib/rbac/api'
import type { GrantsResponse } from '@/lib/users/api'

import { IMMUTABLE_ROLE_KEY, roleAllows, withUserOverride } from './grants'

const TEACHER: RbacRoleRow = { key: 'teacher', name: 'Учитель', order: 10, grants: { tests: ['read'], users: ['*'] } }
const ADMIN: RbacRoleRow = { key: IMMUTABLE_ROLE_KEY, name: 'Администратор', order: 0, grants: {} }

describe('roleAllows', () => {
	test.each([
		['значение роли из реестра', TEACHER, new Map(), 'tests', 'read', true],
		['действие вне реестра роли', TEACHER, new Map(), 'tests', 'write', false],
		['звёздочка в реестре даёт любое действие домена', TEACHER, new Map(), 'users', 'edit', true],
		['переопределение роли важнее реестра', TEACHER, new Map([['teacher:tests.read', false]]), 'tests', 'read', false],
		[
			'администратору разрешено всё, переопределения не читаются',
			ADMIN,
			new Map([['admin:tests.read', false]]),
			'tests',
			'read',
			true,
		],
	] as const)('%s', (_name, role, overrides, domain, action, expected) => {
		assert.equal(roleAllows(role, overrides, domain, action), expected)
	})
})

describe('withUserOverride', () => {
	const grants: GrantsResponse = {
		roles: ['teacher'],
		roleKeys: ['tests.read'],
		userOverrides: [{ domain: 'groups', action: 'manage_groups', allow: true }],
		effective: ['tests.read', 'groups.manage_groups'],
	}

	test.each([
		['запрет права роли убирает его из итога', 'tests', 'read', false, false, ['groups.manage_groups']],
		[
			'разрешение сверх роли добавляет право',
			'tests',
			'write',
			true,
			true,
			['tests.read', 'groups.manage_groups', 'tests.write'],
		],
		['сброс исключения возвращает значение роли (нет в роли)', 'groups', 'manage_groups', null, false, ['tests.read']],
		[
			'сброс исключения возвращает значение роли (есть в роли)',
			'tests',
			'read',
			null,
			true,
			['tests.read', 'groups.manage_groups'],
		],
	] as const)('%s', (_name, domain, action, allow, effectiveHas, effective) => {
		const next = withUserOverride(grants, domain, action, allow)
		assert.equal(next.effective.includes(`${domain}.${action}`), effectiveHas)
		assert.deepEqual([...next.effective].sort(), [...effective].sort())
		const override = next.userOverrides.find((row) => row.domain === domain && row.action === action)
		assert.equal(override?.allow ?? null, allow)
		assert.deepEqual(grants.effective, ['tests.read', 'groups.manage_groups'])
	})
})

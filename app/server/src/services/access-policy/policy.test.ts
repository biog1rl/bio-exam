import type { PermissionKey } from '@bio-exam/rbac'

import { describe, expect, test } from 'vitest'

import { createInMemoryGrantsLoader } from './grants-loader.js'
import {
	computeAccess,
	createAccessPolicy,
	isValidAction,
	type GrantsSnapshot,
	type RoleGrantRow,
	type RoleRegistry,
	type UserGrantRow,
} from './policy.js'

const REGISTRY: RoleRegistry = {
	base: { grants: { tests: ['read'] } },
	editor: { inherits: ['base'], grants: { tests: ['write'] } },
	auditor: { inherits: ['editor', 'ghost'], grants: {} },
	loopA: { inherits: ['loopB'], grants: { users: ['read'] } },
	loopB: { inherits: ['loopA'], grants: { groups: ['manage_groups'] } },
	owner: { grants: { tests: ['*'] } },
}

function snapshot(roles: string[], roleGrants: RoleGrantRow[] = [], userGrants: UserGrantRow[] = []): GrantsSnapshot {
	return { roles, roleGrants, userGrants }
}

function sorted(set: ReadonlySet<PermissionKey>): PermissionKey[] {
	return [...set].sort()
}

describe('computeAccess: разворот ролей', () => {
	test.each<{ name: string; roles: string[]; expected: PermissionKey[] }>([
		{ name: 'base даёт tests.read', roles: ['base'], expected: ['tests.read'] },
		{ name: 'editor наследует base', roles: ['editor'], expected: ['tests.read', 'tests.write'] },
		{
			name: 'auditor наследует editor, ghost пропускается',
			roles: ['auditor'],
			expected: ['tests.read', 'tests.write'],
		},
		{ name: 'цикл loopA ↔ loopB не зависает', roles: ['loopA'], expected: ['groups.manage_groups', 'users.read'] },
		{ name: 'неизвестная роль пропускается', roles: ['ghost'], expected: [] },
		{
			name: "грант '*' разворачивается во все действия домена",
			roles: ['owner'],
			expected: ['tests.manage_assignments', 'tests.read', 'tests.write'],
		},
		{ name: 'без ролей прав нет', roles: [], expected: [] },
	])('$name', ({ roles, expected }) => {
		const access = computeAccess(REGISTRY, snapshot(roles))
		expect(sorted(access.permissions)).toEqual([...expected].sort())
		expect(sorted(access.rolePermissions)).toEqual([...expected].sort())
	})
})

describe('computeAccess: переопределения', () => {
	test.each<{
		name: string
		input: GrantsSnapshot
		rolePermissions: PermissionKey[]
		permissions: PermissionKey[]
	}>([
		{
			name: 'roleGrants deny снимает право роли',
			input: snapshot(['editor'], [{ roleKey: 'editor', domain: 'tests', action: 'read', allow: false }]),
			rolePermissions: ['tests.write'],
			permissions: ['tests.write'],
		},
		{
			name: 'roleGrants allow добавляет право роли',
			input: snapshot(['base'], [{ roleKey: 'base', domain: 'users', action: 'read', allow: true }]),
			rolePermissions: ['tests.read', 'users.read'],
			permissions: ['tests.read', 'users.read'],
		},
		{
			name: 'roleGrants роли, которой у пользователя нет, не применяются',
			input: snapshot(
				['base'],
				[
					{ roleKey: 'editor', domain: 'tests', action: 'read', allow: false },
					{ roleKey: 'owner', domain: 'users', action: 'read', allow: true },
				]
			),
			rolePermissions: ['tests.read'],
			permissions: ['tests.read'],
		},
		{
			name: 'userGrants allow добавляет право поверх ролей и не попадает в rolePermissions',
			input: snapshot(['base'], [], [{ domain: 'users', action: 'edit', allow: true }]),
			rolePermissions: ['tests.read'],
			permissions: ['tests.read', 'users.edit'],
		},
		{
			name: "userGrants deny снимает право даже у роли с '*'",
			input: snapshot(['owner'], [], [{ domain: 'tests', action: 'write', allow: false }]),
			rolePermissions: ['tests.manage_assignments', 'tests.read', 'tests.write'],
			permissions: ['tests.manage_assignments', 'tests.read'],
		},
		{
			name: 'пользователь сильнее роли: user allow возвращает право, снятое roleGrants deny',
			input: snapshot(
				['editor'],
				[{ roleKey: 'editor', domain: 'tests', action: 'write', allow: false }],
				[{ domain: 'tests', action: 'write', allow: true }]
			),
			rolePermissions: ['tests.read'],
			permissions: ['tests.read', 'tests.write'],
		},
		{
			name: 'строка гранта с неизвестной парой пропускается',
			input: snapshot(
				['base'],
				[
					{ roleKey: 'base', domain: 'tests', action: 'fly', allow: true },
					{ roleKey: 'base', domain: 'space', action: 'read', allow: true },
				],
				[{ domain: 'tests', action: 'fly', allow: true }]
			),
			rolePermissions: ['tests.read'],
			permissions: ['tests.read'],
		},
	])('$name', ({ input, rolePermissions, permissions }) => {
		const access = computeAccess(REGISTRY, input)
		expect(sorted(access.rolePermissions)).toEqual([...rolePermissions].sort())
		expect(sorted(access.permissions)).toEqual([...permissions].sort())
	})

	test('roles содержит только известные ключи реестра пакета', () => {
		expect(computeAccess(REGISTRY, snapshot(['editor', 'admin', 'user'])).roles).toEqual(['admin', 'user'])
	})
})

describe('isValidAction', () => {
	test.each<[string, string, boolean]>([
		['tests', 'read', true],
		['groups', 'manage_groups', true],
		['tests', 'fly', false],
		['space', 'read', false],
		['tests', '*', false],
		['constructor', 'read', false],
	])('%s.%s → %s', (domain, action, expected) => {
		expect(isValidAction(domain, action)).toBe(expected)
	})
})

describe('createAccessPolicy с in-memory загрузчиком', () => {
	const snapshots = new Map<string, GrantsSnapshot>([
		[
			'user-1',
			snapshot(
				['auditor'],
				[{ roleKey: 'auditor', domain: 'users', action: 'read', allow: true }],
				[{ domain: 'tests', action: 'read', allow: false }]
			),
		],
	])
	const policy = createAccessPolicy({ loader: createInMemoryGrantsLoader(snapshots), registry: REGISTRY })

	test('результат совпадает с computeAccess для того же снимка', async () => {
		const access = await policy.accessFor('user-1')
		const direct = computeAccess(REGISTRY, snapshots.get('user-1') as GrantsSnapshot)
		expect(sorted(access.permissions)).toEqual(sorted(direct.permissions))
		expect(sorted(access.rolePermissions)).toEqual(sorted(direct.rolePermissions))
		expect(sorted(access.permissions)).toEqual(['tests.write', 'users.read'])
	})

	test('неизвестный пользователь получает пустой набор', async () => {
		const access = await policy.accessFor('nobody')
		expect(access.roles).toEqual([])
		expect(access.permissions.size).toBe(0)
		expect(access.rolePermissions.size).toBe(0)
	})

	test('по умолчанию используется ROLE_REGISTRY пакета', async () => {
		const loader = createInMemoryGrantsLoader(new Map([['u', snapshot(['user'])]]))
		const access = await createAccessPolicy({ loader }).accessFor('u')
		expect(sorted(access.permissions)).toEqual(['users.read'])
	})
})

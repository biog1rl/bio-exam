import assert from 'node:assert/strict'
import { test } from 'vitest'

import {
	PERMISSION_DOMAINS,
	ROLE_REGISTRY,
	SECTION_PERMISSIONS,
	canAccessSection,
	sectionForPath,
	type PermissionDomain,
	type PermissionKey,
	type Section,
} from './index'

const ALL_SECTIONS = Object.keys(SECTION_PERMISSIONS) as Section[]

function rolePerms(role: keyof typeof ROLE_REGISTRY): Set<PermissionKey> {
	const keys = new Set<PermissionKey>()
	const grants = ROLE_REGISTRY[role].grants as Partial<Record<PermissionDomain, readonly string[]>>
	for (const domain of Object.keys(grants) as PermissionDomain[]) {
		const granted = grants[domain] ?? []
		const actions: readonly string[] = granted.includes('*') ? PERMISSION_DOMAINS[domain].actions : granted
		for (const action of actions) keys.add(`${domain}.${action}` as PermissionKey)
	}
	return keys
}

test.each<[string, Section | null]>([
	['/admin', 'admin'],
	['/admin/tests', 'tests'],
	['/admin/tests/biology/cell', 'tests'],
	['/admin/tests/question-types', 'catalog'],
	['/admin/tests/question-types/radio', 'catalog'],
	['/admin/tests/scoring', 'catalog'],
	['/admin/tests/scoring-x', 'tests'],
	['/admin/attempts/1', 'attempts'],
	['/admin/users', 'users'],
	['/admin/users/abc', 'users'],
	['/admin/groups', 'groups'],
	['/admin/settings/rbac', 'rbac'],
	['/admin/settings', 'settings'],
	['/admin/settings/chart', 'settings'],
	['/admin/sidebar', 'sidebar'],
	['/admin/unknown', 'admin'],
	['/dashboard', null],
	['/admin-x', null],
	['/profile/x', null],
])('sectionForPath(%s) → %s', (pathname, section) => {
	assert.equal(sectionForPath(pathname), section)
})

test('набор прав роли admin из ROLE_REGISTRY открывает все разделы', () => {
	const perms = rolePerms('admin')
	for (const section of ALL_SECTIONS) assert.equal(canAccessSection(perms, section), true, section)
})

test('набор прав роли teacher из ROLE_REGISTRY открывает admin, tests, attempts, users и groups', () => {
	const perms = rolePerms('teacher')
	const open = ALL_SECTIONS.filter((section) => canAccessSection(perms, section)).sort()
	assert.deepEqual(open, ['admin', 'attempts', 'groups', 'tests', 'users'])
	for (const section of ['settings', 'rbac', 'sidebar', 'catalog'] as const) {
		assert.equal(canAccessSection(perms, section), false, section)
	}
})

test('раздел catalog открывает только zone.all', () => {
	assert.equal(canAccessSection(new Set<PermissionKey>(['zone.all']), 'catalog'), true)
	assert.equal(canAccessSection(new Set<PermissionKey>(['tests.read', 'tests.write']), 'catalog'), false)
})

test.each(
	(
		[
			{ name: 'только users.read открывает users и admin', perm: 'users.read', open: ['admin', 'users'] },
			{
				name: 'только tests.read открывает tests, attempts и admin, но не users',
				perm: 'tests.read',
				open: ['admin', 'attempts', 'tests'],
			},
			{ name: 'только rbac.read открывает rbac и admin, но не settings', perm: 'rbac.read', open: ['admin', 'rbac'] },
		] as { name: string; perm: PermissionKey; open: Section[] }[]
	).map((row): [string, { name: string; perm: PermissionKey; open: Section[] }] => [row.name, row])
)('%s', (_name, { perm, open }) => {
	const perms = new Set<PermissionKey>([perm])
	assert.deepEqual(ALL_SECTIONS.filter((section) => canAccessSection(perms, section)).sort(), open)
})

test('роль user без прав не открывает ни один раздел', () => {
	const perms = rolePerms('user')
	assert.deepEqual([...perms], [])
	for (const section of ALL_SECTIONS) assert.equal(canAccessSection(perms, section), false, section)
})

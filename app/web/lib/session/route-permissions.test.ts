import { PERMISSION_DOMAINS, ROLE_REGISTRY, type PermissionDomain, type PermissionKey } from '@bio-exam/rbac'

import assert from 'node:assert/strict'
import { test } from 'vitest'

import { SECTION_PERMISSIONS, canAccessSection, sectionForPath, type Section } from './route-permissions'

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

test('набор прав роли user (users.read) не открывает ни один раздел', () => {
	const perms = rolePerms('user')
	assert.deepEqual([...perms], ['users.read'])
	for (const section of ALL_SECTIONS) assert.equal(canAccessSection(perms, section), false, section)
})

test('только tests.read открывает tests, attempts и admin, но не users', () => {
	const perms = new Set<PermissionKey>(['tests.read'])
	const open = ALL_SECTIONS.filter((section) => canAccessSection(perms, section)).sort()
	assert.deepEqual(open, ['admin', 'attempts', 'tests'])
	assert.equal(canAccessSection(perms, 'users'), false)
})

test('только rbac.read открывает rbac и admin, но не settings', () => {
	const perms = new Set<PermissionKey>(['rbac.read'])
	const open = ALL_SECTIONS.filter((section) => canAccessSection(perms, section)).sort()
	assert.deepEqual(open, ['admin', 'rbac'])
	assert.equal(canAccessSection(perms, 'settings'), false)
})

test('пустой набор прав не открывает ни один раздел', () => {
	for (const section of ALL_SECTIONS) assert.equal(canAccessSection(new Set(), section), false, section)
})

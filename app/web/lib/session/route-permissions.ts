import { can, type PermissionKey } from '@bio-exam/rbac'

export type Section = 'admin' | 'tests' | 'attempts' | 'users' | 'groups' | 'rbac' | 'settings' | 'sidebar'

export const SECTION_PERMISSIONS: Readonly<Record<Section, readonly PermissionKey[]>> = {
	tests: ['tests.read'],
	attempts: ['tests.read'],
	users: ['users.edit'],
	groups: ['groups.manage_groups'],
	rbac: ['rbac.read'],
	settings: ['settings.manage'],
	sidebar: ['settings.manage'],
	admin: ['tests.read', 'users.edit', 'groups.manage_groups', 'rbac.read', 'settings.manage'],
}

const SECTION_PREFIXES: ReadonlyArray<readonly [string, Section]> = (
	[
		['/admin', 'admin'],
		['/admin/tests', 'tests'],
		['/admin/attempts', 'attempts'],
		['/admin/users', 'users'],
		['/admin/groups', 'groups'],
		['/admin/settings', 'settings'],
		['/admin/settings/rbac', 'rbac'],
		['/admin/sidebar', 'sidebar'],
	] as const
)
	.slice()
	.sort((a, b) => b[0].length - a[0].length)

export function sectionForPath(pathname: string): Section | null {
	for (const [prefix, section] of SECTION_PREFIXES) {
		if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return section
	}
	return null
}

export function canAccessSection(perms: ReadonlySet<PermissionKey>, section: Section): boolean {
	return SECTION_PERMISSIONS[section].some((key) => can(perms, key))
}

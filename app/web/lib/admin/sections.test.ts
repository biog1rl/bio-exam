import { PERMISSION_DOMAINS, ROLE_REGISTRY, type PermissionDomain, type PermissionKey } from '@bio-exam/rbac'

import assert from 'node:assert/strict'
import { test } from 'vitest'

import { ADMIN_HERO_TEXT, TEACHER_HERO_TEXT, adminHeroText, sectionsCountLabel } from './sections'

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

test.each<[number, string]>([
	[0, '0 разделов'],
	[1, '1 раздел'],
	[2, '2 раздела'],
	[4, '4 раздела'],
	[5, '5 разделов'],
	[11, '11 разделов'],
	[12, '12 разделов'],
	[21, '21 раздел'],
	[22, '22 раздела'],
])('sectionsCountLabel(%i) → %s', (count, label) => {
	assert.equal(sectionsCountLabel(count), label)
})

test('текст панели: администратор — общий, учитель без zone.all — про свою зону', () => {
	assert.equal(adminHeroText(rolePerms('admin')), ADMIN_HERO_TEXT)
	assert.equal(adminHeroText(rolePerms('teacher')), TEACHER_HERO_TEXT)
})

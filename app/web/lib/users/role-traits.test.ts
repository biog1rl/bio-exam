import { ROLES_LIST } from '@bio-exam/rbac'

import assert from 'node:assert/strict'
import { test } from 'vitest'

import { parseRoleTraits, type RoleTraits } from './role-traits'

const FALLBACK: RoleTraits[] = ROLES_LIST.map((role) => ({
	key: role.key,
	name: role.name,
	ownsZone: null,
	groupMember: null,
}))

test('parseRoleTraits отдаёт признаки ролей из ответа сервера в его порядке', () => {
	const body = {
		roles: [
			{ key: 'admin', name: 'Администратор', order: 0, grants: {}, ownsZone: false, groupMember: false },
			{ key: 'teacher', name: 'Учитель', order: 5, grants: {}, ownsZone: true, groupMember: false },
			{ key: 'user', name: 'Ученик', order: 10, grants: {}, ownsZone: false, groupMember: true },
		],
		overrides: [],
	}
	assert.deepEqual(parseRoleTraits(body), [
		{ key: 'admin', name: 'Администратор', ownsZone: false, groupMember: false },
		{ key: 'teacher', name: 'Учитель', ownsZone: true, groupMember: false },
		{ key: 'user', name: 'Ученик', ownsZone: false, groupMember: true },
	])
})

test('признак не boolean превращается в null, запись без key или name пропускается', () => {
	const body = {
		roles: [
			{ key: 'custom', name: 'Своя роль', ownsZone: 'yes' },
			{ key: 'broken', ownsZone: true, groupMember: true },
			{ name: 'Без ключа', ownsZone: true, groupMember: true },
			null,
		],
	}
	assert.deepEqual(parseRoleTraits(body), [{ key: 'custom', name: 'Своя роль', ownsZone: null, groupMember: null }])
})

test.each<[string, unknown]>([
	['undefined', undefined],
	['null', null],
	['строка', 'Forbidden'],
	['тело ошибки', { error: 'Forbidden' }],
	['roles не массив', { roles: 'admin' }],
	['пустой roles', { roles: [] }],
	['roles без пригодных записей', { roles: [{ key: 1 }, 'x'] }],
])('без пригодного списка ролей (%s) — ROLES_LIST без признаков', (_label, body) => {
	assert.deepEqual(parseRoleTraits(body), FALLBACK)
})

test('запасной список совпадает с ROLES_LIST по ключам и именам, признаки null', () => {
	const fallback = parseRoleTraits(undefined)
	assert.equal(fallback.length, ROLES_LIST.length)
	for (const role of fallback) {
		assert.equal(role.ownsZone, null)
		assert.equal(role.groupMember, null)
	}
})

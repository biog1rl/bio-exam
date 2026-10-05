import assert from 'node:assert/strict'
import { test } from 'vitest'

import {
	buildUserPatch,
	editRoleWarning,
	groupIdsChanged,
	groupItemSuffix,
	groupsTriggerLabel,
	initialOwnsZone,
	roleWarning,
} from './edit-user-form'

const traits = [
	{ key: 'admin', ownsZone: false },
	{ key: 'teacher', ownsZone: true },
	{ key: 'user', ownsZone: false },
]

const unknownTraits = [
	{ key: 'admin', ownsZone: null },
	{ key: 'teacher', ownsZone: null },
	{ key: 'user', ownsZone: null },
]

const formFields = {
	firstName: 'Анна',
	lastName: 'Иванова',
	login: 'anna',
	isActive: true,
	birthdate: '',
	telegram: '@anna',
	phone: '+7 (999) 999-99-99',
	email: 'anna@example.com',
}

test('groupsTriggerLabel: пустой набор, одна группа, 2–4 и 5+', () => {
	assert.equal(groupsTriggerLabel([]), 'Без групп')
	assert.equal(groupsTriggerLabel([{ name: '10А' }]), '10А')
	assert.equal(groupsTriggerLabel([{ name: 'a' }, { name: 'b' }]), '2 группы')
	assert.equal(groupsTriggerLabel([{ name: 'a' }, { name: 'b' }, { name: 'c' }]), '3 группы')
	assert.equal(groupsTriggerLabel(['a', 'b', 'c', 'd'].map((name) => ({ name }))), '4 группы')
	assert.equal(groupsTriggerLabel(['a', 'b', 'c', 'd', 'e'].map((name) => ({ name }))), '5 групп')
	assert.equal(groupsTriggerLabel(Array.from({ length: 12 }, (_, i) => ({ name: String(i) }))), '12 групп')
})

test('groupIdsChanged: порядок не важен, состав важен', () => {
	assert.equal(groupIdsChanged(['a', 'b'], ['b', 'a']), false)
	assert.equal(groupIdsChanged(['a'], ['a', 'b']), true)
	assert.equal(groupIdsChanged([], []), false)
	assert.equal(groupIdsChanged(['a', 'b'], ['a']), true)
	assert.equal(groupIdsChanged(['a'], ['b']), true)
})

test('groupItemSuffix: владелец или администраторы', () => {
	assert.equal(groupItemSuffix(null), ' · администраторы')
	assert.equal(groupItemSuffix({ id: 'o1', name: 'anna', firstName: 'Анна', lastName: 'Иванова' }), ' · Анна Иванова')
	assert.equal(groupItemSuffix({ id: 'o1', name: 'Анна', firstName: null, lastName: null }), ' · Анна')
	assert.equal(groupItemSuffix(undefined), '')
})

test('roleWarning: неизвестный признак или без изменений — без предупреждения', () => {
	assert.equal(roleWarning({ from: { ownsZone: null }, to: { ownsZone: true }, deactivating: false }), 'none')
	assert.equal(roleWarning({ from: { ownsZone: true }, to: { ownsZone: null }, deactivating: true }), 'none')
	assert.equal(roleWarning({ from: { ownsZone: true }, to: { ownsZone: true }, deactivating: false }), 'none')
	assert.equal(roleWarning({ from: { ownsZone: false }, to: { ownsZone: false }, deactivating: false }), 'none')
	assert.equal(roleWarning({ from: { ownsZone: false }, to: { ownsZone: false }, deactivating: true }), 'none')
})

test('initialOwnsZone: по полному исходному набору ролей', () => {
	assert.equal(initialOwnsZone(['user', 'teacher'], traits), true)
	assert.equal(initialOwnsZone(['user'], traits), false)
	assert.equal(initialOwnsZone([], traits), false)
	assert.equal(initialOwnsZone(['user'], unknownTraits), null)
	assert.equal(initialOwnsZone(['user', 'teacher'], unknownTraits), null)
	assert.equal(initialOwnsZone(['user', 'missing'], traits), null)
})

test('editRoleWarning: без смены роли и без деактивации предупреждения нет даже при нескольких ролях', () => {
	assert.equal(
		editRoleWarning({
			traits,
			loaded: true,
			initialRoleKeys: ['user', 'teacher'],
			initialRole: 'user',
			selectedRole: 'user',
			initialActive: true,
			isActive: true,
		}),
		'none'
	)
})

test('editRoleWarning: смена роли и деактивация по признакам', () => {
	const base = { traits, loaded: true, initialActive: true, isActive: true }
	assert.equal(
		editRoleWarning({ ...base, initialRoleKeys: ['user'], initialRole: 'user', selectedRole: 'teacher' }),
		'teacher-without-topics'
	)
	assert.equal(
		editRoleWarning({ ...base, initialRoleKeys: ['teacher'], initialRole: 'teacher', selectedRole: 'user' }),
		'zone-release'
	)
	assert.equal(
		editRoleWarning({ ...base, initialRoleKeys: ['user', 'teacher'], initialRole: 'user', selectedRole: 'admin' }),
		'zone-release'
	)
	assert.equal(
		editRoleWarning({
			...base,
			initialRoleKeys: ['teacher'],
			initialRole: 'teacher',
			selectedRole: 'teacher',
			isActive: false,
		}),
		'zone-release'
	)
	assert.equal(
		editRoleWarning({
			...base,
			initialRoleKeys: ['teacher'],
			initialRole: 'teacher',
			selectedRole: 'teacher',
			initialActive: false,
			isActive: false,
		}),
		'none'
	)
})

test('editRoleWarning: признаки не загружены — предупреждений нет', () => {
	assert.equal(
		editRoleWarning({
			traits,
			loaded: false,
			initialRoleKeys: ['teacher'],
			initialRole: 'teacher',
			selectedRole: 'user',
			initialActive: true,
			isActive: true,
		}),
		'none'
	)
	assert.equal(
		editRoleWarning({
			traits: unknownTraits,
			loaded: true,
			initialRoleKeys: ['user'],
			initialRole: 'user',
			selectedRole: 'teacher',
			initialActive: true,
			isActive: true,
		}),
		'none'
	)
})

test('buildUserPatch: без смены роли поля roles в теле нет', () => {
	const patch = buildUserPatch({ ...formFields, selectedRole: 'user', initialRole: 'user' })
	assert.equal(Object.hasOwn(patch, 'roles'), false)
	assert.deepEqual(patch, {
		firstName: 'Анна',
		lastName: 'Иванова',
		login: 'anna',
		isActive: true,
		birthdate: null,
		telegram: '@anna',
		phone: '+7 (999) 999-99-99',
		email: 'anna@example.com',
	})
})

test('buildUserPatch: при смене роли roles из одной выбранной роли', () => {
	const patch = buildUserPatch({ ...formFields, birthdate: '01/02/2010', selectedRole: 'teacher', initialRole: 'user' })
	assert.deepEqual(patch.roles, ['teacher'])
	assert.equal(patch.birthdate, '01/02/2010')
})

test('buildUserPatch: роль выбрана у пользователя без исходной роли — roles уходит', () => {
	assert.deepEqual(buildUserPatch({ ...formFields, selectedRole: 'user', initialRole: null }).roles, ['user'])
	assert.equal(
		Object.hasOwn(buildUserPatch({ ...formFields, selectedRole: null, initialRole: 'user' }), 'roles'),
		false
	)
})

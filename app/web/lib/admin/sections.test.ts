import { PERMISSION_DOMAINS, ROLE_REGISTRY, type PermissionDomain, type PermissionKey } from '@bio-exam/rbac'

import assert from 'node:assert/strict'
import { test } from 'vitest'

import {
	ADMIN_HERO_TEXT,
	TEACHER_HERO_TEXT,
	adminHeroText,
	sectionsCountLabel,
	visibleAdminCards,
	visibleServiceLinks,
} from './sections'

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
	[0, '0 активных разделов'],
	[1, '1 активный раздел'],
	[2, '2 активных раздела'],
	[3, '3 активных раздела'],
	[4, '4 активных раздела'],
	[5, '5 активных разделов'],
	[11, '11 активных разделов'],
])('sectionsCountLabel(%i) → %s', (count, label) => {
	assert.equal(sectionsCountLabel(count), label)
})

test('учитель видит карточки tests, users, groups, attempts с текстами учителя', () => {
	const cards = visibleAdminCards(rolePerms('teacher'))
	assert.deepEqual(
		cards.map((card) => card.key),
		['tests', 'users', 'groups', 'attempts']
	)
	assert.deepEqual(
		cards.map((card) => card.description),
		[
			'Тесты и вопросы закреплённых за вами тем.',
			'Ученики ваших групп и приглашение новых.',
			'Ваши учебные группы и их состав.',
			'Попытки учеников по вашим темам и разбор ответов.',
		]
	)
	assert.equal(sectionsCountLabel(cards.length), '4 активных раздела')
})

test('администратор видит все пять карточек с прежними текстами', () => {
	const cards = visibleAdminCards(rolePerms('admin'))
	assert.deepEqual(
		cards.map((card) => card.key),
		['tests', 'users', 'groups', 'settings', 'attempts']
	)
	assert.deepEqual(
		cards.map((card) => card.description),
		[
			'Темы, тесты, вопросы и правила оценивания.',
			'Аккаунты студентов, преподавателей и администраторов.',
			'Учебные группы и состав участников.',
			'RBAC, графики и параметры внутренних разделов.',
			'Журнал прохождений, баллы и переходы к разбору ответов.',
		]
	)
	assert.equal(sectionsCountLabel(cards.length), '5 активных разделов')
})

test('роль user не видит ни одной карточки и ни одной служебной ссылки', () => {
	const perms = rolePerms('user')
	assert.deepEqual(visibleAdminCards(perms), [])
	assert.deepEqual(visibleServiceLinks(perms), [])
})

test('служебные ссылки: учителю пусто, администратору RBAC, График, Сайдбар', () => {
	assert.deepEqual(visibleServiceLinks(rolePerms('teacher')), [])
	assert.deepEqual(
		visibleServiceLinks(rolePerms('admin')).map((link) => link.label),
		['RBAC', 'График', 'Сайдбар']
	)
})

test('служебные ссылки фильтруются по разделу каждой ссылки', () => {
	assert.deepEqual(
		visibleServiceLinks(new Set<PermissionKey>(['rbac.read'])).map((link) => link.href),
		['/admin/settings/rbac']
	)
	assert.deepEqual(
		visibleServiceLinks(new Set<PermissionKey>(['settings.manage'])).map((link) => link.href),
		['/admin/settings/chart', '/admin/sidebar']
	)
})

test('абзац героя: текст учителя без zone.all, прежний текст с zone.all', () => {
	assert.equal(adminHeroText(rolePerms('teacher')), TEACHER_HERO_TEXT)
	assert.equal(TEACHER_HERO_TEXT, 'Ваша зона: закреплённые темы, ваши группы и их ученики.')
	assert.equal(adminHeroText(rolePerms('admin')), ADMIN_HERO_TEXT)
})

test('без zone.all описание карточки берётся из текста учителя при любом наборе прав', () => {
	const cards = visibleAdminCards(new Set<PermissionKey>(['tests.read', 'users.edit', 'settings.manage']))
	assert.deepEqual(
		cards.map((card) => [card.key, card.description]),
		[
			['tests', 'Тесты и вопросы закреплённых за вами тем.'],
			['users', 'Ученики ваших групп и приглашение новых.'],
			['settings', 'RBAC, графики и параметры внутренних разделов.'],
			['attempts', 'Попытки учеников по вашим темам и разбор ответов.'],
		]
	)
})

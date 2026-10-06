import assert from 'node:assert/strict'
import { test } from 'vitest'

import {
	DEFAULT_GROUPS_SORT,
	candidatesState,
	filterGroups,
	groupMembersSeed,
	groupSaveDisabled,
	groupSaveErrorText,
	groupSavePayload,
	groupsEmptyState,
	groupsSearch,
	ownerLabel,
	parseGroupsUrl,
	sortGroups,
} from './group-form'

test('groupSaveDisabled: правка группы ждёт свежего состава в этом открытии, новая группа не ждёт', () => {
	assert.equal(groupSaveDisabled({ saving: false, editing: true, membersReady: false }), true)
	assert.equal(groupSaveDisabled({ saving: false, editing: true, membersReady: true }), false)
	assert.equal(groupSaveDisabled({ saving: false, editing: false, membersReady: false }), false)
	assert.equal(groupSaveDisabled({ saving: true, editing: false, membersReady: false }), true)
	assert.equal(groupSaveDisabled({ saving: true, editing: true, membersReady: true }), true)
})

test('groupMembersSeed: состав засевается один раз на открытие из ответа для открытой группы', () => {
	const response = { id: 'g1', memberIds: ['u1', 'u2'] }
	assert.deepEqual(groupMembersSeed({ groupId: 'g1', seededFor: null, response }), ['u1', 'u2'])
	assert.equal(groupMembersSeed({ groupId: 'g1', seededFor: 'g1', response }), null)
	assert.deepEqual(groupMembersSeed({ groupId: 'g1', seededFor: 'g0', response }), ['u1', 'u2'])
})

test('groupMembersSeed: ответ для другой группы или без открытой группы не засевает', () => {
	const response = { id: 'g1', memberIds: ['u1'] }
	assert.equal(groupMembersSeed({ groupId: 'g2', seededFor: null, response }), null)
	assert.equal(groupMembersSeed({ groupId: null, seededFor: null, response }), null)
})

test('candidatesState: подсказка, поиск, ошибка, пусто и список', () => {
	const base = { query: 'Ан', debounced: 'Ан', loading: false, error: false, count: 0 }
	assert.equal(candidatesState({ ...base, query: 'А', debounced: 'А' }), 'hint')
	assert.equal(candidatesState({ ...base, debounced: 'А' }), 'loading')
	assert.equal(candidatesState({ ...base, loading: true }), 'loading')
	assert.equal(candidatesState({ ...base, error: true }), 'error')
	assert.equal(candidatesState(base), 'empty')
	assert.equal(candidatesState({ ...base, count: 3 }), 'list')
})

test('groupSaveErrorText: тексты ошибок сохранения группы', () => {
	assert.equal(groupSaveErrorText(400), 'В группу учителя можно добавить только учеников.')
	assert.equal(groupSaveErrorText(403), 'Недостаточно прав для этого действия. Обратитесь к администратору.')
	assert.equal(groupSaveErrorText(500), 'Не удалось сохранить. Попробуйте ещё раз.')
	assert.equal(groupSaveErrorText(404), 'Не удалось сохранить. Попробуйте ещё раз.')
	assert.equal(groupSaveErrorText(), 'Не удалось сохранить. Попробуйте ещё раз.')
})

test('groupSavePayload: ownerId только у администратора', () => {
	assert.deepEqual(groupSavePayload({ zoneAll: false, name: ' 9А ', memberIds: ['u1'], ownerId: 't1' }), {
		name: '9А',
		memberIds: ['u1'],
	})
	assert.ok(!('ownerId' in groupSavePayload({ zoneAll: false, name: '9А', memberIds: [], ownerId: null })))
	assert.deepEqual(groupSavePayload({ zoneAll: true, name: '9А', memberIds: [], ownerId: null }), {
		name: '9А',
		memberIds: [],
		ownerId: null,
	})
	assert.deepEqual(groupSavePayload({ zoneAll: true, name: '9А', memberIds: ['u1'], ownerId: 't1' }), {
		name: '9А',
		memberIds: ['u1'],
		ownerId: 't1',
	})
})

test('ownerLabel: администраторы или имя учителя', () => {
	assert.equal(ownerLabel(null), 'Администраторы')
	assert.equal(ownerLabel(undefined), 'Администраторы')
	assert.equal(
		ownerLabel({ id: 't1', name: 'Мария Петровна', firstName: 'Мария', lastName: 'Петрова' }),
		'Мария Петрова'
	)
	assert.equal(ownerLabel({ id: 't1', name: null, firstName: 'Мария', lastName: 'Петрова' }), 'Мария Петрова')
})

test('groupsEmptyState: пустое состояние учителя только без групп и без поиска', () => {
	assert.equal(groupsEmptyState({ zoneAll: false, groups: 0, search: '' }), 'teacher-empty')
	assert.equal(groupsEmptyState({ zoneAll: false, groups: 0, search: '   ' }), 'teacher-empty')
	assert.equal(groupsEmptyState({ zoneAll: false, groups: 0, search: '9А' }), 'default')
	assert.equal(groupsEmptyState({ zoneAll: true, groups: 0, search: '' }), 'default')
	assert.equal(groupsEmptyState({ zoneAll: false, groups: 2, search: '' }), 'default')
})

test('адрес списка групп: поиск и сортировка, порядок сервера не пишется', () => {
	assert.equal(groupsSearch({ q: '', sort: DEFAULT_GROUPS_SORT }), '')
	assert.equal(groupsSearch({ q: '9 А', sort: { key: 'members', direction: 'desc' } }), '?q=9%20%D0%90&sort=-members')
	assert.deepEqual(parseGroupsUrl(new URLSearchParams('q=9%20%D0%90&sort=-members')), {
		q: '9 А',
		sort: { key: 'members', direction: 'desc' },
	})
	assert.deepEqual(parseGroupsUrl(new URLSearchParams('sort=order')).sort, DEFAULT_GROUPS_SORT)
})

test('filterGroups и sortGroups: поиск по названию, сортировка по владельцу и участникам, сброс', () => {
	const groups = [
		{ name: '9Б', memberCount: 7, owner: { id: 't1', name: 'Мария', firstName: null, lastName: null } },
		{ name: '10А', memberCount: 3, owner: null },
		{ name: '9А', memberCount: 12, owner: { id: 't2', name: 'Борис', firstName: null, lastName: null } },
	]
	const names = (list: readonly { name: string }[]) => list.map((group) => group.name)
	assert.deepEqual(names(filterGroups(groups, ' 9')), ['9Б', '9А'])
	assert.deepEqual(names(sortGroups(groups, { key: 'owner', direction: 'asc' })), ['10А', '9А', '9Б'])
	assert.deepEqual(names(sortGroups(groups, { key: 'members', direction: 'desc' })), ['9А', '9Б', '10А'])
	assert.deepEqual(names(sortGroups(groups, DEFAULT_GROUPS_SORT)), ['9Б', '10А', '9А'])
})

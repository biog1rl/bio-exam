import assert from 'node:assert/strict'
import { test } from 'vitest'

import {
	DEFAULT_GROUPS_SORT,
	filterGroups,
	groupsEmptyState,
	groupsSearch,
	parseGroupsUrl,
	sortGroups,
} from './groups-table'

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

import {
	cycleSort,
	matchesNeedle,
	parseSortParam,
	searchNeedle,
	searchString,
	sortParam,
	sortRows,
	type ParamsLike,
	type TableSort,
} from '@/lib/utils/table-sort'

import { ownerLabel, type GroupOwner } from './group-form'

export type GroupsSortKey = 'order' | 'name' | 'owner' | 'members'

export type GroupsSort = TableSort<GroupsSortKey>

export type GroupsUrlState = { q: string; sort: GroupsSort }

export type GroupsTableRow = { name: string; memberCount: number; owner?: GroupOwner | null }

export const DEFAULT_GROUPS_SORT: GroupsSort = { key: 'order', direction: 'asc' }

const GROUPS_SORT_KEYS: readonly GroupsSortKey[] = ['name', 'owner', 'members']

export function parseGroupsUrl(params: ParamsLike | null | undefined): GroupsUrlState {
	return { q: params?.get('q') ?? '', sort: parseSortParam(params?.get('sort'), GROUPS_SORT_KEYS, DEFAULT_GROUPS_SORT) }
}

export function groupsSearch(state: GroupsUrlState): string {
	return searchString({ q: state.q, sort: sortParam(state.sort, DEFAULT_GROUPS_SORT) })
}

export function nextGroupsSort(current: GroupsSort, key: GroupsSortKey): GroupsSort {
	return cycleSort(current, key, DEFAULT_GROUPS_SORT)
}

export function filterGroups<T extends GroupsTableRow>(groups: readonly T[], q: string): T[] {
	const needle = searchNeedle(q)
	return groups.filter((group) => matchesNeedle(needle, [group.name]))
}

function compareGroups(a: GroupsTableRow, b: GroupsTableRow, key: GroupsSortKey): number {
	if (key === 'name') return a.name.localeCompare(b.name, 'ru')
	if (key === 'owner') return ownerLabel(a.owner).localeCompare(ownerLabel(b.owner), 'ru')
	if (key === 'members') return a.memberCount - b.memberCount
	return 0
}

export function sortGroups<T extends GroupsTableRow>(groups: readonly T[], sort: GroupsSort): T[] {
	return sortRows(groups, sort, compareGroups)
}

export function groupsEmptyState(input: {
	zoneAll: boolean
	groups: number
	search: string
}): 'teacher-empty' | 'default' {
	if (input.zoneAll || input.groups > 0 || input.search.trim()) return 'default'
	return 'teacher-empty'
}

import { ROLES_LIST } from '@bio-exam/rbac'

import { parseFilterList } from '@/lib/utils/column-filter'
import {
	cycleSort,
	matchesNeedle,
	parseListParam,
	parseSortParam,
	searchNeedle,
	searchString,
	sortParam,
	sortRows,
	type ParamsLike,
	type TableSort,
} from '@/lib/utils/table-sort'

import { personName } from './person-name'

export const USERS_PATH = '/admin/users'

export type UsersStatus = 'active' | 'inactive'

export type UsersSortKey = 'order' | 'name' | 'created'

export type UsersSort = TableSort<UsersSortKey>

export type UsersUrlState = {
	q: string
	groups: string[]
	roles: string[]
	statuses: UsersStatus[]
	sort: UsersSort
}

export type UsersTableRow = {
	login: string | null
	firstName: string | null
	lastName: string | null
	name: string | null
	roles: readonly string[]
	isActive: boolean | 0 | 1
	createdAt: string
	groups: ReadonlyArray<{ id: string }>
}

export const USERS_STATUSES: readonly UsersStatus[] = ['active', 'inactive']
export const DEFAULT_USERS_STATUSES: readonly UsersStatus[] = ['active']
export const DEFAULT_USERS_SORT: UsersSort = { key: 'order', direction: 'asc' }

const SORT_KEYS: readonly UsersSortKey[] = ['name', 'created']
const ROLE_ORDER: readonly string[] = ROLES_LIST.map((role) => role.key)

function parseStatuses(value: string | null | undefined): UsersStatus[] {
	if (value === 'all') return []
	const statuses = parseFilterList(value, USERS_STATUSES)
	return statuses.length > 0 ? statuses : [...DEFAULT_USERS_STATUSES]
}

function statusParam(statuses: readonly UsersStatus[]): string | null {
	if (statuses.length === 0) return 'all'
	const isDefault =
		statuses.length === DEFAULT_USERS_STATUSES.length &&
		DEFAULT_USERS_STATUSES.every((status) => statuses.includes(status))
	return isDefault ? null : statuses.join(',')
}

export function parseUsersUrl(params: ParamsLike | null | undefined): UsersUrlState {
	return {
		q: params?.get('q') ?? '',
		groups: parseListParam(params?.get('group')),
		roles: parseListParam(params?.get('role')),
		statuses: parseStatuses(params?.get('status')),
		sort: parseSortParam(params?.get('sort'), SORT_KEYS, DEFAULT_USERS_SORT),
	}
}

export function usersSearch(state: UsersUrlState): string {
	return searchString({
		group: state.groups,
		q: state.q,
		role: state.roles,
		status: statusParam(state.statuses),
		sort: sortParam(state.sort, DEFAULT_USERS_SORT),
	})
}

export function usersUrl(group: string | null): string {
	return `${USERS_PATH}${usersSearch({
		q: '',
		groups: group ? [group] : [],
		roles: [],
		statuses: [...DEFAULT_USERS_STATUSES],
		sort: DEFAULT_USERS_SORT,
	})}`
}

export function knownOnly(requested: readonly string[], known: readonly string[] | undefined): string[] {
	if (known === undefined) return [...requested]
	return requested.filter((value) => known.includes(value))
}

export function nextUsersSort(current: UsersSort, key: UsersSortKey): UsersSort {
	return cycleSort(current, key, DEFAULT_USERS_SORT)
}

function statusOf(user: Pick<UsersTableRow, 'isActive'>): UsersStatus {
	return user.isActive ? 'active' : 'inactive'
}

export function roleCounts(rows: readonly Pick<UsersTableRow, 'roles'>[]): { role: string; count: number }[] {
	const counts = new Map<string, number>()
	for (const row of rows) {
		for (const key of new Set(row.roles)) counts.set(key, (counts.get(key) ?? 0) + 1)
	}
	const known = ROLE_ORDER.filter((key) => counts.has(key))
	const rest = [...counts.keys()].filter((key) => !ROLE_ORDER.includes(key)).sort()
	return [...known, ...rest].map((role) => ({ role, count: counts.get(role) ?? 0 }))
}

function hasAnyRole(roleKeys: readonly string[], selected: readonly string[]): boolean {
	return roleKeys.some((key) => selected.includes(key))
}

export function usersStatusCounts(rows: readonly Pick<UsersTableRow, 'isActive'>[]): Record<UsersStatus, number> {
	const active = rows.filter((row) => statusOf(row) === 'active').length
	return { active, inactive: rows.length - active }
}

export function filterUsers<T extends UsersTableRow>(
	rows: readonly T[],
	filter: Pick<UsersUrlState, 'q' | 'groups' | 'roles' | 'statuses'>
): T[] {
	const needle = searchNeedle(filter.q)
	return rows.filter((row) => {
		if (filter.statuses.length > 0 && !filter.statuses.includes(statusOf(row))) return false
		if (filter.groups.length > 0 && !row.groups.some((group) => filter.groups.includes(group.id))) return false
		if (filter.roles.length > 0 && !hasAnyRole(row.roles, filter.roles)) return false
		return matchesNeedle(needle, [row.login, row.name, personName(row)])
	})
}

function compareRows(a: UsersTableRow, b: UsersTableRow, key: UsersSortKey): number {
	if (key === 'name') return personName(a).localeCompare(personName(b), 'ru')
	if (key === 'created') return Date.parse(a.createdAt) - Date.parse(b.createdAt)
	return 0
}

export function sortUsers<T extends UsersTableRow>(rows: readonly T[], sort: UsersSort): T[] {
	return sortRows(rows, sort, compareRows)
}

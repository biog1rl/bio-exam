import { ROLES_LIST } from '@bio-exam/rbac'

import { parseFilterList } from '@/lib/utils/column-filter'
import { cycleSort, type TableSort } from '@/lib/utils/table-sort'

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
const MAX_ID_LENGTH = 200
const ROLE_ORDER: readonly string[] = ROLES_LIST.map((role) => role.key)

type ParamsLike = { get(name: string): string | null }

function parseIds(value: string | null | undefined): string[] {
	if (!value) return []
	const ids = value
		.split(',')
		.map((part) => part.trim())
		.filter((part) => part.length > 0 && part.length <= MAX_ID_LENGTH)
	return [...new Set(ids)]
}

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

function parseSort(value: string | null | undefined): UsersSort {
	if (!value) return DEFAULT_USERS_SORT
	const direction = value.startsWith('-') ? 'desc' : 'asc'
	const key = value.replace(/^-/, '') as UsersSortKey
	return SORT_KEYS.includes(key) ? { key, direction } : DEFAULT_USERS_SORT
}

export function parseUsersUrl(params: ParamsLike | null | undefined): UsersUrlState {
	return {
		q: params?.get('q') ?? '',
		groups: parseIds(params?.get('group')),
		roles: parseIds(params?.get('role')),
		statuses: parseStatuses(params?.get('status')),
		sort: parseSort(params?.get('sort')),
	}
}

function idsParam(ids: readonly string[]): string {
	return ids.map(encodeURIComponent).join(',')
}

export function usersSearch(state: UsersUrlState): string {
	const parts: string[] = []
	if (state.groups.length > 0) parts.push(`group=${idsParam(state.groups)}`)
	if (state.q.trim()) parts.push(`q=${encodeURIComponent(state.q)}`)
	if (state.roles.length > 0) parts.push(`role=${idsParam(state.roles)}`)
	const status = statusParam(state.statuses)
	if (status) parts.push(`status=${status}`)
	if (state.sort.key !== 'order') parts.push(`sort=${state.sort.direction === 'desc' ? '-' : ''}${state.sort.key}`)
	return parts.length > 0 ? `?${parts.join('&')}` : ''
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
	const needle = filter.q.trim().toLocaleLowerCase('ru')
	return rows.filter((row) => {
		if (filter.statuses.length > 0 && !filter.statuses.includes(statusOf(row))) return false
		if (filter.groups.length > 0 && !row.groups.some((group) => filter.groups.includes(group.id))) return false
		if (filter.roles.length > 0 && !hasAnyRole(row.roles, filter.roles)) return false
		if (!needle) return true
		const fullName = [row.firstName ?? '', row.lastName ?? ''].join(' ').trim()
		return [row.login, row.firstName, row.lastName, fullName, row.name].some((value) =>
			value?.toLocaleLowerCase('ru').includes(needle)
		)
	})
}

function compareRows(a: UsersTableRow, b: UsersTableRow, key: UsersSortKey): number {
	if (key === 'name') return personName(a).localeCompare(personName(b), 'ru')
	if (key === 'created') return Date.parse(a.createdAt) - Date.parse(b.createdAt)
	return 0
}

export function sortUsers<T extends UsersTableRow>(rows: readonly T[], sort: UsersSort): T[] {
	const sign = sort.direction === 'asc' ? 1 : -1
	return rows
		.map((row, index) => ({ row, index }))
		.sort((a, b) => sign * compareRows(a.row, b.row, sort.key) || a.index - b.index)
		.map((entry) => entry.row)
}

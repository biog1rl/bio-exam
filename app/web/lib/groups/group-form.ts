import { cycleSort, type TableSort } from '@/lib/utils/table-sort'

export const MIN_CANDIDATE_QUERY = 2

export const CANDIDATES_HINT = 'Введите минимум 2 символа'
export const CANDIDATES_EMPTY = 'Никого не найдено. Новых учеников приглашают в разделе «Пользователи».'
export const CANDIDATES_ERROR = 'Не удалось выполнить поиск. Попробуйте ещё раз.'
export const OWNER_HINT = 'Учитель-владелец видит группу и назначает её ученикам тесты своих тем.'
export const ADMINS_OWNER_LABEL = 'Администраторы'
export const TEACHER_GROUPS_EMPTY = 'Групп пока нет. Создайте группу, чтобы приглашать учеников и назначать им тесты.'
export const TEACHER_DELETE_NOTE = 'Ученики группы пропадут из вашего списка, если не состоят в других ваших группах.'

const GENERIC_SAVE_ERROR = 'Не удалось сохранить. Попробуйте ещё раз.'
const FORBIDDEN_ACTION = 'Недостаточно прав для этого действия. Обратитесь к администратору.'
const STUDENTS_ONLY = 'В группу учителя можно добавить только учеников.'

export type PersonName = {
	name?: string | null
	firstName?: string | null
	lastName?: string | null
}

export type GroupOwner = {
	id: string
	name: string | null
	firstName: string | null
	lastName: string | null
}

export type CandidatesState = 'hint' | 'loading' | 'error' | 'empty' | 'list'

export function candidatesState(input: {
	query: string
	debounced: string
	loading: boolean
	error: boolean
	count: number
}): CandidatesState {
	if (input.query.trim().length < MIN_CANDIDATE_QUERY) return 'hint'
	if (input.query.trim() !== input.debounced.trim() || input.loading) return 'loading'
	if (input.error) return 'error'
	return input.count === 0 ? 'empty' : 'list'
}

export function personLabel(person: PersonName): string {
	const name = person.name?.trim()
	if (name) return name
	const fullName = [person.firstName ?? '', person.lastName ?? ''].join(' ').trim()
	return fullName || '—'
}

export function groupSaveErrorText(status?: number): string {
	if (status === 400) return STUDENTS_ONLY
	if (status === 403) return FORBIDDEN_ACTION
	return GENERIC_SAVE_ERROR
}

export function groupSaveDisabled(input: { saving: boolean; editing: boolean; membersReady: boolean }): boolean {
	return input.saving || (input.editing && !input.membersReady)
}

export function groupMembersSeed(input: {
	groupId: string | null
	seededFor: string | null
	response: { id: string; memberIds: string[] }
}): string[] | null {
	if (!input.groupId || input.response.id !== input.groupId || input.seededFor === input.groupId) return null
	return input.response.memberIds
}

export type GroupSavePayload = {
	name: string
	memberIds: string[]
	ownerId?: string | null
}

export function groupSavePayload(input: {
	zoneAll: boolean
	name: string
	memberIds: string[]
	ownerId: string | null
}): GroupSavePayload {
	const payload: GroupSavePayload = { name: input.name.trim(), memberIds: input.memberIds }
	if (input.zoneAll) payload.ownerId = input.ownerId
	return payload
}

export function ownerLabel(owner: GroupOwner | null | undefined): string {
	if (!owner) return ADMINS_OWNER_LABEL
	return personLabel(owner)
}

export function groupsEmptyState(input: {
	zoneAll: boolean
	groups: number
	search: string
}): 'teacher-empty' | 'default' {
	if (input.zoneAll || input.groups > 0 || input.search.trim()) return 'default'
	return 'teacher-empty'
}

export type GroupsSortKey = 'order' | 'name' | 'owner' | 'members'

export type GroupsSort = TableSort<GroupsSortKey>

export type GroupsUrlState = { q: string; sort: GroupsSort }

export type GroupsTableRow = { name: string; memberCount: number; owner?: GroupOwner | null }

export const DEFAULT_GROUPS_SORT: GroupsSort = { key: 'order', direction: 'asc' }

const GROUPS_SORT_KEYS: readonly GroupsSortKey[] = ['name', 'owner', 'members']

type ParamsLike = { get(name: string): string | null }

function parseGroupsSort(value: string | null | undefined): GroupsSort {
	if (!value) return DEFAULT_GROUPS_SORT
	const direction = value.startsWith('-') ? 'desc' : 'asc'
	const key = value.replace(/^-/, '') as GroupsSortKey
	return GROUPS_SORT_KEYS.includes(key) ? { key, direction } : DEFAULT_GROUPS_SORT
}

export function parseGroupsUrl(params: ParamsLike | null | undefined): GroupsUrlState {
	return { q: params?.get('q') ?? '', sort: parseGroupsSort(params?.get('sort')) }
}

export function groupsSearch(state: GroupsUrlState): string {
	const parts: string[] = []
	if (state.q.trim()) parts.push(`q=${encodeURIComponent(state.q)}`)
	if (state.sort.key !== 'order') parts.push(`sort=${state.sort.direction === 'desc' ? '-' : ''}${state.sort.key}`)
	return parts.length > 0 ? `?${parts.join('&')}` : ''
}

export function nextGroupsSort(current: GroupsSort, key: GroupsSortKey): GroupsSort {
	return cycleSort(current, key, DEFAULT_GROUPS_SORT)
}

export function filterGroups<T extends GroupsTableRow>(groups: readonly T[], q: string): T[] {
	const needle = q.trim().toLocaleLowerCase('ru')
	if (!needle) return [...groups]
	return groups.filter((group) => group.name.toLocaleLowerCase('ru').includes(needle))
}

function compareGroups(a: GroupsTableRow, b: GroupsTableRow, key: GroupsSortKey): number {
	if (key === 'name') return a.name.localeCompare(b.name, 'ru')
	if (key === 'owner') return ownerLabel(a.owner).localeCompare(ownerLabel(b.owner), 'ru')
	if (key === 'members') return a.memberCount - b.memberCount
	return 0
}

export function sortGroups<T extends GroupsTableRow>(groups: readonly T[], sort: GroupsSort): T[] {
	const sign = sort.direction === 'asc' ? 1 : -1
	return groups
		.map((group, index) => ({ group, index }))
		.sort((a, b) => sign * compareGroups(a.group, b.group, sort.key) || a.index - b.index)
		.map((entry) => entry.group)
}

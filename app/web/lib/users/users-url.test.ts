import { describe, expect, it } from 'vitest'

import {
	DEFAULT_USERS_SORT,
	filterUsers,
	knownOnly,
	parseUsersUrl,
	roleCounts,
	sortUsers,
	usersSearch,
	usersUrl,
	type UsersUrlState,
} from './users-url'

function urlState(search: string): UsersUrlState {
	return parseUsersUrl(new URL(search, 'http://x').searchParams)
}

describe('адрес списка пользователей', () => {
	it('без параметров — все группы и роли, только активные, порядок сервера', () => {
		expect(usersUrl(null)).toBe('/admin/users')
		expect(urlState('/admin/users')).toEqual({
			q: '',
			groups: [],
			roles: [],
			statuses: ['active'],
			sort: DEFAULT_USERS_SORT,
		})
	})

	it('ссылка на группу даёт один параметр group и читается обратно', () => {
		expect(usersUrl('g 1')).toBe('/admin/users?group=g%201')
		expect(urlState(usersUrl('g 1')).groups).toEqual(['g 1'])
	})

	it('группы и роли — список через запятую без пустых, длинных и повторов', () => {
		const state = urlState(`/admin/users?group=g1,%20,g2,g1,${'x'.repeat(201)}&role=teacher,user`)
		expect(state.groups).toEqual(['g1', 'g2'])
		expect(state.roles).toEqual(['teacher', 'user'])
	})

	it('статус по умолчанию не пишется в адрес, «все» и выбор хранятся явно', () => {
		const base = urlState('/admin/users')
		expect(usersSearch({ ...base, statuses: ['active'] })).toBe('')
		expect(usersSearch({ ...base, statuses: [] })).toBe('?status=all')
		expect(usersSearch({ ...base, statuses: ['inactive'] })).toBe('?status=inactive')
		expect(urlState('/admin/users?status=all').statuses).toEqual([])
		expect(urlState('/admin/users?status=inactive,active').statuses).toEqual(['active', 'inactive'])
		expect(urlState('/admin/users?status=junk').statuses).toEqual(['active'])
	})

	it('поиск, фильтры и сортировка переживают запись и чтение адреса', () => {
		const state: UsersUrlState = {
			q: 'Иван П',
			groups: ['g1', 'g2'],
			roles: ['user'],
			statuses: [],
			sort: { key: 'created', direction: 'desc' },
		}
		expect(usersSearch(state)).toBe(
			'?group=g1,g2&q=%D0%98%D0%B2%D0%B0%D0%BD%20%D0%9F&role=user&status=all&sort=-created'
		)
		expect(urlState(`/admin/users${usersSearch(state)}`)).toEqual(state)
		expect(urlState('/admin/users?sort=-order').sort).toEqual(DEFAULT_USERS_SORT)
	})
})

describe('knownOnly', () => {
	it('пока список не загружен, верит адресу; потом отбрасывает чужие и устаревшие значения', () => {
		expect(knownOnly(['g-9'], undefined)).toEqual(['g-9'])
		expect(knownOnly(['g-2', 'g-9'], ['g-1', 'g-2'])).toEqual(['g-2'])
	})
})

describe('фильтр и сортировка строк', () => {
	const row = (id: string, patch: Partial<Parameters<typeof filterUsers>[0][number]>) => ({
		id,
		login: id,
		firstName: null,
		lastName: null,
		name: null,
		roles: ['user'],
		isActive: true,
		createdAt: '2026-01-01T00:00:00Z',
		groups: [] as { id: string }[],
		...patch,
	})
	const rows = [
		row('ivanov', { firstName: 'Иван', lastName: 'Петров', groups: [{ id: 'g1' }], createdAt: '2026-03-01T00:00:00Z' }),
		row('teacher1', { name: 'Анна', roles: ['teacher'], createdAt: '2026-01-01T00:00:00Z' }),
		row('ghost', { isActive: 0, groups: [{ id: 'g2' }], createdAt: '2026-02-01T00:00:00Z' }),
	]
	const all = { q: '', groups: [], roles: [], statuses: [] }
	const ids = (list: readonly { id: string }[]) => list.map((item) => item.id)

	it('статус, группы и роли сужают список, пустой выбор значит «все»', () => {
		expect(ids(filterUsers(rows, all))).toEqual(['ivanov', 'teacher1', 'ghost'])
		expect(ids(filterUsers(rows, { ...all, statuses: ['active'] }))).toEqual(['ivanov', 'teacher1'])
		expect(ids(filterUsers(rows, { ...all, groups: ['g1', 'g2'] }))).toEqual(['ivanov', 'ghost'])
		expect(ids(filterUsers(rows, { ...all, roles: ['teacher'] }))).toEqual(['teacher1'])
	})

	it('поиск по логину, имени, фамилии, полному имени и имени без ФИО', () => {
		expect(ids(filterUsers(rows, { ...all, q: ' иван петров ' }))).toEqual(['ivanov'])
		expect(ids(filterUsers(rows, { ...all, q: 'анна' }))).toEqual(['teacher1'])
		expect(ids(filterUsers(rows, { ...all, q: 'GHO' }))).toEqual(['ghost'])
	})

	it('сортировка по имени и дате создания, сброс возвращает порядок сервера', () => {
		expect(ids(sortUsers(rows, { key: 'name', direction: 'asc' }))).toEqual(['teacher1', 'ivanov', 'ghost'])
		expect(ids(sortUsers(rows, { key: 'created', direction: 'desc' }))).toEqual(['ivanov', 'ghost', 'teacher1'])
		expect(ids(sortUsers(rows, DEFAULT_USERS_SORT))).toEqual(['ivanov', 'teacher1', 'ghost'])
	})

	it('роли для фильтра со счётчиками — сначала известные по порядку реестра, затем остальные', () => {
		expect(roleCounts([{ roles: ['user', 'custom', 'user'] }, { roles: ['admin', 'user'] }])).toEqual([
			{ role: 'admin', count: 1 },
			{ role: 'user', count: 2 },
			{ role: 'custom', count: 1 },
		])
	})
})

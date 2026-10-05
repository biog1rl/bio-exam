import { describe, expect, it } from 'vitest'

import {
	DEFAULT_BANK_SORT,
	bankSearch,
	filterBankTests,
	nextBankSort,
	parseBankUrl,
	sortBankTests,
	statusCounts,
} from './bank-table'

const TESTS = [
	{
		id: 'a',
		title: 'Видоизменения корня',
		topicTitle: 'Ботаника',
		isPublished: false,
		questionsCount: 30,
		updatedAt: '2026-09-22T10:00:00Z',
	},
	{
		id: 'b',
		title: 'Гаметогенез',
		topicTitle: 'Клеточный цикл',
		isPublished: true,
		questionsCount: 12,
		updatedAt: '2026-05-20T10:00:00Z',
	},
	{
		id: 'c',
		title: 'Анатомия сердца',
		topicTitle: 'Анатомия',
		isPublished: true,
		questionsCount: 30,
		updatedAt: '2026-08-10T10:00:00Z',
	},
]

const ids = (rows: { id: string }[]) => rows.map((row) => row.id)

describe('фильтры банка в адресе', () => {
	it('пустой адрес — без фильтра статуса, без поиска, порядок банка', () => {
		expect(parseBankUrl(new URLSearchParams(''))).toEqual({ statuses: [], q: '', sort: DEFAULT_BANK_SORT })
		expect(parseBankUrl(null)).toEqual({ statuses: [], q: '', sort: DEFAULT_BANK_SORT })
	})

	it('отмеченные статусы, поиск и сортировка читаются и пишутся обратно', () => {
		const state = parseBankUrl(new URLSearchParams('status=draft,published&q=корень&sort=-updated'))
		expect(state).toEqual({
			statuses: ['published', 'draft'],
			q: 'корень',
			sort: { key: 'updated', direction: 'desc' },
		})
		expect(bankSearch(state)).toBe('?status=published,draft&q=%D0%BA%D0%BE%D1%80%D0%B5%D0%BD%D1%8C&sort=-updated')
	})

	it('неизвестные значения сбрасываются, значения по умолчанию в адрес не пишутся', () => {
		expect(parseBankUrl(new URLSearchParams('status=archived&sort=order'))).toEqual({
			statuses: [],
			q: '',
			sort: DEFAULT_BANK_SORT,
		})
		expect(bankSearch({ statuses: [], q: '  ', sort: DEFAULT_BANK_SORT })).toBe('')
	})
})

describe('список тестов банка', () => {
	it('счётчики статусов', () => {
		expect(statusCounts(TESTS)).toEqual({ published: 2, draft: 1 })
	})

	it('поиск по названию теста и темы без учёта регистра, вместе с отмеченными статусами', () => {
		expect(ids(filterBankTests(TESTS, [], 'АНАТОМ'))).toEqual(['c'])
		expect(ids(filterBankTests(TESTS, [], 'ботаника'))).toEqual(['a'])
		expect(ids(filterBankTests(TESTS, ['published'], ''))).toEqual(['b', 'c'])
		expect(ids(filterBankTests(TESTS, ['published', 'draft'], ''))).toEqual(['a', 'b', 'c'])
		expect(ids(filterBankTests(TESTS, ['draft'], 'гамет'))).toEqual([])
	})

	it('сортировка по столбцам; равные остаются в порядке банка', () => {
		expect(ids(sortBankTests(TESTS, DEFAULT_BANK_SORT))).toEqual(['a', 'b', 'c'])
		expect(ids(sortBankTests(TESTS, { key: 'title', direction: 'asc' }))).toEqual(['c', 'a', 'b'])
		expect(ids(sortBankTests(TESTS, { key: 'topic', direction: 'desc' }))).toEqual(['b', 'a', 'c'])
		expect(ids(sortBankTests(TESTS, { key: 'questions', direction: 'desc' }))).toEqual(['a', 'c', 'b'])
		expect(ids(sortBankTests(TESTS, { key: 'updated', direction: 'desc' }))).toEqual(['a', 'c', 'b'])
	})

	it('клики по столбцу: по возрастанию, по убыванию, сброс', () => {
		const first = nextBankSort(DEFAULT_BANK_SORT, 'updated')
		expect(first).toEqual({ key: 'updated', direction: 'asc' })
		expect(nextBankSort(nextBankSort(first, 'updated'), 'updated')).toEqual(DEFAULT_BANK_SORT)
	})
})

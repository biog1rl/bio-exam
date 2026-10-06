import { describe, expect, it } from 'vitest'

import {
	DEFAULT_ATTEMPTS_SORT,
	attemptsUrl,
	nextAttemptsSort,
	parseAttemptsUrl,
	type AttemptsUrlFilters,
} from './attempts-url'

const STUDENT = '00000000-0000-4000-8000-000000000042'
const OTHER = '00000000-0000-4000-8000-000000000043'

const EMPTY: AttemptsUrlFilters = {
	topics: [],
	students: [],
	results: [],
	status: 'active',
	review: 'all',
	q: '',
	from: null,
	to: null,
	sort: DEFAULT_ATTEMPTS_SORT,
}

describe('parseAttemptsUrl', () => {
	it('читает списки тем, учеников и результатов, статус, поиск, период и сортировку', () => {
		expect(
			parseAttemptsUrl(
				new URLSearchParams(
					`topic=cell,tissue&student=${STUDENT},${OTHER}&result=failed&status=all&review=pending&q=Иван&from=2026-09-29&to=2026-10-02&sort=score-asc`
				)
			)
		).toEqual({
			topics: ['cell', 'tissue'],
			students: [STUDENT, OTHER],
			results: ['failed'],
			status: 'all',
			review: 'pending',
			q: 'Иван',
			from: '2026-09-29',
			to: '2026-10-02',
			sort: { key: 'score', direction: 'asc' },
		})
	})

	it('старые ссылки с одной темой и одним учеником читаются как списки, массив берёт первое значение', () => {
		expect(parseAttemptsUrl(new URLSearchParams(`topic=cell&student=${STUDENT}`))).toMatchObject({
			topics: ['cell'],
			students: [STUDENT],
		})
		expect(parseAttemptsUrl({ topic: ['cell', 'x'], student: undefined })).toEqual({ ...EMPTY, topics: ['cell'] })
	})

	it('пустые, длинные, повторные и неизвестные значения отбрасываются', () => {
		expect(
			parseAttemptsUrl(
				new URLSearchParams(
					`topic=%20,cell,cell,${'a'.repeat(201)}&student=42,${STUDENT}&result=maybe&status=deleted&review=late&sort=topic-asc`
				)
			)
		).toEqual({ ...EMPTY, topics: ['cell'], students: [STUDENT] })
		expect(parseAttemptsUrl(new URLSearchParams('sort=score-up')).sort).toEqual(DEFAULT_ATTEMPTS_SORT)
	})

	it('период: неверные даты отбрасываются, конец без начала не читается, обратный порядок выправляется', () => {
		const period = (search: string) => {
			const { from, to } = parseAttemptsUrl(new URLSearchParams(search))
			return { from, to }
		}
		expect(period('from=2026-02-31&to=2026-03-01')).toEqual({ from: null, to: null })
		expect(period('to=2026-10-02')).toEqual({ from: null, to: null })
		expect(period('from=2026-10-02&to=2026-09-29')).toEqual({ from: '2026-09-29', to: '2026-10-02' })
		expect(period('from=2026-10-02&to=2026-10-02')).toEqual({ from: '2026-10-02', to: null })
		expect(period('from=2026-10-02&to=вчера')).toEqual({ from: '2026-10-02', to: null })
	})

	it.each([
		['review=pending', 'pending'],
		['review=graded', 'graded'],
		['review=all', 'all'],
		['review=none', 'all'],
		['review=', 'all'],
		['', 'all'],
	])('review из «%s» читается как %s', (search, expected) => {
		expect(parseAttemptsUrl(new URLSearchParams(search)).review).toBe(expected)
	})
})

describe('attemptsUrl', () => {
	it('собирает ссылку только из заданных фильтров, одиночные тема и ученик остаются в ходу', () => {
		expect(attemptsUrl({})).toBe('/admin/attempts')
		expect(attemptsUrl({ student: STUDENT })).toBe(`/admin/attempts?student=${STUDENT}`)
		expect(attemptsUrl({ topic: 'cell', status: 'active' })).toBe('/admin/attempts?topic=cell')
		expect(attemptsUrl({ student: STUDENT, status: 'all' })).toBe(`/admin/attempts?student=${STUDENT}&status=all`)
		expect(attemptsUrl({ ...EMPTY, q: '   ', sort: { key: 'date', direction: 'desc' } })).toBe('/admin/attempts')
	})

	it.each([
		[{ review: 'pending' as const }, '/admin/attempts?review=pending'],
		[{ review: 'graded' as const }, '/admin/attempts?review=graded'],
		[{ review: 'all' as const }, '/admin/attempts'],
		[{ topic: 'cell', review: 'pending' as const }, '/admin/attempts?topic=cell&review=pending'],
	])('review в ссылке: %j', (filters, expected) => {
		expect(attemptsUrl(filters)).toBe(expected)
	})

	it('разбор обратен сборке', () => {
		const filters: AttemptsUrlFilters = {
			topics: ['клетка', 'cell'],
			students: [STUDENT, OTHER],
			results: ['passed'],
			status: 'inactive',
			review: 'graded',
			q: 'a&b, 50%',
			from: '2026-09-29',
			to: '2026-10-02',
			sort: { key: 'student', direction: 'desc' },
		}
		const url = attemptsUrl(filters)
		expect(parseAttemptsUrl(new URL(url, 'http://x').searchParams)).toEqual(filters)
	})
})

describe('nextAttemptsSort', () => {
	it('дата по убыванию по умолчанию: щелчок по дате даёт возрастание, следующий возвращает умолчание', () => {
		const asc = nextAttemptsSort(DEFAULT_ATTEMPTS_SORT, 'date')
		expect(asc).toEqual({ key: 'date', direction: 'asc' })
		expect(nextAttemptsSort(asc, 'date')).toEqual(DEFAULT_ATTEMPTS_SORT)
	})

	it('другой столбец: возрастание, убывание, затем умолчание', () => {
		const asc = nextAttemptsSort(DEFAULT_ATTEMPTS_SORT, 'score')
		expect(asc).toEqual({ key: 'score', direction: 'asc' })
		const desc = nextAttemptsSort(asc, 'score')
		expect(desc).toEqual({ key: 'score', direction: 'desc' })
		expect(nextAttemptsSort(desc, 'score')).toEqual(DEFAULT_ATTEMPTS_SORT)
		expect(nextAttemptsSort(desc, 'date')).toEqual({ key: 'date', direction: 'asc' })
	})
})

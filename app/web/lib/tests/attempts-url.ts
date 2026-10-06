import { format, isValid, parse } from 'date-fns'

import type { UserStatus } from '@/lib/users/status-filter'
import { parseFilterList } from '@/lib/utils/column-filter'
import { cycleSort, type TableSort, parseListParam, searchString, type ParamsLike } from '@/lib/utils/table-sort'

export const ATTEMPTS_PATH = '/admin/attempts'

export type ReviewFilter = 'all' | 'pending' | 'graded'

export type AttemptResult = 'passed' | 'failed'

export type AttemptsSortKey = 'date' | 'score' | 'student' | 'test'

export type AttemptsSort = TableSort<AttemptsSortKey>

export type AttemptsUrlFilters = {
	topics: string[]
	students: string[]
	results: AttemptResult[]
	status: UserStatus
	review: ReviewFilter
	q: string
	from: string | null
	to: string | null
	sort: AttemptsSort
}

export type AttemptsLink = Partial<AttemptsUrlFilters> & { topic?: string | null; student?: string | null }

export const ATTEMPT_RESULTS: readonly AttemptResult[] = ['passed', 'failed']

export const DEFAULT_ATTEMPTS_SORT: AttemptsSort = { key: 'date', direction: 'desc' }

type RecordParams = Record<string, string | string[] | undefined>

const STATUSES: readonly UserStatus[] = ['active', 'inactive', 'all']
const REVIEW_FILTERS: readonly ReviewFilter[] = ['all', 'pending', 'graded']
const SORT_KEYS: readonly AttemptsSortKey[] = ['date', 'score', 'student', 'test']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DAY_FORMAT = 'yyyy-MM-dd'
const MAX_VALUE_LENGTH = 200

function reader(params: ParamsLike | RecordParams): (name: string) => string | null {
	if (typeof (params as ParamsLike).get === 'function') return (name) => (params as ParamsLike).get(name)
	return (name) => {
		const value = (params as RecordParams)[name]
		return (Array.isArray(value) ? value[0] : value) ?? null
	}
}

export function parseDay(value: string | null | undefined): Date | null {
	if (!value) return null
	const date = parse(value, DAY_FORMAT, new Date())
	return isValid(date) && format(date, DAY_FORMAT) === value ? date : null
}

export function dayParam(date: Date): string {
	return format(date, DAY_FORMAT)
}

function parsePeriod(fromValue: string | null, toValue: string | null): { from: string | null; to: string | null } {
	const from = parseDay(fromValue) ? fromValue : null
	const to = parseDay(toValue) ? toValue : null
	if (!from) return { from: null, to: null }
	if (!to || to === from) return { from, to: null }
	return to < from ? { from: to, to: from } : { from, to }
}

function isDirection(value: string | undefined): value is AttemptsSort['direction'] {
	return value === 'asc' || value === 'desc'
}

function parseSort(value: string | null): AttemptsSort {
	const [key, direction] = value?.split('-') ?? []
	if (!SORT_KEYS.includes(key as AttemptsSortKey) || !isDirection(direction)) return DEFAULT_ATTEMPTS_SORT
	return { key: key as AttemptsSortKey, direction }
}

export function isDefaultAttemptsSort(sort: AttemptsSort): boolean {
	return sort.key === DEFAULT_ATTEMPTS_SORT.key && sort.direction === DEFAULT_ATTEMPTS_SORT.direction
}

export function nextAttemptsSort(current: AttemptsSort, key: AttemptsSortKey): AttemptsSort {
	if (key === DEFAULT_ATTEMPTS_SORT.key && isDefaultAttemptsSort(current)) return { key, direction: 'asc' }
	return cycleSort(current, key, DEFAULT_ATTEMPTS_SORT)
}

export function parseAttemptsUrl(params: ParamsLike | RecordParams): AttemptsUrlFilters {
	const get = reader(params)
	const status = get('status')
	const review = get('review')
	return {
		topics: parseListParam(get('topic')),
		students: parseListParam(get('student'), (item) => UUID.test(item)),
		results: parseFilterList(get('result'), ATTEMPT_RESULTS),
		status: STATUSES.includes(status as UserStatus) ? (status as UserStatus) : 'active',
		review: REVIEW_FILTERS.includes(review as ReviewFilter) ? (review as ReviewFilter) : 'all',
		q: (get('q') ?? '').slice(0, MAX_VALUE_LENGTH),
		...parsePeriod(get('from'), get('to')),
		sort: parseSort(get('sort')),
	}
}

export function attemptsUrl(link: AttemptsLink): string {
	const topics = link.topics ?? (link.topic ? [link.topic] : [])
	const students = link.students ?? (link.student ? [link.student] : [])
	const from = link.from || null
	return `${ATTEMPTS_PATH}${searchString({
		topic: topics,
		student: students,
		result: link.results ?? [],
		status: link.status && link.status !== 'active' ? link.status : null,
		review: link.review && link.review !== 'all' ? link.review : null,
		q: link.q ?? null,
		from,
		to: from && link.to && link.to !== from ? link.to : null,
		sort: link.sort && !isDefaultAttemptsSort(link.sort) ? `${link.sort.key}-${link.sort.direction}` : null,
	})}`
}

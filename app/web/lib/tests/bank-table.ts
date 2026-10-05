import { parseFilterList } from '@/lib/utils/column-filter'
import { cycleSort, type TableSort } from '@/lib/utils/table-sort'

export type BankStatus = 'published' | 'draft'

export type BankSortKey = 'order' | 'title' | 'topic' | 'questions' | 'updated'

export type BankSort = TableSort<BankSortKey>

export type BankUrlState = { statuses: BankStatus[]; q: string; sort: BankSort }

export type BankTestRow = {
	title: string
	topicTitle?: string
	isPublished: boolean
	questionsCount?: number
	updatedAt: string
}

export const DEFAULT_BANK_SORT: BankSort = { key: 'order', direction: 'asc' }

export const BANK_STATUSES: readonly BankStatus[] = ['published', 'draft']
const SORT_KEYS: readonly BankSortKey[] = ['title', 'topic', 'questions', 'updated']

type ParamsLike = { get(name: string): string | null }

function parseSort(value: string | null): BankSort {
	if (!value) return DEFAULT_BANK_SORT
	const direction = value.startsWith('-') ? 'desc' : 'asc'
	const key = value.replace(/^-/, '') as BankSortKey
	return SORT_KEYS.includes(key) ? { key, direction } : DEFAULT_BANK_SORT
}

export function parseBankUrl(params: ParamsLike | null | undefined): BankUrlState {
	return {
		statuses: parseFilterList(params?.get('status'), BANK_STATUSES),
		q: params?.get('q') ?? '',
		sort: parseSort(params?.get('sort') ?? null),
	}
}

export function bankSearch(state: BankUrlState): string {
	const parts: string[] = []
	if (state.statuses.length > 0) parts.push(`status=${state.statuses.join(',')}`)
	if (state.q.trim()) parts.push(`q=${encodeURIComponent(state.q)}`)
	if (state.sort.key !== 'order') parts.push(`sort=${state.sort.direction === 'desc' ? '-' : ''}${state.sort.key}`)
	return parts.length > 0 ? `?${parts.join('&')}` : ''
}

export function nextBankSort(current: BankSort, key: BankSortKey): BankSort {
	return cycleSort(current, key, DEFAULT_BANK_SORT)
}

export function statusCounts(tests: readonly BankTestRow[]): Record<BankStatus, number> {
	const published = tests.filter((test) => test.isPublished).length
	return { published, draft: tests.length - published }
}

function statusOf(test: BankTestRow): BankStatus {
	return test.isPublished ? 'published' : 'draft'
}

export function filterBankTests<T extends BankTestRow>(
	tests: readonly T[],
	statuses: readonly BankStatus[],
	q: string
): T[] {
	const needle = q.trim().toLocaleLowerCase('ru')
	return tests.filter((test) => {
		if (statuses.length > 0 && !statuses.includes(statusOf(test))) return false
		if (!needle) return true
		return [test.title, test.topicTitle].some((value) => value?.toLocaleLowerCase('ru').includes(needle))
	})
}

function compareRows(a: BankTestRow, b: BankTestRow, key: BankSortKey): number {
	if (key === 'title') return a.title.localeCompare(b.title, 'ru')
	if (key === 'topic') return (a.topicTitle ?? '').localeCompare(b.topicTitle ?? '', 'ru')
	if (key === 'questions') return (a.questionsCount ?? 0) - (b.questionsCount ?? 0)
	if (key === 'updated') return Date.parse(a.updatedAt) - Date.parse(b.updatedAt)
	return 0
}

export function sortBankTests<T extends BankTestRow>(tests: readonly T[], sort: BankSort): T[] {
	const sign = sort.direction === 'asc' ? 1 : -1
	return tests
		.map((test, index) => ({ test, index }))
		.sort((a, b) => sign * compareRows(a.test, b.test, sort.key) || a.index - b.index)
		.map((entry) => entry.test)
}

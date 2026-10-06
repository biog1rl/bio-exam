import { parseFilterList } from '@/lib/utils/column-filter'
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

export function parseBankUrl(params: ParamsLike | null | undefined): BankUrlState {
	return {
		statuses: parseFilterList(params?.get('status'), BANK_STATUSES),
		q: params?.get('q') ?? '',
		sort: parseSortParam(params?.get('sort'), SORT_KEYS, DEFAULT_BANK_SORT),
	}
}

export function bankSearch(state: BankUrlState): string {
	return searchString({ status: state.statuses, q: state.q, sort: sortParam(state.sort, DEFAULT_BANK_SORT) })
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
	const needle = searchNeedle(q)
	return tests.filter((test) => {
		if (statuses.length > 0 && !statuses.includes(statusOf(test))) return false
		return matchesNeedle(needle, [test.title, test.topicTitle])
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
	return sortRows(tests, sort, compareRows)
}

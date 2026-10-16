import type { PublicTestListItem } from '@/lib/tests/types'
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

export type PublicSortKey = 'order' | 'title' | 'topic'

export type PublicSort = TableSort<PublicSortKey>

export type PublicTestsUrlState = { topic: string | null; q: string; sort: PublicSort }

export type PublicTopicLink = { slug: string | null; title: string; count: number; hidden: boolean; href: string }

export const DEFAULT_PUBLIC_SORT: PublicSort = { key: 'order', direction: 'asc' }

const SORT_KEYS: readonly PublicSortKey[] = ['title', 'topic']

type PluralForms = { one: string; few: string; many: string }

const RU_PLURAL = new Intl.PluralRules('ru')

export function countLabel(count: number, forms: PluralForms): string {
	const rule = RU_PLURAL.select(count)
	return `${count} ${rule === 'one' ? forms.one : rule === 'few' ? forms.few : forms.many}`
}

export function parsePublicTestsUrl(params: ParamsLike | null | undefined): PublicTestsUrlState {
	return {
		topic: params?.get('topic') || null,
		q: params?.get('q') ?? '',
		sort: parseSortParam(params?.get('sort'), SORT_KEYS, DEFAULT_PUBLIC_SORT),
	}
}

export function publicTestsSearch(state: PublicTestsUrlState): string {
	return searchString({ topic: state.topic, q: state.q, sort: sortParam(state.sort, DEFAULT_PUBLIC_SORT) })
}

export function nextPublicSort(current: PublicSort, key: PublicSortKey): PublicSort {
	return cycleSort(current, key, DEFAULT_PUBLIC_SORT)
}

export function filterPublicTests(tests: readonly PublicTestListItem[], topic: string | null, q: string) {
	const needle = searchNeedle(q)
	return tests.filter(
		(test) => (topic === null || test.topicSlug === topic) && matchesNeedle(needle, [test.title, test.topicTitle])
	)
}

export function sortPublicTests(tests: readonly PublicTestListItem[], sort: PublicSort): PublicTestListItem[] {
	return sortRows(tests, sort, (a, b, key) => {
		if (key === 'title') return a.title.localeCompare(b.title, 'ru')
		if (key === 'topic') return a.topicTitle.localeCompare(b.topicTitle, 'ru')
		return 0
	})
}

export function publicTopicLinks(
	tests: readonly PublicTestListItem[],
	hrefOf: (slug: string | null) => string
): PublicTopicLink[] {
	const topics = new Map<string, { title: string; count: number }>()
	for (const test of tests) {
		const topic = topics.get(test.topicSlug)
		if (topic) topic.count += 1
		else topics.set(test.topicSlug, { title: test.topicTitle, count: 1 })
	}
	return [
		{ slug: null, title: 'Все тесты', count: tests.length, hidden: false, href: hrefOf(null) },
		...[...topics].map(([slug, topic]) => ({ ...topic, slug, hidden: false, href: hrefOf(slug) })),
	]
}

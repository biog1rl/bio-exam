import { describe, expect, it } from 'vitest'

import {
	filterPublicTests,
	parsePublicTestsUrl,
	publicTestsSearch,
	publicTopicLinks,
	sortPublicTests,
} from './public-tests-table'
import type { PublicTestListItem } from './types'

function item(id: string, title: string, topicSlug: string, topicTitle: string): PublicTestListItem {
	return {
		id,
		slug: id,
		title,
		description: null,
		timeLimitMinutes: null,
		passingScore: null,
		topicId: topicSlug,
		topicSlug,
		topicTitle,
		questionsCount: 1,
	}
}

const tests = [
	item('b', 'Клетка', 'bio', 'Биология'),
	item('a', 'Атом', 'chem', 'Химия'),
	item('c', 'Органы', 'bio', 'Биология'),
]

describe('каталог тестов ученика', () => {
	it('фильтрует по теме и поиску', () => {
		expect(filterPublicTests(tests, 'bio', '').map((test) => test.id)).toEqual(['b', 'c'])
		expect(filterPublicTests(tests, null, 'хим').map((test) => test.id)).toEqual(['a'])
		expect(filterPublicTests(tests, 'chem', 'клет')).toEqual([])
	})

	it('сортирует по названию и сохраняет порядок сервера по умолчанию', () => {
		expect(sortPublicTests(tests, { key: 'title', direction: 'asc' }).map((test) => test.id)).toEqual(['a', 'b', 'c'])
		expect(sortPublicTests(tests, { key: 'order', direction: 'asc' }).map((test) => test.id)).toEqual(['b', 'a', 'c'])
	})

	it('строит темы со счётчиками, «Все тесты» первой', () => {
		const links = publicTopicLinks(tests, (slug) => `/tests?topic=${slug}`)
		expect(links.map((link) => [link.slug, link.count])).toEqual([
			[null, 3],
			['bio', 2],
			['chem', 1],
		])
	})

	it('читает и пишет адрес', () => {
		const state = parsePublicTestsUrl(new URLSearchParams('topic=bio&sort=-title&q=кл'))
		expect(state).toEqual({ topic: 'bio', q: 'кл', sort: { key: 'title', direction: 'desc' } })
		expect(parsePublicTestsUrl(new URLSearchParams('sort=bad')).sort).toEqual({ key: 'order', direction: 'asc' })
		expect(publicTestsSearch(state)).toBe('?topic=bio&q=%D0%BA%D0%BB&sort=-title')
	})
})

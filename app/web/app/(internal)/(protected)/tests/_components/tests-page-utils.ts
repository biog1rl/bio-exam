import type { PublicTestListItem } from '@/lib/tests/types'

export type PublicTestsTopicGroup = {
	topicId: string
	topicTitle: string
	tests: PublicTestListItem[]
}

type PluralForms = { one: string; few: string; many: string }

const RU_PLURAL = new Intl.PluralRules('ru')

export function countLabel(count: number, forms: PluralForms): string {
	const rule = RU_PLURAL.select(count)
	return `${count} ${rule === 'one' ? forms.one : rule === 'few' ? forms.few : forms.many}`
}

export function testsSearch(q: string): string {
	return q.trim() ? `?q=${encodeURIComponent(q)}` : ''
}

export function filterPublicTests(tests: readonly PublicTestListItem[], q: string): PublicTestListItem[] {
	const needle = q.trim().toLocaleLowerCase('ru')
	if (!needle) return [...tests]
	return tests.filter((test) =>
		[test.title, test.topicTitle].some((value) => value.toLocaleLowerCase('ru').includes(needle))
	)
}

export function groupPublicTestsByTopic(tests: readonly PublicTestListItem[]): PublicTestsTopicGroup[] {
	const grouped = new Map<string, PublicTestsTopicGroup>()
	for (const test of tests) {
		const group = grouped.get(test.topicId)
		if (group) group.tests.push(test)
		else grouped.set(test.topicId, { topicId: test.topicId, topicTitle: test.topicTitle, tests: [test] })
	}
	return [...grouped.values()]
}

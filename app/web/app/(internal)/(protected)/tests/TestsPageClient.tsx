'use client'

import { useMemo } from 'react'

import useSWR from 'swr'

import { StackedAccordion, StackedAccordionItem } from '@/components/ui/stacked-accordion'
import { fetchPublicTestsList } from '@/lib/tests/api'

import { PublicTestsTopicSection } from './_components/PublicTestsTopicSection'
import { TestsPageHero } from './_components/TestsPageHero'
import { TestsPageEmpty, TestsPageError, TestsPageLoading } from './_components/TestsPageState'
import { getPublicTestsStats, groupPublicTestsByTopic } from './_components/tests-page-utils'

const fetcher = async () => fetchPublicTestsList()

export default function TestsPageClient() {
	const { data, isLoading, error } = useSWR('public-tests-list', fetcher)
	const tests = useMemo(() => data?.tests ?? [], [data?.tests])
	const groups = useMemo(() => groupPublicTestsByTopic(tests), [tests])
	const stats = useMemo(() => getPublicTestsStats(groups), [groups])

	if (isLoading) {
		return <TestsPageLoading />
	}

	if (error) {
		return <TestsPageError />
	}

	return (
		<main className="space-y-5">
			<TestsPageHero stats={stats} />

			{groups.length === 0 ? (
				<TestsPageEmpty />
			) : (
				<StackedAccordion type="multiple">
					{groups.map((group) => (
						<StackedAccordionItem key={group.topicId} value={group.topicId}>
							<PublicTestsTopicSection group={group} />
						</StackedAccordionItem>
					))}
				</StackedAccordion>
			)}
		</main>
	)
}

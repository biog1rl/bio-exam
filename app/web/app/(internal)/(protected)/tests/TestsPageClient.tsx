'use client'

import { useMemo, useRef, useState } from 'react'

import { useSearchParams } from 'next/navigation'
import useSWR from 'swr'

import { LoadErrorAlert } from '@/components/feedback/LoadErrorAlert'
import { EmptyState } from '@/components/page/EmptyState'
import { PageHeader } from '@/components/page/PageHeader'
import { ToolbarSearch } from '@/components/page/ToolbarSearch'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { StackedAccordion, StackedAccordionItem } from '@/components/ui/stacked-accordion'
import { fetchPublicTestsList } from '@/lib/tests/api'

import { PublicTestsTopicSection } from './_components/PublicTestsTopicSection'
import { filterPublicTests, groupPublicTestsByTopic, testsSearch } from './_components/tests-page-utils'

export default function TestsPageClient() {
	const searchParams = useSearchParams()
	const q = searchParams.get('q') ?? ''
	const titleRef = useRef<HTMLHeadingElement>(null)
	const { data, isLoading, error, mutate } = useSWR('public-tests-list', fetchPublicTestsList)
	const tests = useMemo(() => data?.tests ?? [], [data?.tests])
	const groups = useMemo(() => groupPublicTestsByTopic(filterPublicTests(tests, q)), [tests, q])
	const [openTopics, setOpenTopics] = useState<string[] | null>(null)
	const openValue = openTopics ?? (q.trim() ? groups.map((group) => group.topicId) : [])

	const updateQuery = (next: string) => {
		setOpenTopics(null)
		window.history.replaceState(null, '', `${window.location.pathname}${testsSearch(next)}`)
	}

	return (
		<div className="space-y-4">
			<PageHeader title="Тесты" titleRef={titleRef}>
				<ToolbarSearch value={q} onChange={updateQuery} label="Поиск тестов" placeholder="Название теста или темы" />
			</PageHeader>

			{isLoading ? (
				<div className="space-y-2" aria-label="Загрузка тестов">
					<Skeleton className="h-16 rounded-lg" />
					<Skeleton className="h-16 rounded-lg" />
					<Skeleton className="h-16 rounded-lg" />
				</div>
			) : error !== undefined && data === undefined ? (
				<LoadErrorAlert
					title="Не удалось загрузить тесты"
					error={error}
					onRetry={() => mutate()}
					focusTarget={titleRef}
				/>
			) : tests.length === 0 ? (
				<EmptyState
					title="Опубликованных тестов пока нет"
					description="Когда преподаватель опубликует первый материал, он появится в этом каталоге."
				/>
			) : groups.length === 0 ? (
				<EmptyState
					title="Ничего не найдено"
					action={
						<Button variant="outline" className="rounded-full" onClick={() => updateQuery('')}>
							Сбросить поиск
						</Button>
					}
				/>
			) : (
				<StackedAccordion type="multiple" value={openValue} onValueChange={setOpenTopics}>
					{groups.map((group) => (
						<StackedAccordionItem key={group.topicId} value={group.topicId}>
							<PublicTestsTopicSection group={group} />
						</StackedAccordionItem>
					))}
				</StackedAccordion>
			)}
		</div>
	)
}

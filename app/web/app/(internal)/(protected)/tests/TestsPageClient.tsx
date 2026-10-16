'use client'

import { useMemo, useRef } from 'react'

import { useSearchParams } from 'next/navigation'
import useSWR from 'swr'

import { LoadErrorAlert } from '@/components/feedback/LoadErrorAlert'
import { EmptyState } from '@/components/page/EmptyState'
import { PageHeader } from '@/components/page/PageHeader'
import { ToolbarSearch } from '@/components/page/ToolbarSearch'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { fetchPublicTestsList } from '@/lib/tests/api'
import {
	filterPublicTests,
	parsePublicTestsUrl,
	publicTestsSearch,
	publicTopicLinks,
	sortPublicTests,
	type PublicTestsUrlState,
} from '@/lib/tests/public-tests-table'

import { BankTopicSelect, BankTopicsNav } from '../admin/tests/components/bank/BankTopicsNav'
import { PublicTestsTable } from './_components/PublicTestsTable'

export default function TestsPageClient() {
	const searchParams = useSearchParams()
	const url = useMemo(() => parsePublicTestsUrl(searchParams), [searchParams])
	const titleRef = useRef<HTMLHeadingElement>(null)
	const { data, isLoading, error, mutate } = useSWR('public-tests-list', fetchPublicTestsList)
	const tests = useMemo(() => data?.tests ?? [], [data?.tests])
	const links = useMemo(
		() => publicTopicLinks(tests, (slug) => `/tests${publicTestsSearch({ ...url, topic: slug, q: '' })}`),
		[tests, url]
	)
	const topic = links.find((link) => link.slug !== null && link.slug === url.topic) ?? null
	const visible = useMemo(
		() => sortPublicTests(filterPublicTests(tests, topic?.slug ?? null, url.q), url.sort),
		[tests, topic, url.q, url.sort]
	)

	const updateUrl = (patch: Partial<PublicTestsUrlState>) => {
		window.history.replaceState(null, '', `${window.location.pathname}${publicTestsSearch({ ...url, ...patch })}`)
	}

	return (
		<div className="space-y-4">
			<PageHeader title="Тесты" titleRef={titleRef}>
				<ToolbarSearch
					value={url.q}
					onChange={(q) => updateUrl({ q })}
					label="Поиск тестов"
					placeholder="Название теста или темы"
				/>
			</PageHeader>

			{isLoading ? (
				<Skeleton className="h-96 rounded-3xl" aria-label="Загрузка тестов" />
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
			) : (
				<div className="grid gap-5 tab:grid-cols-[16rem_minmax(0,1fr)] xl:grid-cols-[18rem_minmax(0,1fr)]">
					<div className="hidden tab:block">
						<BankTopicsNav
							label="Темы"
							links={links}
							currentSlug={topic?.slug ?? null}
							canCreateTopic={false}
							onCreateTopic={() => {}}
						/>
					</div>

					<div className="min-w-0 space-y-4">
						<div className="tab:hidden">
							<BankTopicSelect links={links} currentSlug={topic?.slug ?? null} />
						</div>

						{visible.length === 0 ? (
							<EmptyState
								title="Ничего не найдено"
								action={
									<Button variant="outline" className="rounded-full" onClick={() => updateUrl({ q: '', topic: null })}>
										Сбросить поиск
									</Button>
								}
							/>
						) : (
							<PublicTestsTable
								tests={visible}
								showTopic={topic === null}
								sort={url.sort}
								onSortChange={(sort) => updateUrl({ sort })}
							/>
						)}
					</div>
				</div>
			)}
		</div>
	)
}

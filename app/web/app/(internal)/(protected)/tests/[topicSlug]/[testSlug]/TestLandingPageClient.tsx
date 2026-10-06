'use client'

import { useState } from 'react'

import Link from 'next/link'
import { toast } from 'sonner'
import useSWR from 'swr'

import { SetBreadcrumbsLabels } from '@/components/Breadcrumbs/SetBreadcrumbsLabels'
import { EmptyState } from '@/components/page/EmptyState'
import { PageHeader } from '@/components/page/PageHeader'
import { StatusBadge } from '@/components/table/StatusBadge'
import { TableCard } from '@/components/table/TableCard'
import { TestMissingState } from '@/components/tests/TestMissingState'
import { AttemptScore } from '@/components/tests/attempt-result/AttemptScore'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { failureOf } from '@/lib/http/errors'
import { fetchMyTestAttempts, fetchPublicTestSummary } from '@/lib/tests/api'
import { attemptResultView } from '@/lib/tests/attempt-result-view'
import type { TestAttemptSummary } from '@/lib/tests/types'
import { formatDateTime } from '@/lib/utils/dates'

import { TestResultsChart } from './TestResultsChart'

interface Props {
	topicSlug: string
	testSlug: string
}

export function TestLandingPageClient({ topicSlug, testSlug }: Props) {
	// --- Test resolution ---
	const { data: testData, isLoading: testLoading } = useSWR(`test-summary/${topicSlug}/${testSlug}`, () =>
		fetchPublicTestSummary(topicSlug, testSlug)
	)
	const test = testData?.test ?? null
	const testId = test?.id ?? null

	// --- Attempts widget ---
	const [offset, setOffset] = useState(0)
	const [allRows, setAllRows] = useState<TestAttemptSummary[]>([])
	const [total, setTotal] = useState(0)
	const [loadingMore, setLoadingMore] = useState(false)

	const { isLoading: attemptsLoading } = useSWR(
		testId ? `attempts-${testId}-first` : null,
		() => fetchMyTestAttempts(testId!, { offset: 0, limit: 5 }),
		{
			onSuccess(data) {
				setAllRows(data.rows)
				setTotal(data.total)
				setOffset(5)
			},
			revalidateOnFocus: false,
		}
	)

	const handleLoadMore = async () => {
		if (!testId || loadingMore) return
		setLoadingMore(true)
		try {
			const data = await fetchMyTestAttempts(testId, { offset, limit: 5 })
			setAllRows((prev) => [...prev, ...data.rows])
			setOffset((prev) => prev + data.rows.length)
		} catch (error) {
			const text = failureOf(error).message
			if (text) toast.error(text)
		} finally {
			setLoadingMore(false)
		}
	}

	// --- Render ---
	if (testLoading) {
		return (
			<div className="space-y-4">
				<Skeleton className="h-10 w-64 rounded-full" />
				<Skeleton className="h-48 rounded-3xl" />
				<Skeleton className="h-65 w-full" />
			</div>
		)
	}

	if (!test) {
		return <TestMissingState />
	}

	const labels = {
		[`/tests/${topicSlug}`]: test.topicTitle,
		[`/tests/${topicSlug}/${testSlug}`]: test.title,
	}

	return (
		<div className="space-y-6">
			<SetBreadcrumbsLabels labels={labels} />

			<PageHeader title={test.title} meta={test.description || undefined}>
				<Button asChild className="h-10 rounded-full px-5">
					<Link href={`/tests/${topicSlug}/${testSlug}/start`}>Начать тест</Link>
				</Button>
			</PageHeader>

			<TestResultsChart
				test={{ id: test.id, title: test.title, slug: testSlug, topicSlug, topicTitle: test.topicTitle }}
			/>

			<section className="space-y-3">
				<h2 className="text-lg font-semibold">История попыток</h2>
				{attemptsLoading ? (
					<Skeleton className="h-48 rounded-3xl" aria-label="Загрузка истории попыток" />
				) : total === 0 ? (
					<EmptyState title="Ещё нет попыток" className="py-10" />
				) : (
					<TableCard>
						<Table className="table-fixed">
							<TableHeader>
								<TableRow className="hover:bg-transparent">
									<TableHead className="pl-4">Дата</TableHead>
									<TableHead className="hidden w-28 text-right tab-sm:table-cell">Баллы</TableHead>
									<TableHead className="w-40 text-right">Результат</TableHead>
									<TableHead className="hidden w-36 pr-4 tab-sm:table-cell">Статус</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{allRows.map((row) => {
									const view = attemptResultView(row)
									const final = view.kind === 'final' ? view : null
									return (
										<TableRow key={row.id}>
											<TableCell className="py-3 pl-4">
												<span className="font-medium tabular-nums">{formatDateTime(row.submittedAt)}</span>
												{final ? (
													<p className="mt-0.5 text-xs text-muted-foreground tab-sm:hidden">
														{final.points.earned} / {final.points.total} · {final.passed ? 'Пройден' : 'Не пройден'}
													</p>
												) : null}
											</TableCell>
											<TableCell className="hidden text-right whitespace-nowrap tabular-nums tab-sm:table-cell">
												{final ? `${final.points.earned} / ${final.points.total}` : '—'}
											</TableCell>
											<TableCell className="py-3 text-right">
												<AttemptScore view={view} audience="student" showPoints={false} />
											</TableCell>
											<TableCell className="hidden pr-4 tab-sm:table-cell">
												{final ? (
													<StatusBadge on={final.passed}>{final.passed ? 'Пройден' : 'Не пройден'}</StatusBadge>
												) : (
													<span className="text-muted-foreground">—</span>
												)}
											</TableCell>
										</TableRow>
									)
								})}
							</TableBody>
						</Table>
					</TableCard>
				)}
				{allRows.length < total && (
					<Button variant="outline" size="sm" className="rounded-full" onClick={handleLoadMore} disabled={loadingMore}>
						{loadingMore ? 'Загрузка...' : 'Загрузить ещё'}
					</Button>
				)}
			</section>
		</div>
	)
}

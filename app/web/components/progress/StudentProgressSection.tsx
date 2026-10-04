'use client'

import { useMemo, useState, type ReactNode } from 'react'

import useSWR from 'swr'

import { AttemptBarChart } from '@/components/progress/AttemptBarChart'
import { Skeleton } from '@/components/ui/skeleton'
import {
	assignTopicColors,
	DEFAULT_PERIOD,
	filterAttemptsByPeriod,
	resolvePeriodBounds,
} from '@/lib/progress/attempt-chart'
import { loadMyProgressAttempts } from '@/lib/progress/my-attempts'
import { fetchMyTestAttempts, fetchPublicTestsList } from '@/lib/tests/api'

function EmptyState({ children }: { children: ReactNode }) {
	return <div className="rounded-3xl bg-secondary/70 p-unit text-sm text-muted-foreground">{children}</div>
}

export function StudentProgressSection() {
	const [now] = useState(() => new Date())
	const testsQuery = useSWR('dashboard-public-tests', fetchPublicTestsList)
	const tests = useMemo(() => testsQuery.data?.tests ?? [], [testsQuery.data?.tests])

	const attemptsQuery = useSWR(
		testsQuery.data ? ['progress-my-attempts', tests.map((test) => test.id).join(',')] : null,
		() => loadMyProgressAttempts(tests, fetchMyTestAttempts)
	)
	const attempts = useMemo(() => attemptsQuery.data ?? [], [attemptsQuery.data])
	const colors = useMemo(() => assignTopicColors(attempts), [attempts])
	const monthAttempts = useMemo(
		() => filterAttemptsByPeriod(attempts, resolvePeriodBounds({ period: DEFAULT_PERIOD }, now)),
		[attempts, now]
	)

	const loading = testsQuery.isLoading || attemptsQuery.isLoading || (!testsQuery.error && !testsQuery.data)
	const failed = Boolean(testsQuery.error || attemptsQuery.error)

	return (
		<section className="rounded-4xl border border-border/80 bg-card/90 p-unit-mob shadow-sm tab-sm:p-unit">
			<p className="font-mono text-[0.6875rem] tracking-[0.22em] text-muted-foreground uppercase">динамика</p>
			<h2 className="mt-2 font-serif text-2xl text-foreground tab-sm:text-3xl">Пройденные тесты</h2>
			<p className="mt-3 text-sm text-muted-foreground">За последний месяц</p>
			<div className="mt-6">
				{failed ? (
					<p role="alert" className="text-sm text-destructive">
						Не удалось загрузить попытки
					</p>
				) : loading ? (
					<Skeleton className="h-72 rounded-3xl" />
				) : attempts.length === 0 ? (
					<EmptyState>График появится после первой попытки.</EmptyState>
				) : monthAttempts.length === 0 ? (
					<EmptyState>За последний месяц попыток нет.</EmptyState>
				) : (
					<AttemptBarChart attempts={monthAttempts} colors={colors} mode="range" />
				)}
			</div>
		</section>
	)
}

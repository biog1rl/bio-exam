'use client'

import { useMemo, useState } from 'react'

import useSWR from 'swr'

import { AttemptChart } from '@/components/charts/AttemptChart'
import { EmptyState } from '@/components/page/EmptyState'
import { Panel } from '@/components/page/Panel'
import { Skeleton } from '@/components/ui/skeleton'
import { useChartConfigs } from '@/lib/charts/api'
import { ATTEMPT_PERIOD_OPTIONS } from '@/lib/charts/config'
import { filterAttemptsByPeriod, resolvePeriodBounds } from '@/lib/progress/attempt-chart'
import { loadMyProgressAttempts } from '@/lib/progress/my-attempts'
import { fetchMyTestAttempts, fetchPublicTestsList } from '@/lib/tests/api'

export function StudentProgressSection() {
	const [now] = useState(() => new Date())
	const config = useChartConfigs().studentProgress
	const testsQuery = useSWR('dashboard-public-tests', fetchPublicTestsList)
	const tests = useMemo(() => testsQuery.data?.tests ?? [], [testsQuery.data?.tests])

	const attemptsQuery = useSWR(
		testsQuery.data ? ['progress-my-attempts', tests.map((test) => test.id).join(',')] : null,
		() => loadMyProgressAttempts(tests, fetchMyTestAttempts)
	)
	const attempts = useMemo(() => attemptsQuery.data ?? [], [attemptsQuery.data])
	const periodAttempts = useMemo(
		() => filterAttemptsByPeriod(attempts, resolvePeriodBounds({ period: config.period }, now)),
		[attempts, config.period, now]
	)
	const periodLabel = ATTEMPT_PERIOD_OPTIONS.find((option) => option.value === config.period)?.label ?? ''

	const loading = testsQuery.isLoading || attemptsQuery.isLoading || (!testsQuery.error && !testsQuery.data)
	const failed = Boolean(testsQuery.error || attemptsQuery.error)

	return (
		<Panel title="Пройденные тесты" meta={config.period === 'all' ? 'За всё время' : periodLabel}>
			{failed ? (
				<p role="alert" className="text-sm text-destructive">
					Не удалось загрузить попытки
				</p>
			) : loading ? (
				<Skeleton className="h-72 rounded-2xl" />
			) : attempts.length === 0 ? (
				<EmptyState size="sm" description="График появится после первой попытки." />
			) : periodAttempts.length === 0 ? (
				<EmptyState size="sm" description="За этот период попыток нет." />
			) : (
				<AttemptChart attempts={periodAttempts} config={config} />
			)}
		</Panel>
	)
}

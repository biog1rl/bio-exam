'use client'

import { useMemo, useState } from 'react'

import useSWR from 'swr'

import { AttemptChart } from '@/components/charts/AttemptChart'
import { ChartPeriodPicker } from '@/components/charts/ChartPeriodPicker'
import { Panel } from '@/components/page/Panel'
import { Skeleton } from '@/components/ui/skeleton'
import { useChartSettingsState } from '@/lib/charts/api'
import { useChartPeriod } from '@/lib/charts/use-chart-period'
import { resolvePeriodBounds, type ProgressAttempt } from '@/lib/progress/attempt-chart'
import { fetchChartData } from '@/lib/tests/api'

type TestMeta = { id: string; title: string; slug: string; topicSlug: string; topicTitle: string }

export function TestResultsChart({ test }: { test: TestMeta }) {
	const { configs, loaded } = useChartSettingsState()
	const config = configs.testResults
	const [now] = useState(() => new Date())
	const chartPeriod = useChartPeriod(config.period)
	const { period } = chartPeriod
	const bounds = useMemo(
		() => resolvePeriodBounds({ period, from: chartPeriod.from, to: chartPeriod.to }, now),
		[period, chartPeriod.from, chartPeriod.to, now]
	)
	const from = bounds.start?.toISOString()
	const to = bounds.end?.toISOString()

	const { data, isLoading, error } = useSWR(
		loaded || chartPeriod.explicit ? `test-chart:${test.id}:${from ?? ''}:${to ?? ''}` : null,
		() => fetchChartData(test.id, { from, to }),
		{ revalidateOnFocus: false, keepPreviousData: true }
	)
	const attempts = useMemo<ProgressAttempt[]>(
		() =>
			(data?.attempts ?? []).map((attempt) => ({
				attemptId: attempt.id,
				testId: test.id,
				testTitle: test.title,
				testSlug: test.slug,
				topicSlug: test.topicSlug,
				topicTitle: test.topicTitle,
				submittedAt: attempt.submittedAt,
				earnedPoints: attempt.earnedPoints,
				totalPoints: attempt.totalPoints,
				scorePercentage: attempt.scorePercentage,
				passed: attempt.passed,
			})),
		[data, test]
	)

	return (
		<Panel
			title="Мои результаты"
			actions={
				<ChartPeriodPicker
					period={period}
					from={chartPeriod.fromDate}
					to={chartPeriod.toDate}
					onPreset={chartPeriod.choosePreset}
					onRange={chartPeriod.chooseRange}
				/>
			}
		>
			<div className="transition-opacity duration-300" style={{ opacity: isLoading && data ? 0.4 : 1 }}>
				{error && !data ? (
					<p role="alert" className="text-sm text-destructive">
						Не удалось загрузить попытки
					</p>
				) : !data ? (
					<Skeleton className="h-72 rounded-2xl" />
				) : attempts.length === 0 ? (
					<div className="flex h-40 items-center justify-center rounded-2xl border border-dashed border-border text-sm text-muted-foreground">
						Нет попыток за выбранный период
					</div>
				) : (
					<AttemptChart attempts={attempts} config={config} />
				)}
			</div>
		</Panel>
	)
}

'use client'

import { useMemo } from 'react'

import useSWR from 'swr'

import { AttemptChart } from '@/components/charts/AttemptChart'
import { ActivityChart, ContentChart } from '@/components/charts/DashboardCharts'
import { Skeleton } from '@/components/ui/skeleton'
import { isAttemptChart, type ChartConfigs, type ChartId } from '@/lib/charts/config'
import { demoActivity, demoAttempts, demoContent } from '@/lib/charts/demo'
import { filterAttemptsByPeriod, resolvePeriodBounds, type ProgressAttempt } from '@/lib/progress/attempt-chart'
import { adminTestsKeys, adminTestsListFetcher, topicsListFetcher } from '@/lib/tests/admin-api'
import { adminDashboardFetcher, adminDashboardKey } from '@/lib/tests/dashboard-api'
import { userAttemptToProgress, userAttemptsFetcher, usersKeys } from '@/lib/users/api'

export type PreviewSource = 'demo' | 'real'

function Message({ children }: { children: string }) {
	return (
		<div className="flex h-72 items-center justify-center rounded-2xl border border-dashed border-border px-6 text-center text-sm text-muted-foreground">
			{children}
		</div>
	)
}

function busiestTest(attempts: readonly ProgressAttempt[]): ProgressAttempt[] {
	const counts = new Map<string, number>()
	for (const attempt of attempts) counts.set(attempt.testId, (counts.get(attempt.testId) ?? 0) + 1)
	const [testId] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? []
	return testId ? attempts.filter((attempt) => attempt.testId === testId) : []
}

interface ChartPreviewProps {
	chartId: ChartId
	configs: ChartConfigs
	source: PreviewSource
	studentId: string | null
	now: Date
}

export function ChartPreview({ chartId, configs, source, studentId, now }: ChartPreviewProps) {
	const real = source === 'real'
	const attemptChart = isAttemptChart(chartId)
	const studentAttempts = useSWR(
		real && attemptChart && studentId ? usersKeys.attempts(studentId) : null,
		userAttemptsFetcher
	)
	const topics = useSWR(real && chartId === 'content' ? adminTestsKeys.topics() : null, topicsListFetcher)
	const tests = useSWR(real && chartId === 'content' ? adminTestsKeys.list() : null, adminTestsListFetcher)
	const activity = useSWR(real && chartId === 'activity' ? adminDashboardKey() : null, adminDashboardFetcher)
	const demo = useMemo(
		() => ({ attempts: demoAttempts(now), content: demoContent(), activity: demoActivity(now) }),
		[now]
	)

	const studentProgress = useMemo(
		() =>
			(studentAttempts.data?.attempts ?? []).flatMap((row) => {
				const progress = userAttemptToProgress(row)
				return progress ? [progress] : []
			}),
		[studentAttempts.data]
	)
	const attemptConfig = attemptChart ? configs[chartId] : null
	const attempts = useMemo(() => {
		if (!attemptConfig) return []
		const source = real ? studentProgress : demo.attempts
		const scoped = chartId === 'testResults' ? busiestTest(source) : source
		return filterAttemptsByPeriod(scoped, resolvePeriodBounds({ period: attemptConfig.period }, now))
	}, [attemptConfig, chartId, demo.attempts, now, real, studentProgress])

	if (attemptConfig) {
		if (real && !studentId) return <Message>Выберите ученика, чтобы увидеть его попытки.</Message>
		if (real && studentAttempts.error) return <Message>Не удалось загрузить попытки ученика.</Message>
		if (real && !studentAttempts.data) return <Skeleton className="h-72 rounded-2xl" />
		if (attempts.length === 0) return <Message>За выбранный период попыток нет.</Message>
		return (
			<div className="space-y-2">
				{chartId === 'testResults' ? (
					<p className="text-sm text-muted-foreground">Тест: {attempts[0]?.testTitle}</p>
				) : null}
				<AttemptChart attempts={attempts} config={attemptConfig} ariaLabel="Превью графика" />
			</div>
		)
	}

	if (chartId === 'content') {
		if (real && (topics.error || tests.error)) return <Message>Не удалось загрузить темы и тесты.</Message>
		if (real && (!topics.data || !tests.data)) return <Skeleton className="h-72 rounded-2xl" />
		const data = real ? { topics: topics.data?.topics ?? [], tests: tests.data?.tests ?? [] } : demo.content
		if (data.topics.length === 0) return <Message>Тем пока нет.</Message>
		return <ContentChart topics={data.topics} tests={data.tests} config={configs.content} />
	}

	if (real && activity.error) return <Message>Не удалось загрузить активность учеников.</Message>
	if (real && !activity.data) return <Skeleton className="h-72 rounded-2xl" />
	return (
		<ActivityChart
			days={real ? (activity.data?.dailyActivity ?? []) : demo.activity}
			config={configs.activity}
			now={now}
		/>
	)
}

'use client'

import { useMemo } from 'react'

import type { ActivityChartConfig, ContentChartConfig } from '@/lib/charts/config'
import {
	activitySeries,
	buildActivityRows,
	buildContentRows,
	contentSeries,
	type ActivityDay,
	type ContentTest,
	type ContentTopic,
} from '@/lib/charts/dashboard-series'

import { SeriesChart } from './SeriesChart'

interface ContentChartProps {
	topics: readonly ContentTopic[]
	tests: readonly ContentTest[]
	config: ContentChartConfig
	className?: string
}

export function ContentChart({ topics, tests, config, className }: ContentChartProps) {
	const rows = useMemo(() => buildContentRows(topics, tests, config), [topics, tests, config])
	const series = useMemo(
		() =>
			contentSeries(config).map((item) => ({
				...item,
				stackId: config.stacked && item.key !== 'questions' ? 'tests' : undefined,
			})),
		[config]
	)
	return (
		<SeriesChart
			type={config.type}
			rows={rows}
			series={series}
			legend={config.legend ? series : null}
			labels={config.labels}
			left={{ percent: false }}
			categorical
			ariaLabel="График наполнения тем"
			description={`Темы: ${rows.length}. ${series.map((item) => item.label).join(', ')}`}
			className={className}
		/>
	)
}

interface ActivityChartProps {
	days: readonly ActivityDay[]
	config: ActivityChartConfig
	now: Date
	className?: string
}

export function ActivityChart({ days, config, now, className }: ActivityChartProps) {
	const rows = useMemo(() => buildActivityRows(days, config.period, now), [days, config.period, now])
	const series = useMemo(() => activitySeries(config), [config])
	const both = config.metric === 'both'
	return (
		<SeriesChart
			type={config.type}
			rows={rows}
			series={series}
			legend={config.legend ? series : null}
			labels={config.labels}
			left={{ percent: config.metric === 'averageScore' }}
			right={both ? { percent: true } : undefined}
			categorical={false}
			ariaLabel="График активности учеников"
			description={`Дней: ${rows.length}. ${series.map((item) => item.label).join(', ')}`}
			className={className}
		/>
	)
}

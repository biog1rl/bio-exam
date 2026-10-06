'use client'

import { useMemo } from 'react'

import { buildAttemptChart, type AttemptChartMode } from '@/lib/charts/attempt-series'
import { isTimeAxis, type AttemptChartConfig } from '@/lib/charts/config'
import type { ProgressAttempt } from '@/lib/progress/attempt-chart'

import { SeriesChart } from './SeriesChart'

interface AttemptChartProps {
	attempts: readonly ProgressAttempt[]
	config: AttemptChartConfig
	mode?: AttemptChartMode
	ariaLabel?: string
	topicColors?: ReadonlyMap<string, string>
	className?: string
}

function xAxisLabel(config: AttemptChartConfig, mode: AttemptChartMode): string {
	if (config.x === 'attempt') return mode === 'day' ? 'Время' : 'Дата'
	if (config.x === 'topic') return 'Тема'
	if (config.x === 'test') return 'Тест'
	return isTimeAxis(config.x) ? 'Дата' : ''
}

export function AttemptChart({
	attempts,
	config,
	mode = 'range',
	ariaLabel = 'График результатов попыток',
	topicColors,
	className,
}: AttemptChartProps) {
	const data = useMemo(
		() => buildAttemptChart(attempts, config, mode, topicColors),
		[attempts, config, mode, topicColors]
	)
	const effective = data.config
	return (
		<SeriesChart
			type={effective.type}
			rows={data.rows}
			series={data.series}
			legend={effective.legend && data.legend.length > 0 ? data.legend : null}
			labels={effective.labels}
			left={{ percent: data.percent, label: data.valueLabel }}
			categorical={data.categorical}
			ariaLabel={ariaLabel}
			description={`${data.valueLabel}. Точек на графике: ${data.rows.filter((row) => !row.gap).length}`}
			xLabel={xAxisLabel(effective, mode)}
			className={className}
		/>
	)
}

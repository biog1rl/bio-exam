'use client'

import { useId, useMemo } from 'react'

import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { Bar, BarChart, CartesianGrid, Cell, LabelList, XAxis, YAxis, type LabelProps } from 'recharts'

import {
	ChartContainer,
	ChartLegend,
	ChartLegendContent,
	ChartTooltip,
	ChartTooltipContent,
} from '@/components/ui/chart'
import {
	barMinPointSize,
	buildAttemptBars,
	buildTopicChartConfig,
	chartMinWidth,
	fitBarLabel,
	legendTopics,
	type AttemptBarRow,
	type ChartMode,
	type ProgressAttempt,
	type TopicColor,
} from '@/lib/progress/attempt-chart'
import { formatPercent } from '@/lib/tests/format'

type Props = {
	attempts: ProgressAttempt[]
	colors: TopicColor[]
	mode: ChartMode
}

const PERCENT_TICKS = [0, 25, 50, 75, 100]
const CHART_MARGIN = { top: 24, right: 12, bottom: 8, left: 12 }
const LABEL_GAP_PX = 4

function toNumber(value: number | string | undefined): number {
	const parsed = typeof value === 'number' ? value : Number(value)
	return Number.isFinite(parsed) ? parsed : 0
}

function BarLabelContent({ rows, ...props }: LabelProps & { rows: AttemptBarRow[] }) {
	const row = typeof props.index === 'number' ? rows[props.index] : undefined
	if (!row || row.kind === 'gap') return null
	const value = typeof props.value === 'string' ? props.value : ''
	if (!value) return null

	const x = toNumber(props.x)
	const y = toNumber(props.y)
	const width = toNumber(props.width)
	const height = toNumber(props.height)
	const label = fitBarLabel(value, { barWidth: width, barHeight: height, spaceAbove: y - CHART_MARGIN.top })
	if (!label) return null

	const centerX = x + width / 2
	const common = {
		className: 'attempt-bar-label',
		fontSize: 11,
		fill: 'var(--foreground)',
		stroke: 'var(--card)',
		strokeWidth: 3,
		paintOrder: 'stroke',
		pointerEvents: 'none',
	} as const

	if (label.vertical) {
		const anchorY = label.placement === 'inside' ? y + height - LABEL_GAP_PX : y - LABEL_GAP_PX
		return (
			<text
				{...common}
				x={centerX}
				y={anchorY}
				textAnchor="start"
				dominantBaseline="central"
				transform={`rotate(-90, ${centerX}, ${anchorY})`}
			>
				{label.text}
			</text>
		)
	}

	return label.placement === 'inside' ? (
		<text {...common} x={centerX} y={y + LABEL_GAP_PX} textAnchor="middle" dominantBaseline="hanging">
			{label.text}
		</text>
	) : (
		<text {...common} x={centerX} y={y - LABEL_GAP_PX} textAnchor="middle">
			{label.text}
		</text>
	)
}

type AttemptRow = Extract<AttemptBarRow, { kind: 'attempt' }>

function rowOf(payload: unknown): AttemptRow | null {
	if (typeof payload !== 'object' || payload === null) return null
	return (payload as AttemptBarRow).kind === 'attempt' ? (payload as AttemptRow) : null
}

export function AttemptBarChart({ attempts, colors, mode }: Props) {
	const descriptionId = useId()
	const rows = useMemo(() => buildAttemptBars(attempts, colors, mode), [attempts, colors, mode])
	const chartConfig = useMemo(() => buildTopicChartConfig(colors), [colors])
	const ticks = useMemo(() => new Map(rows.map((row) => [row.key, row.tick])), [rows])
	const legendPayload = useMemo(
		() =>
			legendTopics(rows, colors).map((topic) => ({
				value: topic.key,
				dataKey: topic.key,
				color: `var(--color-${topic.key})`,
				type: 'square' as const,
			})),
		[rows, colors]
	)
	const attemptCount = rows.filter((row) => row.kind === 'attempt').length

	return (
		<div className="overflow-x-auto">
			<p id={descriptionId} className="sr-only">
				{`Столбик — попытка, высота — процент правильных ответов, цвет — раздел. Попыток: ${attemptCount}`}
			</p>
			<div style={{ minWidth: chartMinWidth(rows.length) }}>
				<ChartContainer
					config={chartConfig}
					className="h-72 w-full"
					role="figure"
					aria-label="График результатов попыток"
					aria-describedby={descriptionId}
				>
					<BarChart accessibilityLayer data={rows} margin={CHART_MARGIN}>
						<CartesianGrid vertical={false} />
						<XAxis
							dataKey="key"
							tickLine={false}
							axisLine={false}
							tickMargin={10}
							interval={0}
							height={48}
							tickFormatter={(value: string) => ticks.get(value) ?? ''}
							label={{ value: mode === 'day' ? 'Время' : 'Дата', position: 'insideBottom', offset: 0 }}
						/>
						<YAxis
							domain={[0, 100]}
							ticks={PERCENT_TICKS}
							tickLine={false}
							axisLine={false}
							width={56}
							tickFormatter={(value: number) => `${value}%`}
							label={{ value: 'Правильно, %', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' } }}
						/>
						<ChartTooltip
							cursor={false}
							content={
								<ChartTooltipContent
									className="max-w-72"
									labelFormatter={(_, payload) => {
										const row = rowOf(payload?.[0]?.payload)
										if (!row) return null
										return (
											<div className="grid gap-0.5">
												<span>{row.testTitle}</span>
												<span className="font-normal text-muted-foreground">
													{format(new Date(row.submittedAt), 'd MMMM yyyy, HH:mm', { locale: ru })}
												</span>
											</div>
										)
									}}
									formatter={(_value, _name, item) => {
										const row = rowOf(item.payload)
										if (!row) return null
										return (
											<div className="flex w-full items-center gap-2">
												<span className="size-2.5 shrink-0 rounded-[0.125rem]" style={{ backgroundColor: row.fill }} />
												<span className="text-muted-foreground">{row.topicTitle}</span>
												<span className="ml-auto font-mono font-medium text-foreground tabular-nums">
													{formatPercent(row.percent)} · {row.earnedPoints}/{row.totalPoints}
												</span>
											</div>
										)
									}}
								/>
							}
						/>
						<ChartLegend verticalAlign="top" payload={legendPayload} content={<ChartLegendContent />} />
						<Bar dataKey="percent" radius={4} minPointSize={barMinPointSize}>
							{rows.map((row) => (
								<Cell key={row.key} fill={`var(--color-${row.topicKey})`} />
							))}
							<LabelList
								dataKey="testTitle"
								content={(props: LabelProps) => <BarLabelContent {...props} rows={rows} />}
							/>
						</Bar>
					</BarChart>
				</ChartContainer>
			</div>
		</div>
	)
}

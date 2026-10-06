'use client'

import { useId, useMemo, type ReactNode } from 'react'

import { Area, Bar, CartesianGrid, Cell, ComposedChart, LabelList, Line, XAxis, YAxis, type LabelProps } from 'recharts'

import {
	ChartContainer,
	ChartLegend,
	ChartLegendContent,
	ChartTooltip,
	ChartTooltipContent,
	type ChartConfig,
} from '@/components/ui/chart'
import type { ChartType } from '@/lib/charts/config'
import { barMinPointSize, chartMinWidth, fitBarLabel } from '@/lib/progress/attempt-chart'
import { cn } from '@/lib/utils/cn'

export type SeriesChartSeries = {
	key: string
	label: string
	color: string
	yAxis?: 'left' | 'right'
	type?: ChartType
	stackId?: string
}

export type SeriesChartRow = {
	key: string
	tick: string
	title: string
	subtitle: string
	pointColor?: string | null
	name?: string
	gap?: boolean
	earned?: number | null
	total?: number | null
	[series: string]: string | number | boolean | null | undefined
}

type Axis = { percent: boolean; label?: string }

interface SeriesChartProps {
	type: ChartType
	rows: readonly SeriesChartRow[]
	series: readonly SeriesChartSeries[]
	legend: readonly { key: string; label: string; color: string }[] | null
	labels: 'none' | 'value' | 'name'
	left: Axis
	right?: Axis
	categorical: boolean
	ariaLabel: string
	description: string
	xLabel?: string
	className?: string
}

const PERCENT_TICKS = [0, 25, 50, 75, 100]
const MARGIN = { top: 24, right: 12, bottom: 8, left: 4 }
const LABEL_GAP_PX = 4

function toNumber(value: number | string | undefined): number {
	const parsed = typeof value === 'number' ? value : Number(value)
	return Number.isFinite(parsed) ? parsed : 0
}

function formatValue(value: unknown, percent: boolean): string {
	if (typeof value !== 'number' || !Number.isFinite(value)) return ''
	const text = Number.isInteger(value) ? String(value) : value.toFixed(1).replace('.', ',')
	return percent ? `${text}%` : text
}

const LABEL_TEXT = {
	className: 'attempt-bar-label',
	fontSize: 11,
	fill: 'var(--foreground)',
	stroke: 'var(--card)',
	strokeWidth: 3,
	paintOrder: 'stroke',
	pointerEvents: 'none',
} as const

function NameLabel({ rows, ...props }: LabelProps & { rows: readonly SeriesChartRow[] }) {
	const row = typeof props.index === 'number' ? rows[props.index] : undefined
	if (!row || row.gap || !row.name) return null
	const x = toNumber(props.x)
	const y = toNumber(props.y)
	const width = toNumber(props.width)
	const height = toNumber(props.height)
	const label = fitBarLabel(row.name, { barWidth: width, barHeight: height, spaceAbove: y - MARGIN.top })
	if (!label) return null
	const centerX = x + width / 2
	if (label.vertical) {
		const anchorY = label.placement === 'inside' ? y + height - LABEL_GAP_PX : y - LABEL_GAP_PX
		return (
			<text
				{...LABEL_TEXT}
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
		<text {...LABEL_TEXT} x={centerX} y={y + LABEL_GAP_PX} textAnchor="middle" dominantBaseline="hanging">
			{label.text}
		</text>
	) : (
		<text {...LABEL_TEXT} x={centerX} y={y - LABEL_GAP_PX} textAnchor="middle">
			{label.text}
		</text>
	)
}

function rowOf(payload: unknown): SeriesChartRow | null {
	if (typeof payload !== 'object' || payload === null) return null
	const row = payload as SeriesChartRow
	return row.gap ? null : row
}

export function SeriesChart({
	type,
	rows,
	series,
	legend,
	labels,
	left,
	right,
	categorical,
	ariaLabel,
	description,
	xLabel,
	className,
}: SeriesChartProps) {
	const descriptionId = useId()
	const ticks = useMemo(() => new Map(rows.map((row) => [row.key, row.tick])), [rows])
	const config = useMemo(() => {
		const entries: ChartConfig = {}
		for (const item of series) entries[item.key] = { label: item.label, color: item.color }
		for (const item of legend ?? []) entries[item.key] ??= { label: item.label, color: item.color }
		return entries
	}, [series, legend])
	const legendPayload = useMemo(
		() =>
			(legend ?? []).map((item) => ({
				value: item.key,
				dataKey: item.key,
				color: item.color,
				type: 'square' as const,
			})),
		[legend]
	)
	const singleSeries = series.length === 1
	const percentOf = (item: SeriesChartSeries) => (item.yAxis === 'right' ? (right?.percent ?? false) : left.percent)
	const data = rows as SeriesChartRow[]

	const renderSeries = (item: SeriesChartSeries) => {
		const kind = item.type ?? type
		const axisId = item.yAxis ?? 'left'
		const percent = percentOf(item)
		const valueLabels =
			labels === 'value' ? (
				<LabelList
					dataKey={item.key}
					position={item.stackId && kind === 'bar' ? 'inside' : 'top'}
					formatter={(value: unknown) => formatValue(value, percent)}
					{...LABEL_TEXT}
				/>
			) : null

		if (kind === 'bar') {
			return (
				<Bar
					key={item.key}
					dataKey={item.key}
					yAxisId={axisId}
					fill={`var(--color-${item.key})`}
					stackId={item.stackId}
					radius={item.stackId ? [6, 6, 0, 0] : 4}
					minPointSize={barMinPointSize}
					isAnimationActive={false}
				>
					{singleSeries
						? data.map((row) => <Cell key={row.key} fill={row.pointColor ?? `var(--color-${item.key})`} />)
						: null}
					{valueLabels}
					{labels === 'name' && singleSeries ? (
						<LabelList dataKey="name" content={(props: LabelProps) => <NameLabel {...props} rows={data} />} />
					) : null}
				</Bar>
			)
		}

		const dot = singleSeries
			? (props: { cx?: number; cy?: number; index?: number; payload?: SeriesChartRow }) =>
					typeof props.cx === 'number' && typeof props.cy === 'number' && props.payload?.[item.key] !== null ? (
						<circle
							key={`${item.key}-${props.index}`}
							cx={props.cx}
							cy={props.cy}
							r={3.5}
							fill={props.payload?.pointColor ?? `var(--color-${item.key})`}
							stroke="var(--card)"
							strokeWidth={1.5}
						/>
					) : (
						<g key={`${item.key}-${props.index}`} />
					)
			: { r: 3 }
		const nameLabels =
			labels === 'name' && singleSeries ? (
				<LabelList
					dataKey="name"
					position="top"
					formatter={(value: unknown) =>
						typeof value === 'string' && value.length > 16 ? `${value.slice(0, 15)}…` : value
					}
					{...LABEL_TEXT}
				/>
			) : null

		if (kind === 'area') {
			return (
				<Area
					key={item.key}
					dataKey={item.key}
					yAxisId={axisId}
					type="monotone"
					stroke={`var(--color-${item.key})`}
					fill={`var(--color-${item.key})`}
					fillOpacity={0.25}
					stackId={item.stackId}
					connectNulls
					dot={dot}
					isAnimationActive={false}
				>
					{valueLabels}
					{nameLabels}
				</Area>
			)
		}

		return (
			<Line
				key={item.key}
				dataKey={item.key}
				yAxisId={axisId}
				type="monotone"
				stroke={`var(--color-${item.key})`}
				strokeWidth={2}
				connectNulls
				dot={dot}
				isAnimationActive={false}
			>
				{valueLabels}
				{nameLabels}
			</Line>
		)
	}

	const yAxis = (axis: Axis, id: 'left' | 'right') => (
		<YAxis
			yAxisId={id}
			orientation={id}
			domain={axis.percent ? [0, 100] : [0, 'auto']}
			ticks={axis.percent ? PERCENT_TICKS : undefined}
			allowDecimals={!axis.percent}
			tickLine={false}
			axisLine={false}
			width={axis.label ? 56 : 40}
			tickFormatter={(value: number) => (axis.percent ? `${value}%` : String(value))}
			label={
				axis.label
					? {
							value: axis.label,
							angle: id === 'left' ? -90 : 90,
							position: id === 'left' ? 'insideLeft' : 'insideRight',
							style: { textAnchor: 'middle' },
						}
					: undefined
			}
		/>
	)

	const chart: ReactNode = (
		<ChartContainer
			config={config}
			className={cn('h-72 w-full', className)}
			role="figure"
			aria-label={ariaLabel}
			aria-describedby={descriptionId}
		>
			<ComposedChart accessibilityLayer data={data} margin={MARGIN}>
				<CartesianGrid vertical={false} />
				<XAxis
					dataKey="key"
					tickLine={false}
					axisLine={false}
					tickMargin={10}
					interval={categorical ? 0 : 'preserveStartEnd'}
					minTickGap={categorical ? 0 : 16}
					height={xLabel ? 48 : 32}
					tickFormatter={(value: string) => ticks.get(value) ?? ''}
					label={xLabel ? { value: xLabel, position: 'insideBottom', offset: 0 } : undefined}
				/>
				{yAxis(left, 'left')}
				{right ? yAxis(right, 'right') : null}
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
										<span>{row.title}</span>
										{row.subtitle ? <span className="font-normal text-muted-foreground">{row.subtitle}</span> : null}
									</div>
								)
							}}
							formatter={(value, name, item) => {
								const row = rowOf(item.payload)
								const meta = series.find((entry) => entry.key === name)
								if (!row || !meta || value === null || value === undefined) return null
								const color = singleSeries ? (row.pointColor ?? meta.color) : meta.color
								const points =
									singleSeries && typeof row.earned === 'number' && typeof row.total === 'number'
										? ` · ${row.earned}/${row.total}`
										: ''
								return (
									<div className="flex w-full items-center gap-2">
										<span className="size-2.5 shrink-0 rounded-[0.125rem]" style={{ backgroundColor: color }} />
										<span className="text-muted-foreground">{meta.label}</span>
										<span className="ml-auto font-mono font-medium text-foreground tabular-nums">
											{formatValue(value, percentOf(meta))}
											{points}
										</span>
									</div>
								)
							}}
						/>
					}
				/>
				{legend && legend.length > 0 ? (
					<ChartLegend verticalAlign="top" payload={legendPayload} content={<ChartLegendContent />} />
				) : null}
				{series.map(renderSeries)}
			</ComposedChart>
		</ChartContainer>
	)

	return (
		<div className={categorical ? 'overflow-x-auto' : undefined}>
			<p id={descriptionId} className="sr-only">
				{description}
			</p>
			{categorical ? <div style={{ minWidth: chartMinWidth(rows.length) }}>{chart}</div> : chart}
		</div>
	)
}

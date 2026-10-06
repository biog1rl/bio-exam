'use client'

import type { ReactNode } from 'react'

import { ChartArea, ChartColumn, ChartLine } from 'lucide-react'

import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
	ACTIVITY_METRIC_OPTIONS,
	ACTIVITY_PERIOD_OPTIONS,
	ATTEMPT_COLOR_OPTIONS,
	ATTEMPT_LABEL_OPTIONS,
	ATTEMPT_PERIOD_OPTIONS,
	ATTEMPT_X_OPTIONS,
	ATTEMPT_Y_OPTIONS,
	CHART_TYPE_OPTIONS,
	CONTENT_LIMIT_OPTIONS,
	CONTENT_SERIES_OPTIONS,
	VALUE_LABEL_OPTIONS,
	allowedColors,
	allowedLabels,
	allowedY,
	normalizeAttemptConfig,
	type ActivityChartConfig,
	type AttemptChartConfig,
	type ChartType,
	type ContentChartConfig,
	type Option,
} from '@/lib/charts/config'

const TYPE_ICONS: Record<ChartType, typeof ChartColumn> = { bar: ChartColumn, line: ChartLine, area: ChartArea }

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
	return (
		<div className="min-w-0 space-y-1.5">
			<Label htmlFor={id} className="text-sm font-medium text-foreground">
				{label}
			</Label>
			{children}
		</div>
	)
}

function SelectField<V extends string>({
	id,
	label,
	value,
	options,
	allowed,
	onChange,
}: {
	id: string
	label: string
	value: V
	options: readonly Option<V>[]
	allowed?: readonly V[]
	onChange: (value: V) => void
}) {
	const visible = allowed ? options.filter((option) => allowed.includes(option.value)) : options
	return (
		<Field id={id} label={label}>
			<Select value={value} onValueChange={(next) => onChange(next as V)}>
				<SelectTrigger id={id} className="h-10 w-full rounded-full bg-card">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{visible.map((option) => (
						<SelectItem key={option.value} value={option.value}>
							{option.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</Field>
	)
}

function TypeField({ id, value, onChange }: { id: string; value: ChartType; onChange: (value: ChartType) => void }) {
	return (
		<div className="min-w-0 space-y-1.5">
			<p id={id} className="text-sm font-medium text-foreground">
				Тип графика
			</p>
			<ToggleGroup
				type="single"
				value={value}
				onValueChange={(next) => {
					if (next) onChange(next as ChartType)
				}}
				aria-labelledby={id}
				className="w-full justify-start gap-1 rounded-full border border-border/80 bg-card p-1"
			>
				{CHART_TYPE_OPTIONS.map((option) => {
					const Icon = TYPE_ICONS[option.value]
					return (
						<ToggleGroupItem
							key={option.value}
							value={option.value}
							className="h-8 flex-1 gap-1.5 rounded-full px-3 text-sm data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
						>
							<Icon className="size-4" aria-hidden="true" />
							{option.label}
						</ToggleGroupItem>
					)
				})}
			</ToggleGroup>
		</div>
	)
}

function SwitchField({
	id,
	label,
	checked,
	onChange,
	disabled,
}: {
	id: string
	label: string
	checked: boolean
	onChange: (checked: boolean) => void
	disabled?: boolean
}) {
	return (
		<div className="flex min-h-10 items-center justify-between gap-3 self-end rounded-full border border-border/80 bg-card px-4 py-2">
			<Label htmlFor={id} className="cursor-pointer text-sm font-medium text-foreground">
				{label}
			</Label>
			<Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
		</div>
	)
}

const GRID = 'grid gap-4 tab-sm:grid-cols-2 xl:grid-cols-3'

export function AttemptChartForm({
	config,
	onChange,
}: {
	config: AttemptChartConfig
	onChange: (config: AttemptChartConfig) => void
}) {
	const set = (patch: Partial<AttemptChartConfig>) => onChange(normalizeAttemptConfig({ ...config, ...patch }))
	return (
		<div className={GRID}>
			<TypeField id="chart-type" value={config.type} onChange={(type) => set({ type })} />
			<SelectField
				id="chart-x"
				label="Ось X"
				value={config.x}
				options={ATTEMPT_X_OPTIONS}
				onChange={(x) => set({ x })}
			/>
			<SelectField
				id="chart-y"
				label="Ось Y"
				value={config.y}
				options={ATTEMPT_Y_OPTIONS}
				allowed={allowedY(config.x)}
				onChange={(y) => set({ y })}
			/>
			<SelectField
				id="chart-color"
				label="Цвет"
				value={config.color}
				options={ATTEMPT_COLOR_OPTIONS}
				allowed={allowedColors(config.x)}
				onChange={(color) => set({ color })}
			/>
			<SelectField
				id="chart-period"
				label="Период по умолчанию"
				value={config.period}
				options={ATTEMPT_PERIOD_OPTIONS}
				onChange={(period) => set({ period })}
			/>
			<SelectField
				id="chart-labels"
				label="Подписи"
				value={config.labels}
				options={ATTEMPT_LABEL_OPTIONS}
				allowed={allowedLabels(config.x)}
				onChange={(labels) => set({ labels })}
			/>
			<SwitchField
				id="chart-legend"
				label="Легенда"
				checked={config.legend}
				disabled={config.color === 'none'}
				onChange={(legend) => set({ legend })}
			/>
		</div>
	)
}

export function ContentChartForm({
	config,
	onChange,
}: {
	config: ContentChartConfig
	onChange: (config: ContentChartConfig) => void
}) {
	const set = (patch: Partial<ContentChartConfig>) => onChange({ ...config, ...patch })
	const toggleSeries = (value: ContentChartConfig['series'][number], checked: boolean) => {
		const next = checked ? [...config.series, value] : config.series.filter((item) => item !== value)
		if (next.length === 0) return
		set({ series: CONTENT_SERIES_OPTIONS.map((option) => option.value).filter((item) => next.includes(item)) })
	}
	const canStack = config.series.includes('published') && config.series.includes('drafts')
	return (
		<div className={GRID}>
			<TypeField id="chart-type" value={config.type} onChange={(type) => set({ type })} />
			<fieldset className="min-w-0 space-y-1.5">
				<legend className="mb-1.5 text-sm font-medium text-foreground">Что показывать</legend>
				<div className="flex flex-wrap gap-2">
					{CONTENT_SERIES_OPTIONS.map((option) => {
						const checked = config.series.includes(option.value)
						const id = `chart-series-${option.value}`
						return (
							<label
								key={option.value}
								htmlFor={id}
								className="flex h-10 cursor-pointer items-center gap-2 rounded-full border border-border/80 bg-card px-3 text-sm"
							>
								<Checkbox
									id={id}
									checked={checked}
									disabled={checked && config.series.length === 1}
									onCheckedChange={(next) => toggleSeries(option.value, next === true)}
								/>
								{option.label}
							</label>
						)
					})}
				</div>
			</fieldset>
			<SelectField
				id="chart-limit"
				label="Темы на графике"
				value={config.limit === null ? 'all' : String(config.limit)}
				options={CONTENT_LIMIT_OPTIONS}
				onChange={(value) => set({ limit: value === 'all' ? null : Number(value) })}
			/>
			<SelectField
				id="chart-labels"
				label="Подписи"
				value={config.labels}
				options={VALUE_LABEL_OPTIONS}
				onChange={(labels) => set({ labels })}
			/>
			<SwitchField
				id="chart-stacked"
				label="Тесты одним столбцом"
				checked={config.stacked}
				disabled={!canStack}
				onChange={(stacked) => set({ stacked })}
			/>
			<SwitchField id="chart-legend" label="Легенда" checked={config.legend} onChange={(legend) => set({ legend })} />
		</div>
	)
}

export function ActivityChartForm({
	config,
	onChange,
}: {
	config: ActivityChartConfig
	onChange: (config: ActivityChartConfig) => void
}) {
	const set = (patch: Partial<ActivityChartConfig>) => onChange({ ...config, ...patch })
	return (
		<div className={GRID}>
			<TypeField id="chart-type" value={config.type} onChange={(type) => set({ type })} />
			<SelectField
				id="chart-metric"
				label="Ось Y"
				value={config.metric}
				options={ACTIVITY_METRIC_OPTIONS}
				onChange={(metric) => set({ metric })}
			/>
			<SelectField
				id="chart-period"
				label="Период"
				value={config.period}
				options={ACTIVITY_PERIOD_OPTIONS}
				onChange={(period) => set({ period })}
			/>
			<SelectField
				id="chart-labels"
				label="Подписи"
				value={config.labels}
				options={VALUE_LABEL_OPTIONS}
				onChange={(labels) => set({ labels })}
			/>
			<SwitchField id="chart-legend" label="Легенда" checked={config.legend} onChange={(legend) => set({ legend })} />
		</div>
	)
}

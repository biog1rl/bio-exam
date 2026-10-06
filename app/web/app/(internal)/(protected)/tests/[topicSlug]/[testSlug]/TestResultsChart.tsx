'use client'

import { useMemo, useState } from 'react'
import type { DateRange } from 'react-day-picker'

import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { CalendarRange } from 'lucide-react'
import { useQueryState } from 'nuqs'
import useSWR from 'swr'

import { AttemptChart } from '@/components/charts/AttemptChart'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useChartSettingsState } from '@/lib/charts/api'
import {
	PERIOD_PRESETS,
	parseDateParam,
	resolvePeriodBounds,
	type PeriodValue,
	type ProgressAttempt,
} from '@/lib/progress/attempt-chart'
import { fetchChartData } from '@/lib/tests/api'
import { cn } from '@/lib/utils/cn'

const PRESET_VALUES: readonly string[] = PERIOD_PRESETS.map((preset) => preset.value)

type TestMeta = { id: string; title: string; slug: string; topicSlug: string; topicTitle: string }

export function TestResultsChart({ test }: { test: TestMeta }) {
	const { configs, loaded } = useChartSettingsState()
	const config = configs.testResults
	const [now] = useState(() => new Date())
	const [range, setRange] = useQueryState('range', { defaultValue: '' })
	const [customFrom, setCustomFrom] = useQueryState('from', { defaultValue: '' })
	const [customTo, setCustomTo] = useQueryState('to', { defaultValue: '' })
	const [calendarOpen, setCalendarOpen] = useState(false)
	const [calendarRange, setCalendarRange] = useState<DateRange>({ from: undefined, to: undefined })

	const period: PeriodValue =
		range === 'custom' || PRESET_VALUES.includes(range) ? (range as PeriodValue) : config.period
	const bounds = useMemo(
		() => resolvePeriodBounds({ period, from: customFrom, to: customTo }, now),
		[period, customFrom, customTo, now]
	)
	const from = bounds.start?.toISOString()
	const to = bounds.end?.toISOString()

	const { data, isLoading, error } = useSWR(
		loaded || range !== '' ? `test-chart:${test.id}:${from ?? ''}:${to ?? ''}` : null,
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

	const choosePreset = (value: string) => {
		if (!value) return
		void setRange(value)
		void setCustomFrom(null)
		void setCustomTo(null)
	}

	const chooseDates = (selected: DateRange | undefined) => {
		if (!selected) return
		setCalendarRange(selected)
		if (selected.from && selected.to && selected.from.getTime() !== selected.to.getTime()) {
			void setRange('custom')
			void setCustomFrom(selected.from.toISOString())
			void setCustomTo(selected.to.toISOString())
			setCalendarOpen(false)
		}
	}

	const customStart = parseDateParam(customFrom)
	const customEnd = parseDateParam(customTo)
	const customLabel =
		period === 'custom' && customStart && customEnd
			? `${format(customStart, 'dd.MM.yy', { locale: ru })} — ${format(customEnd, 'dd.MM.yy', { locale: ru })}`
			: 'Свой период'

	return (
		<section className="rounded-3xl border border-border/80 bg-card p-4 shadow-sm tab-sm:p-5">
			<div className="mb-4 flex flex-wrap items-center justify-between gap-3">
				<h2 className="text-lg font-semibold text-foreground">Мои результаты</h2>
				<div className="flex flex-wrap items-center gap-2">
					<ToggleGroup
						type="single"
						value={period === 'custom' ? '' : period}
						onValueChange={choosePreset}
						aria-label="Период графика"
						className="flex-wrap justify-start gap-1 rounded-full border border-border/80 bg-card p-1"
					>
						{PERIOD_PRESETS.map((preset) => (
							<ToggleGroupItem
								key={preset.value}
								value={preset.value}
								className="h-8 rounded-full px-3 text-sm data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
							>
								{preset.label}
							</ToggleGroupItem>
						))}
					</ToggleGroup>
					<Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
						<PopoverTrigger asChild>
							<Button
								variant={period === 'custom' ? 'default' : 'outline'}
								className={cn('h-10 rounded-full', period !== 'custom' && 'bg-card')}
							>
								<CalendarRange className="size-4" aria-hidden="true" />
								{customLabel}
							</Button>
						</PopoverTrigger>
						<PopoverContent className="w-auto p-0" align="end">
							<Calendar mode="range" selected={calendarRange} onSelect={chooseDates} locale={ru} numberOfMonths={2} />
						</PopoverContent>
					</Popover>
				</div>
			</div>

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
		</section>
	)
}

'use client'

import { useMemo, useState } from 'react'
import type { DateRange } from 'react-day-picker'

import { format, subMonths, subWeeks } from 'date-fns'
import { ru } from 'date-fns/locale'
import Link from 'next/link'
import { useQueryState } from 'nuqs'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import useSWR from 'swr'

import { SetBreadcrumbsLabels } from '@/components/Breadcrumbs/SetBreadcrumbsLabels'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { ChartContainer, ChartTooltip } from '@/components/ui/chart'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { ChartDataPoint } from '@/lib/tests/api'
import { fetchChartData, fetchChartDefaultRange, fetchMyTestAttempts, fetchPublicTestBySlug } from '@/lib/tests/api'
import { formatPercent } from '@/lib/tests/format'
import type { TestAttemptSummary } from '@/lib/tests/types'

const chartConfig = {
	maxScore: {
		label: 'Лучший результат',
		color: 'var(--chart-1)',
	},
}

function ChartTooltipCustom({ active, payload }: { active?: boolean; payload?: { payload: ChartDataPoint }[] }) {
	if (!active || !payload?.length) return null
	const d = payload[0].payload
	const dateLabel = format(new Date(d.date), 'd MMMM yyyy', { locale: ru })
	return (
		<div className="bg-background min-w-40 space-y-1 rounded-lg border px-3 py-2 text-sm">
			<p className="font-medium">{dateLabel}</p>
			<p className="text-muted-foreground">Попыток: {d.count}</p>
			<p className="text-green-600 dark:text-green-400">Лучший: {formatPercent(d.maxScore)}</p>
			{d.count > 1 && <p className="text-red-500 dark:text-red-400">Худший: {formatPercent(d.minScore)}</p>}
		</div>
	)
}

interface Props {
	topicSlug: string
	testSlug: string
}

export function TestLandingPageClient({ topicSlug, testSlug }: Props) {
	// --- Test resolution ---
	const { data: testData, isLoading: testLoading } = useSWR(`${topicSlug}/${testSlug}`, () =>
		fetchPublicTestBySlug(topicSlug, testSlug)
	)
	const test = testData?.test ?? null
	const testId = test?.id ?? null

	// --- Attempts widget ---
	const [offset, setOffset] = useState(0)
	const [allRows, setAllRows] = useState<TestAttemptSummary[]>([])
	const [total, setTotal] = useState(0)
	const [loadingMore, setLoadingMore] = useState(false)

	const { isLoading: attemptsLoading } = useSWR(
		testId ? `attempts-${testId}-first` : null,
		() => fetchMyTestAttempts(testId!, { offset: 0, limit: 5 }),
		{
			onSuccess(data) {
				setAllRows(data.rows)
				setTotal(data.total)
				setOffset(5)
			},
			revalidateOnFocus: false,
		}
	)

	const handleLoadMore = async () => {
		if (!testId || loadingMore) return
		setLoadingMore(true)
		try {
			const data = await fetchMyTestAttempts(testId, { offset, limit: 5 })
			setAllRows((prev) => [...prev, ...data.rows])
			setOffset((prev) => prev + data.rows.length)
		} finally {
			setLoadingMore(false)
		}
	}

	// --- Date filter (nuqs URL state) ---
	const [range, setRange] = useQueryState('range', { defaultValue: '' })
	const [customFrom, setCustomFrom] = useQueryState('from', { defaultValue: '' })
	const [customTo, setCustomTo] = useQueryState('to', { defaultValue: '' })
	const [calendarOpen, setCalendarOpen] = useState(false)
	const [calendarRange, setCalendarRange] = useState<DateRange>({ from: undefined, to: undefined })

	const { data: adminDefaultData } = useSWR('chart-default-range', fetchChartDefaultRange)
	const adminDefault = adminDefaultData?.value ?? 'month'
	const effectiveRange = range || adminDefault

	// --- Chart data ---
	const { from: chartFrom, to: chartTo } = useMemo(() => {
		const now = new Date()
		if (effectiveRange === 'week') return { from: subWeeks(now, 1).toISOString(), to: undefined }
		if (effectiveRange === 'month') return { from: subMonths(now, 1).toISOString(), to: undefined }
		if (effectiveRange === 'custom')
			return {
				from: customFrom || undefined,
				to: customTo || undefined,
			}
		// 'all'
		return { from: undefined, to: undefined }
	}, [effectiveRange, customFrom, customTo])

	const { data: chartData, isLoading: chartLoading } = useSWR(
		testId ? `chart-${testId}-${effectiveRange}-${chartFrom}-${chartTo}` : null,
		() => fetchChartData(testId!, { from: chartFrom, to: chartTo }),
		{ revalidateOnFocus: false, keepPreviousData: true }
	)

	const handlePresetChange = (value: string) => {
		if (!value) return
		setRange(value)
		setCustomFrom('')
		setCustomTo('')
	}

	const handleCalendarSelect = (selected: DateRange | undefined) => {
		if (!selected) return
		setCalendarRange(selected)
		if (selected.from && selected.to && selected.from.getTime() !== selected.to.getTime()) {
			setCustomFrom(selected.from.toISOString())
			setCustomTo(selected.to.toISOString())
			setCalendarOpen(false)
		}
	}

	// --- Render ---
	if (testLoading) {
		return (
			<main className="tab-sm:p-6 space-y-6 p-4">
				<Skeleton className="h-8 w-64" />
				<Skeleton className="h-70 w-full" />
				<Skeleton className="h-65 w-full" />
			</main>
		)
	}

	if (!test) {
		return (
			<main className="tab-sm:p-6 p-4">
				<p className="text-muted-foreground">Тест не найден</p>
			</main>
		)
	}

	const labels = {
		[`/tests/${topicSlug}`]: test.topicTitle,
		[`/tests/${topicSlug}/${testSlug}`]: test.title,
	}

	const points = chartData?.data ?? []

	return (
		<main className="tab-sm:p-6 space-y-6 p-4">
			<SetBreadcrumbsLabels labels={labels} />

			{/* Header */}
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<h1 className="text-2xl font-semibold">{test.title}</h1>
					{test.description && <p className="text-muted-foreground mt-1 text-sm">{test.description}</p>}
				</div>
				<Button asChild size="lg" className="mob:w-auto w-full">
					<Link href={`/tests/${topicSlug}/${testSlug}/start/`}>Начать тест</Link>
				</Button>
			</div>

			{/* Attempts widget */}
			<section className="space-y-2">
				<h2 className="text-lg font-medium">История попыток</h2>
				<ScrollArea className="h-70 rounded-md border">
					{attemptsLoading ? (
						<div className="space-y-2 p-4">
							{[...Array(3)].map((_, i) => (
								<Skeleton key={i} className="h-8 w-full" />
							))}
						</div>
					) : total === 0 ? (
						<div className="text-muted-foreground flex h-full items-center justify-center p-8 text-sm">
							Ещё нет попыток
						</div>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Номер попытки</TableHead>
									<TableHead>Дата</TableHead>
									<TableHead>% правильных</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{allRows.map((row, idx) => (
									<TableRow key={row.id}>
										<TableCell>{total - idx}</TableCell>
										<TableCell>{format(new Date(row.submittedAt), 'dd.MM.yyyy', { locale: ru })}</TableCell>
										<TableCell>{formatPercent(row.scorePercentage)}</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</ScrollArea>
				{allRows.length < total && (
					<Button variant="outline" size="sm" onClick={handleLoadMore} disabled={loadingMore}>
						{loadingMore ? 'Загрузка...' : 'Загрузить ещё'}
					</Button>
				)}
			</section>

			{/* Chart section */}
			<section className="space-y-4">
				<div className="flex flex-wrap items-center gap-2">
					<ToggleGroup
						type="single"
						value={['week', 'month', 'all'].includes(effectiveRange) ? effectiveRange : ''}
						onValueChange={handlePresetChange}
					>
						<ToggleGroupItem value="week">Неделя</ToggleGroupItem>
						<ToggleGroupItem value="month">Месяц</ToggleGroupItem>
						<ToggleGroupItem value="all">Всё время</ToggleGroupItem>
					</ToggleGroup>

					<Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
						<PopoverTrigger asChild>
							<Button
								variant={effectiveRange === 'custom' ? 'default' : 'outline'}
								size="sm"
								onClick={() => {
									setRange('custom')
								}}
							>
								{effectiveRange === 'custom' && customFrom && customTo
									? `${format(new Date(customFrom), 'dd.MM.yy', { locale: ru })} — ${format(new Date(customTo), 'dd.MM.yy', { locale: ru })}`
									: 'Свой диапазон'}
							</Button>
						</PopoverTrigger>
						<PopoverContent className="w-auto p-0" align="start">
							<Calendar
								mode="range"
								selected={calendarRange}
								onSelect={handleCalendarSelect}
								locale={ru}
								numberOfMonths={2}
							/>
						</PopoverContent>
					</Popover>
				</div>

				<div className="transition-opacity duration-300" style={{ opacity: chartLoading ? 0.4 : 1 }}>
					{chartLoading && points.length === 0 ? (
						<Skeleton className="h-50 w-full" />
					) : !chartLoading && points.length === 0 ? (
						<div className="text-muted-foreground h-50 flex items-center justify-center rounded-md border text-sm">
							Нет данных за выбранный период
						</div>
					) : (
						<ChartContainer config={chartConfig} className="h-50 w-full">
							<AreaChart data={points}>
								<CartesianGrid vertical={false} />
								<XAxis
									dataKey="date"
									tickFormatter={(v: string) => format(new Date(v), 'd MMM', { locale: ru })}
									tick={{ fontSize: 11 }}
								/>
								<YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
								<ChartTooltip content={<ChartTooltipCustom />} />
								<Area
									dataKey="maxScore"
									type="monotone"
									fill="var(--color-maxScore)"
									stroke="var(--color-maxScore)"
									fillOpacity={0.3}
								/>
							</AreaChart>
						</ChartContainer>
					)}
				</div>
			</section>
		</main>
	)
}

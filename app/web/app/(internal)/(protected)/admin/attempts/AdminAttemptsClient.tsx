'use client'

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { DateRange } from 'react-day-picker'

import { format, isValid, parseISO } from 'date-fns'
import { ru } from 'date-fns/locale'
import { CalendarRange, CheckCircle2, Clock3, Loader2, XCircle } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import useSWR from 'swr'

import { LoadErrorAlert } from '@/components/feedback/LoadErrorAlert'
import { PageHeader } from '@/components/page/PageHeader'
import { ToolbarButton } from '@/components/page/ToolbarButton'
import { ToolbarSearch } from '@/components/page/ToolbarSearch'
import { useAuth } from '@/components/providers/AuthProvider'
import { ColumnFilterMenu, type ColumnFilterOption } from '@/components/table/ColumnFilterMenu'
import { SortableHead } from '@/components/table/SortableHead'
import { TableCard } from '@/components/table/TableCard'
import { useRowLink } from '@/components/table/use-row-link'
import { ReviewStatusChip } from '@/components/tests/attempt-result/ReviewStatusChip'
import { TeacherCheckedMark } from '@/components/tests/attempt-result/TeacherCheckedMark'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { failureMessage } from '@/lib/http/errors'
import {
	ATTEMPTS_LOAD_ERROR,
	adminAttemptsFetcher,
	adminTestsKeys,
	fetchAdminAttemptsPage,
	mergeAttemptPages,
} from '@/lib/tests/admin-api'
import { attemptResultView } from '@/lib/tests/attempt-result-view'
import {
	attemptsUrl,
	formatDay,
	nextAttemptsSort,
	parseAttemptsUrl,
	parseDay,
	type AttemptResult,
	type AttemptsUrlFilters,
	type ReviewFilter,
} from '@/lib/tests/attempts-url'
import { matchesUserStatus, type UserStatus } from '@/lib/users/status-filter'
import { cn } from '@/lib/utils/cn'
import { sortDirectionOf } from '@/lib/utils/table-sort'

import type { AdminAttemptListItem, AdminAttemptsResponse } from './attempts-types'

const STATUS_OPTIONS: readonly ColumnFilterOption<string>[] = [
	{ value: 'active', label: 'Активные' },
	{ value: 'inactive', label: 'Неактивные' },
]

const RESULT_OPTIONS: readonly ColumnFilterOption<AttemptResult>[] = [
	{ value: 'passed', label: 'Пройден' },
	{ value: 'failed', label: 'Не пройден' },
]

const REVIEW_OPTIONS: readonly ColumnFilterOption<string>[] = [
	{ value: 'pending', label: 'На проверке' },
	{ value: 'graded', label: 'Проверено учителем' },
]

type MorePages = { key: string; pages: AdminAttemptsResponse[] }

function subscribeNever() {
	return () => {}
}

function onClient() {
	return true
}

function onServer() {
	return false
}

function submittedLabel(value: string): string {
	const date = parseISO(value)
	return isValid(date) ? format(date, 'd MMM yyyy, HH:mm', { locale: ru }) : '—'
}

function periodRange(from: string | null, to: string | null): DateRange | undefined {
	const start = parseDay(from)
	if (!start) return undefined
	return { from: start, to: parseDay(to) ?? start }
}

function periodLabel(range: DateRange): string {
	const from = range.from ? format(range.from, 'dd.MM.yy') : ''
	const to = range.to ? format(range.to, 'dd.MM.yy') : from
	return from === to ? from : `${from} — ${to}`
}

function statusOfChoice(selected: readonly string[]): UserStatus {
	const [only] = selected
	return selected.length === 1 && (only === 'active' || only === 'inactive') ? only : 'all'
}

function reviewOfChoice(selected: readonly string[]): ReviewFilter {
	const [only] = selected
	return selected.length === 1 && (only === 'pending' || only === 'graded') ? only : 'all'
}

function emptyAttemptsContent({
	filtered,
	review,
	zoneAll,
}: {
	filtered: boolean
	review: ReviewFilter
	zoneAll: boolean
}): { title: string; text: string } {
	if (review === 'pending') {
		return {
			title: 'Нет попыток на проверке',
			text: 'Здесь появятся сданные попытки, в которых есть ответы, ожидающие проверки учителем.',
		}
	}
	if (review === 'graded') {
		return {
			title: 'Нет проверенных попыток',
			text: 'Здесь появятся попытки с открытыми вопросами, проверенные учителем.',
		}
	}
	if (filtered) {
		return {
			title: 'Ничего не найдено',
			text: 'Измените поиск, тему, ученика, дату или проверку, чтобы расширить выборку.',
		}
	}
	return {
		title: 'Попыток пока нет',
		text: zoneAll
			? 'Когда ученики начнут проходить тесты, здесь появится журнал результатов.'
			: 'Здесь появятся попытки учеников по вашим темам.',
	}
}

function AttemptResultCell({ attempt }: { attempt: AdminAttemptListItem }) {
	const view = attemptResultView(attempt)
	if (view.kind === 'pending') {
		return (
			<TableCell className="py-3 pr-4 text-right">
				<span className="inline-flex justify-end">
					<ReviewStatusChip />
				</span>
				{view.auto ? (
					<p className="mt-1 text-xs text-muted-foreground tabular-nums">
						авто {view.auto.earned} из {view.auto.total}
					</p>
				) : null}
			</TableCell>
		)
	}
	const Icon = view.passed ? CheckCircle2 : XCircle
	const label = view.passed ? 'Пройден' : 'Не пройден'
	return (
		<TableCell className="py-3 pr-4 text-right">
			<span className="inline-flex items-center justify-end gap-1.5" title={label}>
				<Icon
					className={cn('size-3.5', view.passed ? 'text-green-700 dark:text-green-400' : 'text-destructive')}
					aria-hidden="true"
				/>
				<span className="font-medium text-foreground tabular-nums">{Math.round(view.percent)}%</span>
				<span className="sr-only">{label}</span>
			</span>
			<p className="text-xs text-muted-foreground tabular-nums">
				{view.points.earned}/{view.points.total}
			</p>
			{view.teacherChecked ? (
				<span className="mt-1 inline-flex justify-end">
					<TeacherCheckedMark />
				</span>
			) : null}
		</TableCell>
	)
}

export function AdminAttemptsClient({ initial, initialKey }: { initial: AdminAttemptsResponse; initialKey: string }) {
	const { can } = useAuth()
	const zoneAll = can('zone', 'all')
	const titleRef = useRef<HTMLHeadingElement>(null)
	const rowLink = useRowLink()
	const searchParams = useSearchParams()
	const url = useMemo(() => parseAttemptsUrl(searchParams ?? new URLSearchParams()), [searchParams])
	const hydrated = useSyncExternalStore(subscribeNever, onClient, onServer)
	const [periodOpen, setPeriodOpen] = useState(false)
	const [more, setMore] = useState<MorePages | null>(null)
	const [loadingMoreKey, setLoadingMoreKey] = useState<string | null>(null)

	const updateUrl = (patch: Partial<AttemptsUrlFilters>) => {
		window.history.replaceState(null, '', attemptsUrl({ ...url, ...patch }))
	}

	const filters = url
	const key = hydrated || url.from === null ? adminTestsKeys.attempts(filters) : initialKey
	const keyRef = useRef(key)
	useEffect(() => {
		keyRef.current = key
	}, [key])

	const { data, error, isLoading, mutate } = useSWR(key, adminAttemptsFetcher, {
		fallbackData: key === initialKey ? initial : undefined,
		revalidateOnMount: key === initialKey ? false : undefined,
		revalidateOnFocus: false,
		revalidateOnReconnect: false,
		keepPreviousData: true,
	})

	const extraPages = more && more.key === key ? more.pages : []
	const merged = data ? mergeAttemptPages([data, ...extraPages]) : null
	const loadFailed = error !== undefined
	const facets = data?.facets ?? initial.facets
	const pendingTotal = data?.summary.pendingTotal ?? initial.summary.pendingTotal
	const scopeTotal = data?.scopeTotal ?? initial.scopeTotal
	const loadingMore = loadingMoreKey === key
	const period = periodRange(url.from, url.to)

	const otherFilters =
		url.q.trim() !== '' ||
		url.topics.length > 0 ||
		url.students.length > 0 ||
		url.results.length > 0 ||
		url.from !== null ||
		url.status !== 'active'
	const hasFilters = otherFilters || url.review !== 'all'

	const hiddenInactive =
		merged !== null && merged.rows.length === 0 && url.status === 'active' && !hasFilters && scopeTotal > 0
	const empty = emptyAttemptsContent({
		filtered: hasFilters || hiddenInactive,
		review: otherFilters ? 'all' : url.review,
		zoneAll,
	})

	const changeStatus = (selected: string[]) => {
		const status = statusOfChoice(selected)
		const visible = new Set(
			facets.students.filter((student) => matchesUserStatus(student.isActive, status)).map((student) => student.id)
		)
		updateUrl({ status, students: url.students.filter((id) => visible.has(id)) })
	}

	const selectPeriod = (range: DateRange | undefined) => {
		const from = range?.from ? formatDay(range.from) : null
		const to = range?.to ? formatDay(range.to) : null
		updateUrl({ from, to: to === from ? null : to })
		if (from && to && to !== from) setPeriodOpen(false)
	}

	const resetPeriod = () => {
		updateUrl({ from: null, to: null })
		setPeriodOpen(false)
	}

	const resetFilters = () => {
		updateUrl({ topics: [], students: [], results: [], status: 'active', review: 'all', q: '', from: null, to: null })
	}

	const loadMore = async () => {
		if (!merged || loadingMore) return
		const requestKey = key
		const offset = merged.loaded
		setLoadingMoreKey(requestKey)
		const outcome = await fetchAdminAttemptsPage(filters, offset)
		setLoadingMoreKey((current) => (current === requestKey ? null : current))
		if (keyRef.current !== requestKey) return
		if (!outcome.ok) {
			const text = failureMessage(outcome, ATTEMPTS_LOAD_ERROR)
			if (text) toast.error(text)
			return
		}
		setMore((current) => {
			const pages = current && current.key === requestKey ? current.pages : []
			return { key: requestKey, pages: [...pages, outcome.data] }
		})
	}

	const studentOptions = facets.students
		.filter((student) => matchesUserStatus(student.isActive, url.status))
		.map((student) => ({ value: student.id, label: student.name, hint: student.isActive ? undefined : 'неактивен' }))

	const studentFilter = (
		<ColumnFilterMenu
			label="Фильтр по ученикам"
			searchPlaceholder="Найти ученика"
			groups={[
				{
					label: 'Статус ученика',
					options: STATUS_OPTIONS,
					selected: url.status === 'all' ? [] : [url.status],
					onChange: changeStatus,
				},
				{
					label: 'Ученики',
					options: studentOptions,
					selected: url.students,
					onChange: (students) => updateUrl({ students }),
				},
			]}
			onReset={() => updateUrl({ status: 'all', students: [] })}
		/>
	)

	const topicFilter = (
		<ColumnFilterMenu
			label="Фильтр по темам"
			options={facets.topics.map((topic) => ({ value: topic.slug, label: topic.title }))}
			selected={url.topics}
			onChange={(topics) => updateUrl({ topics })}
		/>
	)

	const resultFilter = (
		<ColumnFilterMenu
			label="Фильтр по результату"
			groups={[
				{
					label: 'Результат',
					options: RESULT_OPTIONS,
					selected: url.results,
					onChange: (results) => updateUrl({ results: results as AttemptResult[] }),
				},
				{
					label: 'Проверка',
					options: REVIEW_OPTIONS,
					selected: url.review === 'all' ? [] : [url.review],
					onChange: (selected) => updateUrl({ review: reviewOfChoice(selected) }),
				},
			]}
			onReset={() => updateUrl({ results: [], review: 'all' })}
			align="end"
		/>
	)

	return (
		<div className="space-y-4">
			<PageHeader title="Попытки" titleRef={titleRef}>
				<div className="flex items-center gap-1 lg:hidden">
					{topicFilter}
					<span className="tab-sm:hidden">{resultFilter}</span>
				</div>
				<ToolbarSearch
					value={url.q}
					onChange={(q) => updateUrl({ q })}
					label="Поиск попыток"
					placeholder="Ученик, тест или тема"
				/>
				{pendingTotal > 0 || url.review === 'pending' ? (
					<Button
						variant={url.review === 'pending' ? 'default' : 'outline'}
						aria-pressed={url.review === 'pending'}
						className={cn('h-10 shrink-0 rounded-full', url.review !== 'pending' && 'bg-card')}
						onClick={() => updateUrl({ review: url.review === 'pending' ? 'all' : 'pending' })}
					>
						<Clock3 className="size-4" aria-hidden="true" />
						{pendingTotal} на проверке
					</Button>
				) : null}
				<Popover open={periodOpen} onOpenChange={setPeriodOpen}>
					<PopoverTrigger asChild>
						<ToolbarButton label="Период" dot={period !== undefined}>
							<CalendarRange className="size-4" aria-hidden="true" />
						</ToolbarButton>
					</PopoverTrigger>
					<PopoverContent align="end" className="w-auto p-0">
						<Calendar
							mode="range"
							selected={period}
							onSelect={selectPeriod}
							defaultMonth={period?.from}
							locale={ru}
							numberOfMonths={1}
						/>
						{period ? (
							<div className="flex items-center justify-between gap-3 border-t px-3 py-2">
								<span className="text-sm text-muted-foreground tabular-nums">{periodLabel(period)}</span>
								<Button variant="ghost" size="sm" className="rounded-full" onClick={resetPeriod}>
									Сбросить период
								</Button>
							</div>
						) : null}
					</PopoverContent>
				</Popover>
			</PageHeader>

			{loadFailed ? (
				<LoadErrorAlert title={ATTEMPTS_LOAD_ERROR} error={error} onRetry={() => mutate()} focusTarget={titleRef} />
			) : !merged ? (
				<Skeleton className="h-96 rounded-3xl" aria-label="Загрузка попыток" />
			) : (
				<div className="space-y-2">
					<div aria-busy={isLoading || undefined} className={cn('transition-opacity', isLoading && 'opacity-60')}>
						<TableCard>
							<Table className="table-fixed">
								<TableHeader>
									<TableRow className="hover:bg-transparent">
										<TableHead className="pl-4">
											<span className="inline-flex items-center gap-1">
												Ученик
												{studentFilter}
											</span>
										</TableHead>
										<TableHead>Тест</TableHead>
										<TableHead className="hidden w-40 lg:table-cell">
											<span className="inline-flex items-center gap-1">
												Тема
												{topicFilter}
											</span>
										</TableHead>
										<SortableHead
											label="Дата"
											direction={sortDirectionOf(url.sort, 'date')}
											onSort={() => updateUrl({ sort: nextAttemptsSort(url.sort, 'date') })}
											align="right"
											className="hidden w-44 tab-sm:table-cell"
										/>
										<SortableHead
											label="Результат"
											direction={sortDirectionOf(url.sort, 'score')}
											onSort={() => updateUrl({ sort: nextAttemptsSort(url.sort, 'score') })}
											align="right"
											filter={<span className="hidden tab-sm:inline-flex">{resultFilter}</span>}
											className="w-32 pr-4 tab-sm:w-40"
										/>
									</TableRow>
								</TableHeader>
								<TableBody>
									{merged.rows.length === 0 ? (
										<TableRow className="hover:bg-transparent">
											<TableCell colSpan={5} className="py-12 text-center whitespace-normal">
												<p className="font-medium text-foreground">{empty.title}</p>
												<p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{empty.text}</p>
												<div className="mt-4 flex flex-wrap justify-center gap-2">
													{hiddenInactive ? (
														<Button
															variant="outline"
															className="rounded-full bg-card"
															onClick={() => updateUrl({ status: 'all' })}
														>
															Показать всех учеников
														</Button>
													) : null}
													{hasFilters ? (
														<Button variant="outline" className="rounded-full bg-card" onClick={resetFilters}>
															Сбросить фильтры
														</Button>
													) : null}
												</div>
											</TableCell>
										</TableRow>
									) : null}
									{merged.rows.map((attempt) => {
										const href = `/admin/attempts/${attempt.attemptId}`
										return (
											<TableRow key={attempt.attemptId} className="cursor-pointer" {...rowLink(href)}>
												<TableCell className="py-3 pl-4">
													<p
														className={cn(
															'[overflow-wrap:anywhere]',
															attempt.studentIsActive ? 'text-foreground' : 'text-muted-foreground'
														)}
													>
														{attempt.studentName}
													</p>
													{attempt.studentIsActive ? null : <p className="text-xs text-muted-foreground">неактивен</p>}
												</TableCell>
												<TableCell className="py-3">
													<Link
														href={href}
														className="font-medium [overflow-wrap:anywhere] text-foreground transition-colors hover:text-primary focus-visible:underline focus-visible:outline-none"
													>
														{attempt.testTitle}
													</Link>
													<p className="mt-0.5 text-xs text-muted-foreground lg:hidden">
														{attempt.topicTitle}
														<span className="tab-sm:hidden"> · {submittedLabel(attempt.submittedAt)}</span>
													</p>
												</TableCell>
												<TableCell className="hidden truncate text-muted-foreground lg:table-cell">
													{attempt.topicTitle}
												</TableCell>
												<TableCell className="hidden text-right whitespace-nowrap text-muted-foreground tabular-nums tab-sm:table-cell">
													{submittedLabel(attempt.submittedAt)}
												</TableCell>
												<AttemptResultCell attempt={attempt} />
											</TableRow>
										)
									})}
								</TableBody>
							</Table>
						</TableCard>
					</div>
					{merged.hasMore ? (
						<div className="flex flex-wrap items-center justify-center gap-3 pt-2">
							<Button
								variant="outline"
								className="rounded-full bg-card"
								onClick={() => void loadMore()}
								disabled={loadingMore || isLoading}
								aria-busy={loadingMore || undefined}
							>
								{loadingMore ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
								Показать ещё
							</Button>
							<p className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
								Показано {merged.rows.length} из {merged.total}
							</p>
						</div>
					) : null}
				</div>
			)}
		</div>
	)
}

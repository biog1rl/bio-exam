'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { DateRange } from 'react-day-picker'

import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { ArrowRight, CalendarIcon, CheckCircle2, Clock3, FileText, Loader2, Search, XCircle } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import useSWR from 'swr'

import { useDebounce } from '@/components/editor/editor-hooks/use-debounce'
import { LoadErrorAlert } from '@/components/feedback/LoadErrorAlert'
import { useAuth } from '@/components/providers/AuthProvider'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { UserStatusFilter } from '@/components/users/UserStatusFilter'
import { failureMessage } from '@/lib/http/errors'
import {
	ATTEMPTS_LOAD_ERROR,
	adminAttemptsFetcher,
	adminTestsKeys,
	attemptsDayRange,
	fetchAdminAttemptsPage,
	mergeAttemptPages,
	type AttemptsFilters,
} from '@/lib/tests/admin-api'
import { matchesUserStatus, type UserStatus } from '@/lib/users/status-filter'

import type { AdminAttemptListItem, AdminAttemptsResponse } from './attempts-types'

const SEARCH_DEBOUNCE_MS = 300

type MorePages = { key: string; pages: AdminAttemptsResponse[] }

function formatDate(value?: string) {
	if (!value) return 'нет даты'
	return new Intl.DateTimeFormat('ru-RU', {
		day: '2-digit',
		month: 'short',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	}).format(new Date(value))
}

function formatDateRange(range: DateRange | undefined) {
	if (!range?.from) return 'Любой период'
	if (!range.to) return `${format(range.from, 'dd.MM.yy', { locale: ru })} — ...`
	return `${format(range.from, 'dd.MM.yy', { locale: ru })} — ${format(range.to, 'dd.MM.yy', { locale: ru })}`
}

function StatTile({ label, value, icon: Icon }: { label: string; value: string | number; icon: typeof FileText }) {
	return (
		<div className="rounded-3xl border border-border/70 bg-secondary/65 p-4">
			<Icon className="mb-4 size-5 text-primary" />
			<p className="font-serif text-3xl leading-none">{value}</p>
			<p className="mt-2 text-sm text-muted-foreground">{label}</p>
		</div>
	)
}

function emptyAttemptsText(filtered: boolean, zoneAll: boolean) {
	if (filtered) return 'Измените поиск, тему, студента или дату, чтобы расширить выборку.'
	if (!zoneAll) return 'Здесь появятся попытки учеников по вашим темам.'
	return 'Когда студенты начнут проходить тесты, здесь появится журнал результатов.'
}

function AttemptsEmptyState({ filtered, zoneAll }: { filtered: boolean; zoneAll: boolean }) {
	return (
		<section className="rounded-4xl border border-border/80 bg-card/90 p-unit-mob tab-sm:p-unit">
			<FileText className="size-7 text-primary" />
			<h2 className="mt-5 font-serif text-3xl">{filtered ? 'Ничего не найдено' : 'Попыток пока нет'}</h2>
			<p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{emptyAttemptsText(filtered, zoneAll)}</p>
		</section>
	)
}

function AttemptRow({ attempt }: { attempt: AdminAttemptListItem }) {
	const ResultIcon = attempt.passed ? CheckCircle2 : XCircle

	return (
		<Link
			href={`/admin/attempts/${attempt.attemptId}`}
			className="block rounded-3xl border border-border/80 bg-card/90 px-4 py-3 transition-colors outline-none hover:border-primary/45 hover:bg-secondary/45 focus-visible:border-primary"
		>
			<div className="grid gap-3 tab-sm:grid-cols-[minmax(0,1fr)_10.625rem_7.1875rem_1.5rem] tab-sm:items-center">
				<div className="min-w-0">
					<div className="flex flex-wrap items-center gap-2">
						<span className="font-mono text-[0.625rem] tracking-[0.18em] text-muted-foreground uppercase">
							{attempt.topicTitle}
						</span>
						<span
							className={
								attempt.passed
									? 'rounded-full border border-green-500/35 bg-green-50 px-2.5 py-0.5 text-xs text-green-700'
									: 'rounded-full border border-red-500/35 bg-red-50 px-2.5 py-0.5 text-xs text-red-700'
							}
						>
							{attempt.passed ? 'Пройден' : 'Не пройден'}
						</span>
					</div>
					<h2 className="mt-1 line-clamp-2 font-serif text-xl leading-tight mob:text-2xl tab-sm:truncate">
						{attempt.testTitle}
					</h2>
					<p className="mt-1 truncate text-sm text-muted-foreground">{attempt.studentName}</p>
				</div>

				<p className="text-sm text-muted-foreground tab-sm:text-right">{formatDate(attempt.submittedAt)}</p>

				<div className="flex items-center gap-2 tab-sm:justify-end">
					<ResultIcon className={attempt.passed ? 'size-4 text-green-600' : 'size-4 text-red-600'} />
					<div className="tab-sm:text-right">
						<p className="font-serif text-2xl leading-none">{Math.round(attempt.scorePercentage)}%</p>
						<p className="mt-1 text-xs text-muted-foreground">
							{attempt.earnedPoints}/{attempt.totalPoints}
						</p>
					</div>
				</div>

				<ArrowRight className="hidden size-5 shrink-0 text-primary tab-sm:block" />
			</div>
		</Link>
	)
}

export function AdminAttemptsClient({ initial, initialKey }: { initial: AdminAttemptsResponse; initialKey: string }) {
	const { can } = useAuth()
	const zoneAll = can('zone', 'all')
	const titleRef = useRef<HTMLHeadingElement>(null)
	const [query, setQuery] = useState('')
	const [debouncedQuery, setDebouncedQuery] = useState('')
	const [topicSlug, setTopicSlug] = useState('all')
	const [studentId, setStudentId] = useState('all')
	const [statusFilter, setStatusFilter] = useState<UserStatus>('active')
	const [dateRange, setDateRange] = useState<DateRange | undefined>()
	const [calendarOpen, setCalendarOpen] = useState(false)
	const [more, setMore] = useState<MorePages | null>(null)
	const [loadingMoreKey, setLoadingMoreKey] = useState<string | null>(null)
	const pushQuery = useDebounce((value: string) => setDebouncedQuery(value), SEARCH_DEBOUNCE_MS)

	const filters = useMemo<AttemptsFilters>(
		() => ({
			q: debouncedQuery,
			topic: topicSlug === 'all' ? null : topicSlug,
			student: studentId === 'all' ? null : studentId,
			...attemptsDayRange(dateRange),
			status: statusFilter,
		}),
		[dateRange, debouncedQuery, statusFilter, studentId, topicSlug]
	)
	const key = adminTestsKeys.attempts(filters)
	const keyRef = useRef(key)
	useEffect(() => {
		keyRef.current = key
	}, [key])

	const { data, error, mutate } = useSWR(key, adminAttemptsFetcher, {
		fallbackData: key === initialKey ? initial : undefined,
		revalidateOnMount: false,
		revalidateOnFocus: false,
		revalidateOnReconnect: false,
	})

	const extraPages = more && more.key === key ? more.pages : []
	const merged = data ? mergeAttemptPages([data, ...extraPages]) : null
	const loadFailed = error !== undefined && data === undefined
	const facets = data?.facets ?? initial.facets
	const scopeTotal = data?.scopeTotal ?? initial.scopeTotal
	const students = useMemo(
		() => facets.students.filter((student) => matchesUserStatus(student.isActive, statusFilter)),
		[facets.students, statusFilter]
	)
	const loadingMore = loadingMoreKey === key

	const hasFilters = Boolean(
		query || dateRange?.from || studentId !== 'all' || topicSlug !== 'all' || statusFilter !== 'active'
	)
	const averageScore = data ? `${Math.round(data.summary.averageScore)}%` : '—'
	const shown = merged
		? merged.rows.length < merged.total
			? `${merged.rows.length} из ${merged.total}`
			: merged.rows.length
		: '—'

	const handleDateRangeSelect = (range: DateRange | undefined) => {
		setDateRange(range)
		if (range?.from && range.to) setCalendarOpen(false)
	}

	const handleQueryChange = (value: string) => {
		setQuery(value)
		pushQuery(value)
	}

	const resetFilters = () => {
		pushQuery.cancel()
		setQuery('')
		setDebouncedQuery('')
		setTopicSlug('all')
		setStudentId('all')
		setStatusFilter('active')
		setDateRange(undefined)
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

	return (
		<main className="space-y-4">
			<section className="rounded-4xl border border-border/80 bg-card/90 p-unit-mob tab-sm:p-unit">
				<div className="grid gap-6 tab:grid-cols-[1fr_13.75rem]">
					<div>
						<p className="font-mono text-[0.6875rem] tracking-[0.22em] text-muted-foreground uppercase">
							администрирование
						</p>
						<h1
							ref={titleRef}
							tabIndex={-1}
							className="mt-2 max-w-3xl font-serif text-3xl leading-none text-foreground outline-none mob:text-4xl tab-sm:text-5xl"
						>
							Попытки студентов
						</h1>
						<p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
							Компактный журнал прохождений с фильтрами по теме, студенту, дате и быстрым поиском.
						</p>
					</div>

					<div className="rounded-3xl border border-border/70 bg-secondary/55 p-4">
						<CheckCircle2 className="size-6 text-primary" />
						<p className="mt-5 font-serif text-4xl leading-none">{averageScore}</p>
						<p className="mt-2 text-sm text-muted-foreground">средний результат</p>
					</div>
				</div>

				<div className="mt-6 grid gap-3 tab-sm:grid-cols-4">
					<StatTile label="всего в базе" value={scopeTotal} icon={FileText} />
					<StatTile label="показано" value={shown} icon={Clock3} />
					<StatTile label="пройдено" value={data ? data.summary.passed : '—'} icon={CheckCircle2} />
					<StatTile label="тем" value={facets.topics.length} icon={FileText} />
				</div>
			</section>

			<section className="rounded-4xl border border-border/80 bg-card/90 p-3 tab-sm:p-4">
				<div className="mb-3 max-w-xs">
					<UserStatusFilter
						value={statusFilter}
						onChange={(status) => {
							setStatusFilter(status)
							setStudentId('all')
						}}
					/>
				</div>
				<div className="grid gap-3 tab:grid-cols-[minmax(13.75rem,1fr)_13.125rem_13.125rem_13.125rem_auto]">
					<label className="relative block">
						<Search className="pointer-events-none absolute top-3 left-3 size-4 text-muted-foreground" />
						<Input
							type="search"
							value={query}
							onChange={(event) => handleQueryChange(event.target.value)}
							placeholder="Поиск по студенту, тесту, теме"
							className="h-10 rounded-full border-border/70 bg-secondary/40 pr-4 pl-9 text-sm transition-colors placeholder:text-muted-foreground hover:border-primary/35 hover:bg-secondary/60 focus-visible:border-primary"
						/>
					</label>

					<Select value={topicSlug} onValueChange={setTopicSlug}>
						<SelectTrigger className="h-10 rounded-full border-border/70 bg-secondary/40 px-4 transition-colors hover:border-primary/35 hover:bg-secondary/60 focus-visible:border-primary">
							<SelectValue placeholder="Все темы" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">Все темы</SelectItem>
							{facets.topics.map((topic) => (
								<SelectItem key={topic.slug} value={topic.slug}>
									{topic.title}
								</SelectItem>
							))}
						</SelectContent>
					</Select>

					<Select value={studentId} onValueChange={setStudentId}>
						<SelectTrigger className="h-10 rounded-full border-border/70 bg-secondary/40 px-4 transition-colors hover:border-primary/35 hover:bg-secondary/60 focus-visible:border-primary">
							<SelectValue placeholder="Все студенты" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">Все студенты</SelectItem>
							{students.map((student) => (
								<SelectItem key={student.id} value={student.id}>
									{student.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>

					<Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
						<PopoverTrigger asChild>
							<button
								type="button"
								className="flex h-10 w-full items-center justify-start rounded-full border border-border/70 bg-secondary/40 px-4 text-left text-sm transition-colors hover:border-primary/35 hover:bg-secondary/60 focus-visible:border-primary focus-visible:outline-none"
							>
								<CalendarIcon className="mr-2 size-4 text-muted-foreground" />
								<span className="truncate">{formatDateRange(dateRange)}</span>
							</button>
						</PopoverTrigger>
						<PopoverContent className="w-auto p-0" align="start">
							<Calendar
								mode="range"
								selected={dateRange}
								onSelect={handleDateRangeSelect}
								locale={ru}
								numberOfMonths={1}
							/>
						</PopoverContent>
					</Popover>

					<button
						type="button"
						onClick={resetFilters}
						disabled={!hasFilters}
						className="h-10 rounded-full border border-border/70 bg-card px-4 text-sm transition-colors hover:border-primary/35 hover:bg-secondary/60 focus-visible:border-primary focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
					>
						Сбросить
					</button>
				</div>
			</section>

			{loadFailed ? (
				<LoadErrorAlert title={ATTEMPTS_LOAD_ERROR} error={error} onRetry={() => mutate()} focusTarget={titleRef} />
			) : !merged ? (
				<section
					role="status"
					className="rounded-4xl border border-border/80 bg-card/90 p-unit-mob text-sm text-muted-foreground tab-sm:p-unit"
				>
					Загрузка...
				</section>
			) : merged.rows.length === 0 ? (
				<AttemptsEmptyState filtered={hasFilters} zoneAll={zoneAll} />
			) : (
				<section className="space-y-2">
					{merged.rows.map((attempt) => (
						<AttemptRow key={attempt.attemptId} attempt={attempt} />
					))}
					{merged.hasMore ? (
						<div className="flex justify-center pt-2">
							<button
								type="button"
								onClick={() => void loadMore()}
								disabled={loadingMore}
								aria-busy={loadingMore || undefined}
								className="inline-flex h-10 items-center gap-2 rounded-full border border-border/70 bg-card px-5 text-sm transition-colors hover:border-primary/35 hover:bg-secondary/60 focus-visible:border-primary focus-visible:outline-none disabled:pointer-events-none disabled:opacity-70"
							>
								{loadingMore ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
								Показать ещё
							</button>
						</div>
					) : null}
				</section>
			)}
		</main>
	)
}

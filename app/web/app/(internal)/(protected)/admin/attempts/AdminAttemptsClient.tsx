'use client'

import { useMemo, useState } from 'react'
import type { DateRange } from 'react-day-picker'

import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { ArrowRight, CalendarIcon, CheckCircle2, Clock3, FileText, Search, XCircle } from 'lucide-react'
import Link from 'next/link'

import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

import type { AdminAttemptListItem } from './attempts-types'

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

function normalizeSearch(value: string) {
	return value.trim().toLowerCase()
}

function toStartOfDay(date: Date) {
	const value = new Date(date)
	value.setHours(0, 0, 0, 0)
	return value
}

function toEndOfDay(date: Date) {
	const value = new Date(date)
	value.setHours(23, 59, 59, 999)
	return value
}

function isDateInRange(value: string, range: DateRange) {
	if (!range.from) return true
	const submittedAt = new Date(value)
	const from = toStartOfDay(range.from)
	const to = toEndOfDay(range.to ?? range.from)
	return submittedAt >= from && submittedAt <= to
}

function formatDateRange(range: DateRange | undefined) {
	if (!range?.from) return 'Любой период'
	if (!range.to) return `${format(range.from, 'dd.MM.yy', { locale: ru })} — ...`
	return `${format(range.from, 'dd.MM.yy', { locale: ru })} — ${format(range.to, 'dd.MM.yy', { locale: ru })}`
}

function StatTile({ label, value, icon: Icon }: { label: string; value: string | number; icon: typeof FileText }) {
	return (
		<div className="border-border/70 bg-secondary/65 rounded-3xl border p-4">
			<Icon className="text-primary mb-4 size-5" />
			<p className="font-serif text-3xl leading-none">{value}</p>
			<p className="text-muted-foreground mt-2 text-sm">{label}</p>
		</div>
	)
}

function AttemptsEmptyState({ filtered }: { filtered: boolean }) {
	return (
		<section className="rounded-4xl border-border/80 bg-card/90 p-unit-mob tab-sm:p-unit border">
			<FileText className="text-primary size-7" />
			<h2 className="mt-5 font-serif text-3xl">{filtered ? 'Ничего не найдено' : 'Попыток пока нет'}</h2>
			<p className="text-muted-foreground mt-3 max-w-2xl text-sm leading-6">
				{filtered
					? 'Измените поиск, тему, студента или дату, чтобы расширить выборку.'
					: 'Когда студенты начнут проходить тесты, здесь появится журнал результатов.'}
			</p>
		</section>
	)
}

function AttemptRow({ attempt }: { attempt: AdminAttemptListItem }) {
	const ResultIcon = attempt.passed ? CheckCircle2 : XCircle

	return (
		<Link
			href={`/admin/attempts/${attempt.attemptId}`}
			className="border-border/80 bg-card/90 hover:border-primary/45 hover:bg-secondary/45 focus-visible:border-primary block rounded-3xl border px-4 py-3 outline-none transition-colors"
		>
			<div className="tab-sm:grid-cols-[minmax(0,1fr)_10.625rem_7.1875rem_1.5rem] tab-sm:items-center grid gap-3">
				<div className="min-w-0">
					<div className="flex flex-wrap items-center gap-2">
						<span className="text-muted-foreground font-mono text-[0.625rem] uppercase tracking-[0.18em]">
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
					<h2 className="mob:text-2xl tab-sm:truncate mt-1 line-clamp-2 font-serif text-xl leading-tight">
						{attempt.testTitle}
					</h2>
					<p className="text-muted-foreground mt-1 truncate text-sm">{attempt.studentName}</p>
				</div>

				<p className="text-muted-foreground tab-sm:text-right text-sm">{formatDate(attempt.submittedAt)}</p>

				<div className="tab-sm:justify-end flex items-center gap-2">
					<ResultIcon className={attempt.passed ? 'size-4 text-green-600' : 'size-4 text-red-600'} />
					<div className="tab-sm:text-right">
						<p className="font-serif text-2xl leading-none">{Math.round(attempt.scorePercentage)}%</p>
						<p className="text-muted-foreground mt-1 text-xs">
							{attempt.earnedPoints}/{attempt.totalPoints}
						</p>
					</div>
				</div>

				<ArrowRight className="text-primary tab-sm:block hidden size-5 shrink-0" />
			</div>
		</Link>
	)
}

export function AdminAttemptsClient({ rows, total }: { rows: AdminAttemptListItem[]; total: number }) {
	const [query, setQuery] = useState('')
	const [topicSlug, setTopicSlug] = useState('all')
	const [studentId, setStudentId] = useState('all')
	const [dateRange, setDateRange] = useState<DateRange | undefined>()
	const [calendarOpen, setCalendarOpen] = useState(false)

	const topics = useMemo(() => {
		const map = new Map<string, string>()
		rows.forEach((attempt) => map.set(attempt.topicSlug, attempt.topicTitle))
		return Array.from(map.entries()).map(([slug, title]) => ({ slug, title }))
	}, [rows])

	const students = useMemo(() => {
		const map = new Map<string, string>()
		rows.forEach((attempt) => map.set(attempt.studentId, attempt.studentName))
		return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
	}, [rows])

	const filteredRows = useMemo(() => {
		const search = normalizeSearch(query)

		return rows.filter((attempt) => {
			if (topicSlug !== 'all' && attempt.topicSlug !== topicSlug) return false
			if (studentId !== 'all' && attempt.studentId !== studentId) return false
			if (dateRange && !isDateInRange(attempt.submittedAt, dateRange)) return false

			if (!search) return true
			const haystack = normalizeSearch(
				`${attempt.studentName} ${attempt.testTitle} ${attempt.topicTitle} ${attempt.scorePercentage} ${attempt.earnedPoints}`
			)
			return haystack.includes(search)
		})
	}, [dateRange, query, rows, studentId, topicSlug])

	const passedCount = filteredRows.filter((attempt) => attempt.passed).length
	const averageScore =
		filteredRows.length > 0
			? Math.round(
					filteredRows.reduce((sum, attempt) => sum + Number(attempt.scorePercentage ?? 0), 0) / filteredRows.length
				)
			: 0
	const hasFilters = Boolean(query || dateRange?.from || studentId !== 'all' || topicSlug !== 'all')

	const handleDateRangeSelect = (range: DateRange | undefined) => {
		setDateRange(range)
		if (range?.from && range.to) setCalendarOpen(false)
	}

	return (
		<main className="space-y-4">
			<section className="rounded-4xl border-border/80 bg-card/90 p-unit-mob tab-sm:p-unit border">
				<div className="tab:grid-cols-[1fr_13.75rem] grid gap-6">
					<div>
						<p className="text-muted-foreground font-mono text-[0.6875rem] uppercase tracking-[0.22em]">
							администрирование
						</p>
						<h1 className="text-foreground tab-sm:text-5xl mob:text-4xl mt-2 max-w-3xl font-serif text-3xl leading-none">
							Попытки студентов
						</h1>
						<p className="text-muted-foreground mt-4 max-w-2xl text-sm leading-6">
							Компактный журнал прохождений с фильтрами по теме, студенту, дате и быстрым поиском.
						</p>
					</div>

					<div className="border-border/70 bg-secondary/55 rounded-3xl border p-4">
						<CheckCircle2 className="text-primary size-6" />
						<p className="mt-5 font-serif text-4xl leading-none">{averageScore}%</p>
						<p className="text-muted-foreground mt-2 text-sm">средний результат</p>
					</div>
				</div>

				<div className="tab-sm:grid-cols-4 mt-6 grid gap-3">
					<StatTile label="всего в базе" value={total} icon={FileText} />
					<StatTile label="показано" value={filteredRows.length} icon={Clock3} />
					<StatTile label="пройдено" value={passedCount} icon={CheckCircle2} />
					<StatTile label="тем" value={topics.length} icon={FileText} />
				</div>
			</section>

			<section className="rounded-4xl border-border/80 bg-card/90 tab-sm:p-4 border p-3">
				<div className="tab:grid-cols-[minmax(13.75rem,1fr)_13.125rem_13.125rem_13.125rem_auto] grid gap-3">
					<label className="relative block">
						<Search className="text-muted-foreground pointer-events-none absolute left-3 top-3 size-4" />
						<Input
							type="search"
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							placeholder="Поиск по студенту, тесту, теме"
							className="border-border/70 bg-secondary/40 placeholder:text-muted-foreground hover:border-primary/35 hover:bg-secondary/60 focus-visible:border-primary h-10 rounded-full pl-9 pr-4 text-sm transition-colors"
						/>
					</label>

					<Select value={topicSlug} onValueChange={setTopicSlug}>
						<SelectTrigger className="border-border/70 bg-secondary/40 hover:border-primary/35 hover:bg-secondary/60 focus-visible:border-primary h-10 rounded-full px-4 transition-colors">
							<SelectValue placeholder="Все темы" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">Все темы</SelectItem>
							{topics.map((topic) => (
								<SelectItem key={topic.slug} value={topic.slug}>
									{topic.title}
								</SelectItem>
							))}
						</SelectContent>
					</Select>

					<Select value={studentId} onValueChange={setStudentId}>
						<SelectTrigger className="border-border/70 bg-secondary/40 hover:border-primary/35 hover:bg-secondary/60 focus-visible:border-primary h-10 rounded-full px-4 transition-colors">
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
								className="border-border/70 bg-secondary/40 hover:border-primary/35 hover:bg-secondary/60 focus-visible:border-primary flex h-10 w-full items-center justify-start rounded-full border px-4 text-left text-sm transition-colors focus-visible:outline-none"
							>
								<CalendarIcon className="text-muted-foreground mr-2 size-4" />
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
						onClick={() => {
							setQuery('')
							setTopicSlug('all')
							setStudentId('all')
							setDateRange(undefined)
						}}
						disabled={!hasFilters}
						className="border-border/70 bg-card hover:border-primary/35 hover:bg-secondary/60 focus-visible:border-primary h-10 rounded-full border px-4 text-sm transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
					>
						Сбросить
					</button>
				</div>
			</section>

			{filteredRows.length === 0 ? (
				<AttemptsEmptyState filtered={hasFilters} />
			) : (
				<section className="space-y-2">
					{filteredRows.map((attempt) => (
						<AttemptRow key={attempt.attemptId} attempt={attempt} />
					))}
				</section>
			)}
		</main>
	)
}

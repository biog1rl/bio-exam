'use client'

import { useMemo, useState, type ReactNode } from 'react'
import type { DateRange } from 'react-day-picker'

import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { CalendarIcon, Check, ChevronDown, Loader2, Pencil, Search, Trash2, UserPlus, X } from 'lucide-react'
import Link from 'next/link'
import { useQueryState } from 'nuqs'
import { toast } from 'sonner'
import useSWR from 'swr'

import { AttemptBarChart } from '@/components/progress/AttemptBarChart'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { EditUserDialog } from '@/components/users/dialogs/EditUserDialog'
import { apiFetch } from '@/lib/api-fetch'
import {
	assignTopicColors,
	DEFAULT_PERIOD,
	filterAttemptsByPeriod,
	parseDateParam,
	parseDayParam,
	parsePeriod,
	PERIOD_PRESETS,
	resolvePeriodBounds,
	type ProgressAttempt,
} from '@/lib/progress/attempt-chart'
import type { UserRow } from '@/types/users'

const fetcher = async (url: string) => {
	const response = await apiFetch(url)
	if (!response.ok) throw new Error('Не удалось загрузить данные')
	return response.json()
}

type TestAssignment = {
	testId: string
	testTitle: string
	testSlug: string
	assignedAt: string
}

type TestItem = {
	id: string
	title: string
	topicTitle: string | null
}

type Props = {
	login: string
}

function ProfileSectionCard({
	kicker,
	title,
	children,
	loading,
	error,
}: {
	kicker: string
	title: string
	children: ReactNode
	loading?: boolean
	error?: boolean
}) {
	return (
		<Card className="rounded-4xl border-border/80 bg-card/90">
			<CardHeader>
				<p className="font-mono text-[0.6875rem] tracking-[0.22em] text-muted-foreground uppercase">{kicker}</p>
				<CardTitle className="font-serif text-2xl leading-tight">{title}</CardTitle>
			</CardHeader>
			<CardContent>
				{loading ? (
					<p role="status">Загрузка...</p>
				) : error ? (
					<p role="alert">Не удалось загрузить данные</p>
				) : (
					children
				)}
			</CardContent>
		</Card>
	)
}

function EmptyProfileState({ children }: { children: ReactNode }) {
	return <div className="rounded-3xl bg-secondary/70 p-unit text-sm text-muted-foreground">{children}</div>
}

export default function UserProfileAssignmentsPage({ login }: Props) {
	const normalizedLogin = login.trim().toLowerCase()

	const {
		data: usersData,
		isLoading: usersLoading,
		error: usersError,
		mutate: mutateUsers,
	} = useSWR<{ rows: UserRow[]; total: number }>('/api/users', fetcher)

	const user = useMemo(
		() =>
			usersData?.rows?.find((u) => typeof u.login === 'string' && u.login.toLowerCase() === normalizedLogin) ?? null,
		[usersData, normalizedLogin]
	)

	const userId = user?.id ?? null

	const {
		data: assignmentsData,
		isLoading: assignmentsLoading,
		error: assignmentsError,
		mutate: mutateAssignments,
	} = useSWR<{ assignments: TestAssignment[] }>(userId ? `/api/users/${userId}/test-assignments` : null, fetcher)
	const {
		data: attemptsData,
		isLoading: attemptsLoading,
		error: attemptsError,
	} = useSWR<{ attempts: ProgressAttempt[] }>(userId ? `/api/users/${userId}/test-attempts` : null, fetcher)

	const {
		data: testsData,
		isLoading: testsLoading,
		error: testsError,
	} = useSWR<{ tests: TestItem[] }>('/api/tests', fetcher)

	const [editOpen, setEditOpen] = useState(false)
	const [assigningTestId, setAssigningTestId] = useState<string | null>(null)
	const [removingTestId, setRemovingTestId] = useState<string | null>(null)
	const [search, setSearch] = useQueryState('q', { defaultValue: '' })
	const [topicFilter, setTopicFilter] = useQueryState('topic', { defaultValue: 'all' })
	const [testsParam, setTestsParam] = useQueryState('tests', { defaultValue: '' })
	const [visibleCount, setVisibleCount] = useState(5)

	// Date range filter state
	const [range, setRange] = useQueryState('range', { defaultValue: DEFAULT_PERIOD })
	const [customFrom, setCustomFrom] = useQueryState('from', { defaultValue: '' })
	const [customTo, setCustomTo] = useQueryState('to', { defaultValue: '' })
	const [calendarOpen, setCalendarOpen] = useState(false)
	const [calendarRange, setCalendarRange] = useState<DateRange>({ from: undefined, to: undefined })

	// Single day state
	const [selectedDay, setSelectedDay] = useQueryState('day', { defaultValue: '' })
	const [dayCalendarOpen, setDayCalendarOpen] = useState(false)

	const selectedTestIds = useMemo(() => new Set(testsParam ? testsParam.split(',').filter(Boolean) : []), [testsParam])

	const assignments = useMemo(() => assignmentsData?.assignments ?? [], [assignmentsData])
	const attempts = useMemo(() => attemptsData?.attempts ?? [], [attemptsData])
	const assignedTestIds = useMemo(() => new Set(assignments.map((a) => a.testId)), [assignments])

	const topicColors = useMemo(
		() => assignTopicColors(attempts.filter((a) => assignedTestIds.has(a.testId))),
		[attempts, assignedTestIds]
	)

	const topicColorBySlug = useMemo(() => new Map(topicColors.map((t) => [t.slug, t.color])), [topicColors])

	const topicOptions = useMemo(() => {
		const seen = new Map<string, string>()
		for (const a of attempts) {
			if (assignedTestIds.has(a.testId)) seen.set(a.topicSlug, a.topicTitle ?? a.topicSlug)
		}
		return Array.from(seen.entries()).map(([slug, title]) => ({ slug, title }))
	}, [attempts, assignedTestIds])

	const testOptions = useMemo(() => {
		const seen = new Map<string, { id: string; title: string; topicSlug: string }>()
		for (const a of attempts) {
			if (!assignedTestIds.has(a.testId)) continue
			if (topicFilter !== 'all' && a.topicSlug !== topicFilter) continue
			seen.set(a.testId, { id: a.testId, title: a.testTitle, topicSlug: a.topicSlug })
		}
		return Array.from(seen.values())
	}, [attempts, assignedTestIds, topicFilter])

	// Active tests for chart/filter: selected ones, or all in topic if none selected
	const activeTestIds = useMemo(
		() => (selectedTestIds.size > 0 ? selectedTestIds : new Set(testOptions.map((t) => t.id))),
		[selectedTestIds, testOptions]
	)

	const filteredAttempts = useMemo(() => {
		const q = search.toLowerCase()
		return attempts.filter(
			(a) =>
				(topicFilter === 'all' || a.topicSlug === topicFilter) &&
				activeTestIds.has(a.testId) &&
				(!q || a.testTitle.toLowerCase().includes(q))
		)
	}, [attempts, search, topicFilter, activeTestIds])

	const [now] = useState(() => new Date())
	const period = parsePeriod(range)
	const dayDate = useMemo(() => parseDayParam(selectedDay), [selectedDay])
	const fromDate = useMemo(() => parseDateParam(customFrom), [customFrom])
	const toDate = useMemo(() => parseDateParam(customTo), [customTo])

	const periodAttempts = useMemo(
		() =>
			filterAttemptsByPeriod(
				filteredAttempts,
				resolvePeriodBounds({ period, from: customFrom, to: customTo, day: selectedDay }, now)
			),
		[filteredAttempts, period, customFrom, customTo, selectedDay, now]
	)

	const visibleAttempts = useMemo(() => filteredAttempts.slice(0, visibleCount), [filteredAttempts, visibleCount])

	const availableTests = useMemo(
		() => (testsData?.tests ?? []).filter((t) => !assignedTestIds.has(t.id)),
		[testsData, assignedTestIds]
	)

	const handleAssign = async (testId: string) => {
		if (!userId || assigningTestId) return
		setAssigningTestId(testId)
		try {
			const res = await apiFetch(`/api/users/${userId}/test-assignments`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ testId }),
			})
			if (!res.ok) {
				const data = (await res.json().catch(() => null)) as { error?: string } | null
				throw new Error(data?.error || 'Ошибка назначения теста')
			}
			await mutateAssignments()
			toast.success('Тест назначен')
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Ошибка назначения теста')
		} finally {
			setAssigningTestId(null)
		}
	}

	const handleRemove = async (testId: string) => {
		if (!userId || removingTestId) return
		setRemovingTestId(testId)
		try {
			const res = await apiFetch(`/api/users/${userId}/test-assignments/${testId}`, {
				method: 'DELETE',
			})
			if (!res.ok) {
				const data = (await res.json().catch(() => null)) as { error?: string } | null
				throw new Error(data?.error || 'Ошибка удаления назначения')
			}
			await mutateAssignments()
			toast.success('Назначение удалено')
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Ошибка удаления назначения')
		} finally {
			setRemovingTestId(null)
		}
	}

	const toggleTest = (testId: string) => {
		const next = new Set(selectedTestIds)
		if (next.has(testId)) next.delete(testId)
		else next.add(testId)
		void setTestsParam(next.size > 0 ? Array.from(next).join(',') : null)
		setVisibleCount(5)
	}

	const handlePresetChange = (value: string) => {
		if (!value) return
		void setRange(value === DEFAULT_PERIOD ? null : value)
		void setCustomFrom('')
		void setCustomTo('')
		void setSelectedDay(null)
	}

	const handleCalendarSelect = (selected: DateRange | undefined) => {
		if (!selected) return
		setCalendarRange(selected)
		if (selected.from && selected.to) {
			void setCustomFrom(selected.from.toISOString())
			void setCustomTo(selected.to.toISOString())
			void setSelectedDay(null)
			setCalendarOpen(false)
		}
	}

	const handleDaySelect = (date: Date | undefined) => {
		if (!date) return
		void setSelectedDay(format(date, 'yyyy-MM-dd'))
		setDayCalendarOpen(false)
	}

	const clearDay = () => {
		void setSelectedDay(null)
	}

	if (usersLoading) {
		return (
			<div className="rounded-4xl border border-border/80 bg-card/90 p-12">
				<Loader2 className="h-8 w-8 animate-spin" />
			</div>
		)
	}

	if (usersError) return <p role="alert">Не удалось загрузить пользователя</p>

	if (!user) {
		return (
			<div className="rounded-4xl border border-border/80 bg-card/90 p-8 text-center text-muted-foreground">
				Пользователь не найден
			</div>
		)
	}

	const displayName = user.name || [user.firstName, user.lastName].filter(Boolean).join(' ') || user.login

	const testPickerLabel =
		selectedTestIds.size === 0
			? 'Все тесты'
			: selectedTestIds.size === 1
				? (testOptions.find((t) => selectedTestIds.has(t.id))?.title ?? '1 тест')
				: `${selectedTestIds.size} теста выбрано`

	const presetValue = !dayDate && PERIOD_PRESETS.some((preset) => preset.value === period) ? period : ''

	return (
		<div className="space-y-6">
			<section className="rounded-4xl border border-border/80 bg-card/90 p-unit-mob tab-sm:p-unit">
				<div className="flex items-start justify-between gap-4">
					<div>
						<p className="font-mono text-[0.6875rem] tracking-[0.22em] text-muted-foreground uppercase">
							профиль ученика
						</p>
						<div className="mt-2 flex flex-wrap items-center gap-2">
							<h1 className="font-serif text-4xl leading-none text-foreground tab-sm:text-5xl">{displayName}</h1>
							{user.groupName && (
								<Badge variant="secondary" className="rounded-full">
									{user.groupName}
								</Badge>
							)}
						</div>
						<p className="mt-4 font-mono text-xs tracking-[0.18em] text-muted-foreground uppercase">{user.login}</p>
					</div>
					<Button
						variant="outline"
						size="icon"
						onClick={() => setEditOpen(true)}
						className="rounded-2xl border-border/80 transition-colors hover:border-primary hover:bg-secondary/70"
					>
						<Pencil className="h-4 w-4" />
					</Button>
				</div>
			</section>

			<ProfileSectionCard
				kicker="динамика"
				title="Пройденные тесты"
				loading={attemptsLoading || assignmentsLoading}
				error={Boolean(attemptsError || assignmentsError)}
			>
				<div className="space-y-4">
					{/* Filters */}
					{attempts.length > 0 && (
						<div className="flex flex-wrap gap-2">
							<div className="relative min-w-45 flex-1">
								<Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
								<Input
									placeholder="Поиск по тесту..."
									value={search}
									onChange={(e) => {
										void setSearch(e.target.value)
										setVisibleCount(5)
									}}
									className="h-8 pl-8 text-sm"
								/>
							</div>

							{/* Topic select */}
							<Select
								value={topicFilter}
								onValueChange={(v) => {
									void setTopicFilter(v)
									void setTestsParam(null)
									setVisibleCount(5)
								}}
							>
								<SelectTrigger className="h-8 w-45 text-sm">
									<SelectValue placeholder="Все темы" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">Все темы</SelectItem>
									{topicOptions.map((t) => (
										<SelectItem key={t.slug} value={t.slug}>
											{t.title}
										</SelectItem>
									))}
								</SelectContent>
							</Select>

							{/* Multi-select tests */}
							{testOptions.length > 0 && (
								<Popover>
									<PopoverTrigger asChild>
										<Button variant="outline" size="sm" className="h-8 gap-1.5 text-sm font-normal">
											{testPickerLabel}
											<ChevronDown className="h-3.5 w-3.5 opacity-60" />
										</Button>
									</PopoverTrigger>
									<PopoverContent className="w-64 p-2" align="start">
										<div className="max-h-60 space-y-1 overflow-y-auto">
											{/* "All" option */}
											<button
												className="flex w-full items-center gap-2 rounded-2xl px-2 py-1.5 text-left text-sm transition-colors hover:bg-secondary/70"
												onClick={() => {
													void setTestsParam(null)
													setVisibleCount(5)
												}}
											>
												<div className="flex h-4 w-4 items-center justify-center">
													{selectedTestIds.size === 0 && <Check className="h-3.5 w-3.5" />}
												</div>
												Все тесты
											</button>
											{testOptions.map((t) => (
												<label
													key={t.id}
													className="flex cursor-pointer items-center gap-2 rounded-2xl px-2 py-1.5 text-sm transition-colors hover:bg-secondary/70"
												>
													<Checkbox checked={selectedTestIds.has(t.id)} onCheckedChange={() => toggleTest(t.id)} />
													<span
														className="mr-1 inline-block h-2 w-2 shrink-0 rounded-full"
														style={{ background: topicColorBySlug.get(t.topicSlug) }}
													/>
													<span className="line-clamp-2">{t.title}</span>
												</label>
											))}
										</div>
									</PopoverContent>
								</Popover>
							)}
						</div>
					)}

					{/* Date range controls */}
					{attempts.length > 0 && (
						<div className="flex flex-wrap items-center gap-2">
							<ToggleGroup
								type="single"
								aria-label="Период"
								className="flex-wrap justify-start"
								value={presetValue}
								onValueChange={handlePresetChange}
							>
								{PERIOD_PRESETS.map((preset) => (
									<ToggleGroupItem key={preset.value} value={preset.value} className="h-8 text-xs">
										{preset.label}
									</ToggleGroupItem>
								))}
							</ToggleGroup>

							{/* Custom date range */}
							<Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
								<PopoverTrigger asChild>
									<Button
										variant={period === 'custom' && !dayDate ? 'default' : 'outline'}
										size="sm"
										className="h-8 text-xs"
										onClick={() => void setRange('custom')}
									>
										{period === 'custom' && fromDate && toDate
											? `${format(fromDate, 'dd.MM.yy', { locale: ru })} — ${format(toDate, 'dd.MM.yy', { locale: ru })}`
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

							<div className="h-5 w-px bg-border" />

							{/* Single day picker */}
							<Popover open={dayCalendarOpen} onOpenChange={setDayCalendarOpen}>
								<PopoverTrigger asChild>
									<Button variant={dayDate ? 'default' : 'outline'} size="sm" className="h-8 gap-1.5 text-xs">
										<CalendarIcon className="h-3.5 w-3.5" />
										{dayDate ? format(dayDate, 'd MMMM yyyy', { locale: ru }) : 'Один день'}
									</Button>
								</PopoverTrigger>
								<PopoverContent className="w-auto p-0" align="start">
									<Calendar
										mode="single"
										selected={dayDate ?? undefined}
										onSelect={handleDaySelect}
										locale={ru}
										captionLayout="dropdown"
										fromYear={2020}
										toYear={2030}
									/>
								</PopoverContent>
							</Popover>

							{selectedDay && (
								<Button variant="ghost" size="sm" className="h-8 px-2" onClick={clearDay}>
									<X className="h-3.5 w-3.5" />
								</Button>
							)}
						</div>
					)}

					{!dayDate && periodAttempts.length > 0 && (
						<AttemptBarChart attempts={periodAttempts} colors={topicColors} mode="range" />
					)}

					{!dayDate && periodAttempts.length === 0 && filteredAttempts.length > 0 && (
						<div className="flex h-32 items-center justify-center rounded-3xl border border-border/80 bg-secondary/60 text-sm text-muted-foreground">
							Нет данных за выбранный период
						</div>
					)}

					{dayDate && (
						<div className="space-y-2">
							<p className="text-xs text-muted-foreground">
								Попытки за {format(dayDate, 'd MMMM yyyy', { locale: ru })}
							</p>
							{periodAttempts.length === 0 ? (
								<div className="flex h-32 items-center justify-center rounded-3xl border border-border/80 bg-secondary/60 text-sm text-muted-foreground">
									Нет попыток за выбранный день
								</div>
							) : (
								<AttemptBarChart attempts={periodAttempts} colors={topicColors} mode="day" />
							)}
						</div>
					)}

					{/* List */}
					{attempts.length === 0 ? (
						<EmptyProfileState>Отправленных попыток пока нет</EmptyProfileState>
					) : filteredAttempts.length === 0 ? (
						<EmptyProfileState>Ничего не найдено</EmptyProfileState>
					) : (
						<div className="space-y-2">
							{visibleAttempts.map((attempt) => {
								const dotColor = topicColorBySlug.get(attempt.topicSlug)
								return (
									<Link
										href={`/admin/attempts/${attempt.attemptId}`}
										key={attempt.attemptId}
										className="flex items-center justify-between gap-3 rounded-3xl border border-border/70 bg-secondary/60 px-3 py-2 transition-colors hover:border-primary/70 hover:bg-secondary/70"
									>
										<div className="min-w-0 flex-1">
											<div className="flex items-center gap-1.5">
												{dotColor && (
													<span
														className="inline-block h-2 w-2 shrink-0 rounded-full"
														style={{ background: dotColor }}
													/>
												)}
												<p className="truncate text-sm font-medium">{attempt.testTitle}</p>
											</div>
											<p className="text-xs text-muted-foreground">
												{new Date(attempt.submittedAt).toLocaleString('ru-RU')} · {attempt.earnedPoints}/
												{attempt.totalPoints} · {Math.round(attempt.scorePercentage)}%
											</p>
										</div>
										<div className="flex items-center gap-2">
											<Badge variant={attempt.passed ? 'default' : 'secondary'}>
												{attempt.passed ? 'Пройден' : 'Не пройден'}
											</Badge>
										</div>
									</Link>
								)
							})}
							{visibleCount < filteredAttempts.length && (
								<Button
									variant="outline"
									size="sm"
									className="rounded-2xl"
									onClick={() => setVisibleCount((c) => c + 5)}
								>
									Загрузить ещё
								</Button>
							)}
						</div>
					)}
				</div>
			</ProfileSectionCard>

			<div className="grid gap-6 lg:grid-cols-2">
				<ProfileSectionCard
					kicker="назначения"
					title="Назначенные тесты"
					loading={assignmentsLoading}
					error={Boolean(assignmentsError)}
				>
					{assignments.length === 0 ? (
						<EmptyProfileState>Нет назначенных тестов</EmptyProfileState>
					) : (
						<div className="space-y-2">
							{assignments.map((a) => (
								<div
									key={a.testId}
									className="flex items-center justify-between gap-2 rounded-3xl border border-border/70 bg-secondary/60 px-3 py-2"
								>
									<div className="min-w-0 flex-1">
										<p className="truncate text-sm font-medium">{a.testTitle}</p>
										<p className="text-xs text-muted-foreground">
											{new Date(a.assignedAt).toLocaleDateString('ru-RU')}
										</p>
									</div>
									<Button
										size="icon"
										variant="ghost"
										className="rounded-2xl transition-colors hover:bg-secondary/70 hover:text-destructive"
										aria-label="Удалить назначение"
										onClick={() => handleRemove(a.testId)}
										disabled={removingTestId === a.testId}
									>
										{removingTestId === a.testId ? (
											<Loader2 className="h-4 w-4 animate-spin" />
										) : (
											<Trash2 className="h-4 w-4" />
										)}
									</Button>
								</div>
							))}
						</div>
					)}
				</ProfileSectionCard>

				<ProfileSectionCard
					kicker="банк тестов"
					title="Назначить тест"
					loading={testsLoading || assignmentsLoading}
					error={Boolean(testsError || assignmentsError)}
				>
					{availableTests.length === 0 ? (
						<EmptyProfileState>Все тесты уже назначены</EmptyProfileState>
					) : (
						<div className="max-h-80 space-y-2 overflow-y-auto">
							{availableTests.map((t) => (
								<div
									key={t.id}
									className="flex items-center justify-between gap-2 rounded-3xl border border-border/70 bg-secondary/60 px-3 py-2"
								>
									<div className="min-w-0 flex-1">
										<p className="truncate text-sm font-medium">{t.title}</p>
										{t.topicTitle && (
											<Badge variant="secondary" className="mt-0.5 text-xs">
												{t.topicTitle}
											</Badge>
										)}
									</div>
									<Button
										size="sm"
										variant="outline"
										className="rounded-2xl transition-colors hover:border-primary/70 hover:bg-secondary/70"
										onClick={() => handleAssign(t.id)}
										disabled={assigningTestId === t.id}
									>
										{assigningTestId === t.id ? (
											<Loader2 className="mr-1 h-3 w-3 animate-spin" />
										) : (
											<UserPlus className="mr-1 h-3 w-3" />
										)}
										Назначить
									</Button>
								</div>
							))}
						</div>
					)}
				</ProfileSectionCard>
			</div>

			<EditUserDialog open={editOpen} onOpenChange={setEditOpen} user={user} onSaved={() => void mutateUsers()} />
		</div>
	)
}

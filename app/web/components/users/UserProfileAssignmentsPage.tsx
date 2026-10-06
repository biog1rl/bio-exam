'use client'

import { useMemo, useRef, useState, type ReactNode } from 'react'
import type { DateRange } from 'react-day-picker'

import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import {
	ArrowRight,
	CalendarIcon,
	Check,
	ChevronDown,
	Loader2,
	LockKeyholeOpen,
	LogOut,
	Pencil,
	Search,
	Trash2,
	UserPlus,
	X,
} from 'lucide-react'
import Link from 'next/link'
import { useQueryState } from 'nuqs'
import { toast } from 'sonner'
import useSWR, { useSWRConfig } from 'swr'

import { LoadErrorAlert } from '@/components/feedback/LoadErrorAlert'
import { AttemptBarChart } from '@/components/progress/AttemptBarChart'
import { useAuth } from '@/components/providers/AuthProvider'
import { ReviewStatusChip } from '@/components/tests/attempt-result/ReviewStatusChip'
import { TeacherCheckedMark } from '@/components/tests/attempt-result/TeacherCheckedMark'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alert-dialog'
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
import {
	actionErrorText,
	clearConfirmText,
	clearSuccessText,
	revokeConfirmText,
	revokeSuccessText,
	sessionActionsState,
	type SessionActionKind,
} from '@/components/users/session-actions'
import { failureMessage, failureOf } from '@/lib/http/errors'
import {
	assignTopicColors,
	DEFAULT_PERIOD,
	filterAttemptsByPeriod,
	parseDateParam,
	parseDayParam,
	parsePeriod,
	PERIOD_PRESETS,
	resolvePeriodBounds,
} from '@/lib/progress/attempt-chart'
import { adminTestsKeys, adminTestsListFetcher } from '@/lib/tests/admin-api'
import { attemptResultView } from '@/lib/tests/attempt-result-view'
import { attemptsUrl } from '@/lib/tests/attempts-url'
import {
	assignTest,
	clearLoginThrottle,
	revokeUserSessions,
	unassignTest,
	userAssignmentsFetcher,
	userAttemptToProgress,
	userAttemptsFetcher,
	userByLoginFetcher,
	usersKeys,
} from '@/lib/users/api'
import { assignmentAction, assignmentErrorText, contactRows } from '@/lib/users/student-card'
import { usersUrl } from '@/lib/users/users-url'

type Props = {
	login: string
}

type LoadSource = {
	data: unknown
	error: unknown
	mutate: () => Promise<unknown>
}

function failedSources(sources: LoadSource[]): LoadSource[] {
	return sources.filter((source) => source.error && source.data === undefined)
}

function ProfileSectionCard({
	kicker,
	title,
	children,
	loading,
	sources = [],
	action,
}: {
	kicker: string
	title: string
	children: ReactNode
	loading?: boolean
	sources?: LoadSource[]
	action?: ReactNode
}) {
	const titleRef = useRef<HTMLDivElement>(null)
	const failed = failedSources(sources)

	return (
		<Card className="min-w-0 rounded-4xl border-border/80 bg-card/90">
			<CardHeader className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<p className="font-mono text-[0.6875rem] tracking-[0.22em] text-muted-foreground uppercase">{kicker}</p>
					<CardTitle ref={titleRef} tabIndex={-1} className="font-serif text-2xl leading-tight">
						{title}
					</CardTitle>
				</div>
				{action}
			</CardHeader>
			<CardContent>
				{failed.length > 0 ? (
					<LoadErrorAlert
						title="Не удалось загрузить данные"
						error={failed[0].error}
						onRetry={() => Promise.all(failed.map((source) => source.mutate()))}
						focusTarget={titleRef}
					/>
				) : loading ? (
					<p role="status">Загрузка...</p>
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

function withLoginBreak(text: string, login: string) {
	const quoted = `«${login}»`
	const index = text.indexOf(quoted)
	if (!login || index < 0) return text
	return (
		<>
			{text.slice(0, index)}
			<span className="break-all">{quoted}</span>
			{text.slice(index + quoted.length)}
		</>
	)
}

export default function UserProfileAssignmentsPage({ login }: Props) {
	const { me, can } = useAuth()
	const canEditUser = can('users', 'edit')
	const canViewUsers = can('users', 'read')
	const { mutate: mutateCache } = useSWRConfig()

	const {
		data: userData,
		isLoading: userLoading,
		error: userError,
		mutate: mutateUser,
	} = useSWR(usersKeys.byLogin(login), userByLoginFetcher)

	const user = userData ?? null
	const userId = user?.id ?? null

	const {
		data: assignmentsData,
		isLoading: assignmentsLoading,
		error: assignmentsError,
		mutate: mutateAssignments,
	} = useSWR(userId ? usersKeys.assignments(userId) : null, userAssignmentsFetcher)
	const {
		data: attemptsData,
		isLoading: attemptsLoading,
		error: attemptsError,
		mutate: mutateAttempts,
	} = useSWR(userId ? usersKeys.attempts(userId) : null, userAttemptsFetcher)

	const {
		data: testsData,
		isLoading: testsLoading,
		error: testsError,
		mutate: mutateTests,
	} = useSWR(adminTestsKeys.list(), adminTestsListFetcher)

	const assignmentsSource: LoadSource = { data: assignmentsData, error: assignmentsError, mutate: mutateAssignments }
	const attemptsSource: LoadSource = { data: attemptsData, error: attemptsError, mutate: mutateAttempts }
	const testsSource: LoadSource = { data: testsData, error: testsError, mutate: mutateTests }

	const [editOpen, setEditOpen] = useState(false)
	const [confirmAction, setConfirmAction] = useState<SessionActionKind | null>(null)
	const [pendingAction, setPendingAction] = useState<SessionActionKind | null>(null)
	const revokeButtonRef = useRef<HTMLButtonElement>(null)
	const clearButtonRef = useRef<HTMLButtonElement>(null)
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

	const chartAttempts = useMemo(
		() =>
			periodAttempts.flatMap((attempt) => {
				const progress = userAttemptToProgress(attempt)
				return progress ? [progress] : []
			}),
		[periodAttempts]
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
			const outcome = await assignTest(userId, testId)
			if (!outcome.ok) {
				const message = failureMessage(outcome, 'Ошибка назначения теста')
				if (message) toast.error(assignmentErrorText(outcome.status ?? 0, message))
				return
			}
			await mutateAssignments()
			toast.success('Тест назначен')
		} finally {
			setAssigningTestId(null)
		}
	}

	const handleRemove = async (testId: string) => {
		if (!userId || removingTestId) return
		setRemovingTestId(testId)
		try {
			const outcome = await unassignTest(userId, testId)
			if (!outcome.ok) {
				const message = failureMessage(outcome, 'Ошибка удаления назначения')
				if (message) toast.error(assignmentErrorText(outcome.status ?? 0, message))
				return
			}
			await mutateAssignments()
			toast.success('Назначение удалено')
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

	const sessionActions = sessionActionsState({
		meId: me?.id ?? null,
		user: user ? { id: user.id, login: user.login } : null,
		canEdit: canEditUser || canViewUsers,
		pending: pendingAction !== null,
	})
	const showSessionCard = sessionActions.visible && !canEditUser
	const actionPending = pendingAction !== null
	const savedLogin = user?.login ?? ''

	async function runSessionAction(kind: SessionActionKind) {
		if (!user) return
		const actionLogin = user.login ?? ''
		setPendingAction(kind)
		try {
			const outcome = kind === 'revoke' ? await revokeUserSessions(user.id) : await clearLoginThrottle(user.id)
			if (outcome.ok) {
				toast.success(kind === 'revoke' ? revokeSuccessText(actionLogin) : clearSuccessText(actionLogin))
			} else if (outcome.kind !== 'auth' && outcome.kind !== 'aborted') {
				toast.error(actionErrorText(kind, outcome.status ?? 0))
			}
		} finally {
			setPendingAction(null)
			setConfirmAction(null)
		}
	}

	function onConfirmOpenChange(next: boolean) {
		if (!next && !actionPending) setConfirmAction(null)
	}

	function returnFocus(kind: SessionActionKind) {
		return (event: Event) => {
			event.preventDefault()
			const target = kind === 'revoke' ? revokeButtonRef.current : clearButtonRef.current
			target?.focus()
		}
	}

	const userFailure = userError && userData === undefined ? failureOf(userError) : null
	const userMissing =
		userFailure !== null && userFailure.kind === 'http' && (userFailure.status === 403 || userFailure.status === 404)

	if (userFailure && !userMissing) {
		return <LoadErrorAlert title="Не удалось загрузить пользователя" error={userError} onRetry={() => mutateUser()} />
	}

	if (!userMissing && (userLoading || !user)) {
		return (
			<div
				role="status"
				aria-label="Загрузка пользователя"
				className="rounded-4xl border border-border/80 bg-card/90 p-12"
			>
				<Loader2 className="h-8 w-8 animate-spin" />
			</div>
		)
	}

	if (!user) {
		return (
			<div className="rounded-4xl border border-border/80 bg-card/90 p-8 text-center text-muted-foreground">
				Пользователь не найден
			</div>
		)
	}

	const displayName = user.name || [user.firstName, user.lastName].filter(Boolean).join(' ') || user.login
	const userGroups = user.groups ?? []
	const contacts = contactRows(user)

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
							{userGroups.map((group) => (
								<Link
									key={group.id}
									href={usersUrl(group.id)}
									title="Ученики группы"
									className="rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
								>
									<Badge variant="secondary" className="rounded-full hover:bg-secondary/70">
										{group.name}
									</Badge>
								</Link>
							))}
						</div>
						<p className="mt-4 font-mono text-xs tracking-[0.18em] text-muted-foreground uppercase">{user.login}</p>
					</div>
					{canEditUser && (
						<Button
							variant="outline"
							size="icon"
							aria-label="Изменить профиль"
							onClick={() => setEditOpen(true)}
							className="rounded-2xl border-border/80 transition-colors hover:border-primary hover:bg-secondary/70"
						>
							<Pencil className="h-4 w-4" />
						</Button>
					)}
				</div>
			</section>

			<div className="grid gap-6 tab:grid-cols-2">
				<ProfileSectionCard kicker="контакты" title="Контакты">
					{contacts.length === 0 ? (
						<EmptyProfileState>Контакты не указаны</EmptyProfileState>
					) : (
						<dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
							{contacts.map((row) => (
								<div key={row.label} className="contents">
									<dt className="text-muted-foreground">{row.label}</dt>
									<dd className="min-w-0 font-medium">
										{row.href ? (
											<a
												href={row.href}
												className={
													row.href.startsWith('mailto:')
														? 'break-all underline-offset-4 hover:underline'
														: 'underline-offset-4 hover:underline'
												}
											>
												{row.value}
											</a>
										) : (
											row.value
										)}
									</dd>
								</div>
							))}
						</dl>
					)}
				</ProfileSectionCard>

				{showSessionCard && (
					<ProfileSectionCard kicker="помощь со входом" title="Сеансы и вход">
						<p className="text-sm text-muted-foreground">
							Пригодится, если ученик не может войти или остался в аккаунте на чужом устройстве.
						</p>
						<div className="mt-4 flex flex-wrap gap-2">
							<Button
								ref={clearButtonRef}
								variant="outline"
								className="w-full mob:w-auto"
								onClick={() => setConfirmAction('clear')}
								disabled={sessionActions.clearDisabled}
							>
								<LockKeyholeOpen aria-hidden="true" />
								Снять ограничение входа
							</Button>
							<Button
								ref={revokeButtonRef}
								variant="outline"
								className="w-full mob:w-auto"
								onClick={() => setConfirmAction('revoke')}
								disabled={sessionActions.revokeDisabled}
							>
								<LogOut aria-hidden="true" />
								Завершить все сеансы
							</Button>
						</div>
					</ProfileSectionCard>
				)}
			</div>

			<ProfileSectionCard
				kicker="динамика"
				title="Пройденные тесты"
				loading={attemptsLoading || assignmentsLoading}
				sources={[attemptsSource, assignmentsSource]}
				action={
					<Link
						href={attemptsUrl({ student: user.id, status: 'all' })}
						className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none"
					>
						Все попытки в журнале
						<ArrowRight className="size-4" aria-hidden="true" />
					</Link>
				}
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

					{!dayDate && chartAttempts.length > 0 && (
						<AttemptBarChart attempts={chartAttempts} colors={topicColors} mode="range" />
					)}

					{!dayDate && chartAttempts.length === 0 && filteredAttempts.length > 0 && (
						<div className="flex h-32 items-center justify-center rounded-3xl border border-border/80 bg-secondary/60 text-sm text-muted-foreground">
							Нет данных за выбранный период
						</div>
					)}

					{dayDate && (
						<div className="space-y-2">
							<p className="text-xs text-muted-foreground">
								Попытки за {format(dayDate, 'd MMMM yyyy', { locale: ru })}
							</p>
							{chartAttempts.length === 0 ? (
								<div className="flex h-32 items-center justify-center rounded-3xl border border-border/80 bg-secondary/60 text-sm text-muted-foreground">
									Нет попыток за выбранный день
								</div>
							) : (
								<AttemptBarChart attempts={chartAttempts} colors={topicColors} mode="day" />
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
								const view = attemptResultView(attempt)
								const submitted = new Date(attempt.submittedAt).toLocaleString('ru-RU')
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
												{view.kind === 'pending'
													? view.auto
														? `${submitted} · авто ${view.auto.earned} из ${view.auto.total}`
														: submitted
													: `${submitted} · ${view.points.earned}/${view.points.total} · ${Math.round(view.percent)}%`}
											</p>
										</div>
										<div className="flex items-center gap-2">
											{view.kind === 'pending' ? (
												<ReviewStatusChip />
											) : (
												<>
													<Badge variant={view.passed ? 'default' : 'secondary'}>
														{view.passed ? 'Пройден' : 'Не пройден'}
													</Badge>
													{view.teacherChecked && <TeacherCheckedMark />}
												</>
											)}
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
					sources={[assignmentsSource]}
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
									{assignmentAction(a) === 'remove' ? (
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
									) : (
										<p className="shrink-0 text-xs text-muted-foreground">Назначил администратор</p>
									)}
								</div>
							))}
						</div>
					)}
				</ProfileSectionCard>

				<ProfileSectionCard
					kicker="банк тестов"
					title="Назначить тест"
					loading={testsLoading || assignmentsLoading}
					sources={[testsSource, assignmentsSource]}
				>
					{(testsData?.tests ?? []).length === 0 ? (
						<EmptyProfileState>Нет доступных тестов</EmptyProfileState>
					) : availableTests.length === 0 ? (
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

			{canEditUser && (
				<EditUserDialog
					open={editOpen}
					onOpenChange={setEditOpen}
					user={user}
					onSaved={() => {
						void mutateUser()
						void mutateCache(usersKeys.list())
					}}
				/>
			)}

			{showSessionCard && (
				<>
					<AlertDialog open={confirmAction === 'revoke'} onOpenChange={onConfirmOpenChange}>
						<AlertDialogContent onCloseAutoFocus={returnFocus('revoke')}>
							<AlertDialogHeader>
								<AlertDialogTitle className="font-medium">Завершить все сеансы пользователя?</AlertDialogTitle>
								<AlertDialogDescription>
									{withLoginBreak(revokeConfirmText(savedLogin), savedLogin)}
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel disabled={actionPending}>Отмена</AlertDialogCancel>
								<AlertDialogAction
									onClick={(event) => {
										event.preventDefault()
										void runSessionAction('revoke')
									}}
									disabled={actionPending}
									className="text-destructive-foreground bg-destructive hover:bg-destructive/90"
								>
									{pendingAction === 'revoke' ? 'Завершаем…' : 'Завершить сеансы'}
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>

					<AlertDialog open={confirmAction === 'clear'} onOpenChange={onConfirmOpenChange}>
						<AlertDialogContent onCloseAutoFocus={returnFocus('clear')}>
							<AlertDialogHeader>
								<AlertDialogTitle className="font-medium">Снять ограничение входа?</AlertDialogTitle>
								<AlertDialogDescription>
									{withLoginBreak(clearConfirmText(savedLogin), savedLogin)}
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel disabled={actionPending}>Отмена</AlertDialogCancel>
								<AlertDialogAction
									onClick={(event) => {
										event.preventDefault()
										void runSessionAction('clear')
									}}
									disabled={actionPending}
								>
									{pendingAction === 'clear' ? 'Снимаем…' : 'Снять ограничение'}
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				</>
			)}
		</div>
	)
}

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
	CircleCheck,
	CircleX,
	Loader2,
	LockKeyholeOpen,
	LogOut,
	Pencil,
	Plus,
	Trash2,
	X,
} from 'lucide-react'
import Link from 'next/link'
import { useQueryState } from 'nuqs'
import { toast } from 'sonner'
import useSWR, { useSWRConfig } from 'swr'

import { AttemptChart } from '@/components/charts/AttemptChart'
import { LoadErrorAlert } from '@/components/feedback/LoadErrorAlert'
import { PageHeader } from '@/components/page/PageHeader'
import { ToolbarButton, ToolbarTooltip } from '@/components/page/ToolbarButton'
import { ToolbarSearch } from '@/components/page/ToolbarSearch'
import { useAuth } from '@/components/providers/AuthProvider'
import { TableCard } from '@/components/table/TableCard'
import { useRowLink } from '@/components/table/use-row-link'
import { AttemptReviewLine } from '@/components/tests/attempt-result/AttemptReviewLine'
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
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
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
import { useChartConfigs } from '@/lib/charts/api'
import { failureMessage, failureOf } from '@/lib/http/errors'
import {
	assignTopicColors,
	filterAttemptsByPeriod,
	parseDateParam,
	parseDayParam,
	parsePeriod,
	PERIOD_PRESETS,
	resolvePeriodBounds,
} from '@/lib/progress/attempt-chart'
import { adminTestsKeys, adminTestsListFetcher, type AdminTestListItem } from '@/lib/tests/admin-api'
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
	type UserAttemptRow,
	type UserTestAssignment,
} from '@/lib/users/api'
import { assignmentAction, assignmentErrorText, contactRows } from '@/lib/users/student-card'
import { usersUrl } from '@/lib/users/users-url'
import { cn } from '@/lib/utils/cn'
import { formatDateTime, formatDay, formatPeriod } from '@/lib/utils/dates'

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
	title,
	children,
	loading,
	sources = [],
	action,
}: {
	title: string
	children: ReactNode
	loading?: boolean
	sources?: LoadSource[]
	action?: ReactNode
}) {
	const titleRef = useRef<HTMLHeadingElement>(null)
	const failed = failedSources(sources)

	return (
		<section className="min-w-0 space-y-4 rounded-3xl border border-border/80 bg-card p-4 shadow-sm tab-sm:p-5">
			<div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
				<h2 ref={titleRef} tabIndex={-1} className="text-lg font-semibold outline-none">
					{title}
				</h2>
				{action}
			</div>
			{failed.length > 0 ? (
				<LoadErrorAlert
					title="Не удалось загрузить данные"
					error={failed[0].error}
					onRetry={() => Promise.all(failed.map((source) => source.mutate()))}
					focusTarget={titleRef}
				/>
			) : loading ? (
				<p role="status" className="text-sm text-muted-foreground">
					Загрузка...
				</p>
			) : (
				children
			)}
		</section>
	)
}

function EmptyProfileState({ children }: { children: ReactNode }) {
	return (
		<div className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
			{children}
		</div>
	)
}

function AttemptsTable({
	attempts,
	colorBySlug,
}: {
	attempts: UserAttemptRow[]
	colorBySlug: ReadonlyMap<string, string>
}) {
	const rowLink = useRowLink()
	return (
		<TableCard className="shadow-none">
			<Table className="table-fixed">
				<TableHeader>
					<TableRow className="hover:bg-transparent">
						<TableHead className="pl-4">Тест</TableHead>
						<TableHead className="hidden w-40 text-right tab-sm:table-cell">Дата</TableHead>
						<TableHead className="w-40 pr-4 text-right">Результат</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{attempts.map((attempt) => {
						const href = `/admin/attempts/${attempt.attemptId}`
						const dotColor = colorBySlug.get(attempt.topicSlug)
						const submitted = formatDateTime(attempt.submittedAt)
						const view = attemptResultView(attempt)
						return (
							<TableRow key={attempt.attemptId} className="cursor-pointer" {...rowLink(href)}>
								<TableCell className="py-3 pl-4">
									<Link
										href={href}
										className="font-medium [overflow-wrap:anywhere] text-foreground transition-colors hover:text-primary focus-visible:underline focus-visible:outline-none"
									>
										{attempt.testTitle}
									</Link>
									<p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
										{dotColor ? (
											<span
												className="size-2 shrink-0 rounded-full"
												style={{ background: dotColor }}
												aria-hidden="true"
											/>
										) : null}
										<span className="truncate">{attempt.topicTitle ?? attempt.topicSlug}</span>
									</p>
									<p className="mt-0.5 text-xs text-muted-foreground tabular-nums tab-sm:hidden">{submitted}</p>
								</TableCell>
								<TableCell className="hidden text-right whitespace-nowrap text-muted-foreground tabular-nums tab-sm:table-cell">
									{submitted}
								</TableCell>
								<TableCell className="py-3 pr-4 text-right">
									{view.kind === 'pending' ? (
										<span className="inline-flex justify-end">
											<AttemptReviewLine view={view} audience="staff" />
										</span>
									) : (
										<>
											<span className="inline-flex items-center gap-1.5 font-medium tabular-nums">
												{view.passed ? (
													<CircleCheck className="size-4 text-primary" aria-hidden="true" />
												) : (
													<CircleX className="size-4 text-muted-foreground" aria-hidden="true" />
												)}
												{Math.round(view.percent)}%
												<span className="sr-only">{view.passed ? 'Пройден' : 'Не пройден'}</span>
											</span>
											<p className="text-xs text-muted-foreground tabular-nums">
												{view.points.earned} из {view.points.total}
											</p>
											{view.teacherChecked ? (
												<span className="mt-1 inline-flex">
													<TeacherCheckedMark />
												</span>
											) : null}
										</>
									)}
								</TableCell>
							</TableRow>
						)
					})}
				</TableBody>
			</Table>
		</TableCard>
	)
}

function AssignmentsTable({
	assignments,
	removingTestId,
	onRemove,
}: {
	assignments: UserTestAssignment[]
	removingTestId: string | null
	onRemove: (testId: string) => void
}) {
	return (
		<TableCard className="shadow-none">
			<Table className="table-fixed">
				<TableHeader>
					<TableRow className="hover:bg-transparent">
						<TableHead className="pl-4">Тест</TableHead>
						<TableHead className="hidden w-28 text-right tab-sm:table-cell">Назначен</TableHead>
						<TableHead className="w-14 pr-3">
							<span className="sr-only">Действия</span>
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{assignments.map((assignment) => {
						const assigned = formatDay(assignment.assignedAt)
						const removable = assignmentAction(assignment) === 'remove'
						const removing = removingTestId === assignment.testId
						return (
							<TableRow key={assignment.testId}>
								<TableCell className="py-2.5 pl-4">
									<p className="font-medium [overflow-wrap:anywhere] text-foreground">{assignment.testTitle}</p>
									<p className="text-xs text-muted-foreground tabular-nums tab-sm:hidden">Назначен {assigned}</p>
									{removable ? null : <p className="text-xs text-muted-foreground">Назначил администратор</p>}
								</TableCell>
								<TableCell className="hidden text-right whitespace-nowrap text-muted-foreground tabular-nums tab-sm:table-cell">
									{assigned}
								</TableCell>
								<TableCell className="pr-3">
									{removable ? (
										<Tooltip>
											<TooltipTrigger asChild>
												<Button
													size="icon"
													variant="ghost"
													className="size-8 rounded-full text-muted-foreground hover:text-destructive"
													aria-label={`Удалить назначение: ${assignment.testTitle}`}
													onClick={() => onRemove(assignment.testId)}
													disabled={removing}
												>
													{removing ? (
														<Loader2 className="size-4 animate-spin" aria-hidden="true" />
													) : (
														<Trash2 className="size-4" aria-hidden="true" />
													)}
												</Button>
											</TooltipTrigger>
											<TooltipContent>Удалить назначение</TooltipContent>
										</Tooltip>
									) : null}
								</TableCell>
							</TableRow>
						)
					})}
				</TableBody>
			</Table>
		</TableCard>
	)
}

function AssignableTestsTable({
	tests,
	assigningTestId,
	onAssign,
}: {
	tests: AdminTestListItem[]
	assigningTestId: string | null
	onAssign: (testId: string) => void
}) {
	return (
		<TableCard className="shadow-none">
			<div className="max-h-80 overflow-y-auto">
				<Table className="table-fixed">
					<TableHeader>
						<TableRow className="hover:bg-transparent">
							<TableHead className="pl-4">Тест</TableHead>
							<TableHead className="w-14 pr-3">
								<span className="sr-only">Действия</span>
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{tests.map((test) => {
							const assigning = assigningTestId === test.id
							return (
								<TableRow key={test.id}>
									<TableCell className="py-2.5 pl-4">
										<p className="font-medium [overflow-wrap:anywhere] text-foreground">{test.title}</p>
										{test.topicTitle ? <p className="text-xs text-muted-foreground">{test.topicTitle}</p> : null}
									</TableCell>
									<TableCell className="pr-3">
										<Tooltip>
											<TooltipTrigger asChild>
												<Button
													size="icon"
													variant="ghost"
													className="size-8 rounded-full text-muted-foreground hover:text-primary"
													aria-label={`Назначить: ${test.title}`}
													onClick={() => onAssign(test.id)}
													disabled={assigning}
												>
													{assigning ? (
														<Loader2 className="size-4 animate-spin" aria-hidden="true" />
													) : (
														<Plus className="size-4" aria-hidden="true" />
													)}
												</Button>
											</TooltipTrigger>
											<TooltipContent>Назначить</TooltipContent>
										</Tooltip>
									</TableCell>
								</TableRow>
							)
						})}
					</TableBody>
				</Table>
			</div>
		</TableCard>
	)
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
	const chartConfig = useChartConfigs().profileAttempts
	const [range, setRange] = useQueryState('range', { defaultValue: '' })
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
	const period = range ? parsePeriod(range) : chartConfig.period
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
		void setRange(value)
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
		<div className="space-y-4">
			<PageHeader
				title={displayName}
				meta={
					<span className="flex flex-wrap items-center gap-x-2 gap-y-1">
						<span className="break-all">{user.login}</span>
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
					</span>
				}
			>
				{canEditUser ? (
					<ToolbarTooltip label="Изменить профиль">
						<ToolbarButton label="Изменить профиль" onClick={() => setEditOpen(true)}>
							<Pencil className="size-4" aria-hidden="true" />
						</ToolbarButton>
					</ToolbarTooltip>
				) : null}
			</PageHeader>

			<div className="grid gap-4 tab:grid-cols-2">
				<ProfileSectionCard title="Контакты">
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
					<ProfileSectionCard title="Сеансы и вход">
						<p className="text-sm text-muted-foreground">
							Пригодится, если ученик не может войти или остался в аккаунте на чужом устройстве.
						</p>
						<div className="flex flex-wrap gap-2">
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
					{attempts.length > 0 && (
						<div className="flex flex-wrap items-center gap-2">
							<ToolbarSearch
								value={search}
								onChange={(value) => {
									void setSearch(value)
									setVisibleCount(5)
								}}
								label="Поиск по тесту"
								placeholder="Название теста"
								className="min-w-45"
							/>

							<Select
								value={topicFilter}
								onValueChange={(v) => {
									void setTopicFilter(v)
									void setTestsParam(null)
									setVisibleCount(5)
								}}
							>
								<SelectTrigger aria-label="Тема" className="h-10 w-45 rounded-full bg-card">
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

							{testOptions.length > 0 && (
								<Popover>
									<PopoverTrigger asChild>
										<Button variant="outline" className="h-10 max-w-full gap-1.5 rounded-full bg-card font-normal">
											<span className="truncate">{testPickerLabel}</span>
											<ChevronDown className="size-3.5 opacity-60" aria-hidden="true" />
										</Button>
									</PopoverTrigger>
									<PopoverContent className="w-64 p-2" align="start">
										<div className="max-h-60 space-y-1 overflow-y-auto">
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
								className="flex-wrap justify-start gap-1 rounded-full border border-border/80 bg-card p-1"
								value={presetValue}
								onValueChange={handlePresetChange}
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

							{/* Custom date range */}
							<Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
								<PopoverTrigger asChild>
									<Button
										variant={period === 'custom' && !dayDate ? 'default' : 'outline'}
										className={cn('h-10 rounded-full', !(period === 'custom' && !dayDate) && 'bg-card')}
										onClick={() => void setRange('custom')}
									>
										{period === 'custom' && fromDate && toDate ? formatPeriod(fromDate, toDate) : 'Свой диапазон'}
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
									<Button
										variant={dayDate ? 'default' : 'outline'}
										className={cn('h-10 gap-1.5 rounded-full', !dayDate && 'bg-card')}
									>
										<CalendarIcon className="size-4" aria-hidden="true" />
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
								<Button
									variant="ghost"
									size="icon"
									className="size-10 rounded-full"
									onClick={clearDay}
									aria-label="Сбросить день"
								>
									<X className="size-4" aria-hidden="true" />
								</Button>
							)}
						</div>
					)}

					{!dayDate && chartAttempts.length > 0 && (
						<AttemptChart attempts={chartAttempts} config={chartConfig} mode="range" topicColors={topicColorBySlug} />
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
								<AttemptChart attempts={chartAttempts} config={chartConfig} mode="day" topicColors={topicColorBySlug} />
							)}
						</div>
					)}

					{attempts.length === 0 ? (
						<EmptyProfileState>Отправленных попыток пока нет</EmptyProfileState>
					) : filteredAttempts.length === 0 ? (
						<EmptyProfileState>Ничего не найдено</EmptyProfileState>
					) : (
						<div className="space-y-3">
							<AttemptsTable attempts={visibleAttempts} colorBySlug={topicColorBySlug} />
							{visibleCount < filteredAttempts.length && (
								<Button variant="outline" className="rounded-full" onClick={() => setVisibleCount((c) => c + 5)}>
									Загрузить ещё
								</Button>
							)}
						</div>
					)}
				</div>
			</ProfileSectionCard>

			<div className="grid gap-4 lg:grid-cols-2">
				<ProfileSectionCard title="Назначенные тесты" loading={assignmentsLoading} sources={[assignmentsSource]}>
					{assignments.length === 0 ? (
						<EmptyProfileState>Нет назначенных тестов</EmptyProfileState>
					) : (
						<AssignmentsTable assignments={assignments} removingTestId={removingTestId} onRemove={handleRemove} />
					)}
				</ProfileSectionCard>

				<ProfileSectionCard
					title="Назначить тест"
					loading={testsLoading || assignmentsLoading}
					sources={[testsSource, assignmentsSource]}
				>
					{(testsData?.tests ?? []).length === 0 ? (
						<EmptyProfileState>Нет доступных тестов</EmptyProfileState>
					) : availableTests.length === 0 ? (
						<EmptyProfileState>Все тесты уже назначены</EmptyProfileState>
					) : (
						<AssignableTestsTable tests={availableTests} assigningTestId={assigningTestId} onAssign={handleAssign} />
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

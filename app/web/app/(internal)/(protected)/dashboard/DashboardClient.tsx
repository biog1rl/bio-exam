'use client'

import { useMemo, type ReactNode } from 'react'

import {
	ArrowRight,
	BookOpenCheck,
	CheckCircle2,
	ClipboardList,
	Leaf,
	LibraryBig,
	LineChart,
	LockKeyhole,
	Microscope,
	PanelTop,
	Sparkles,
	UsersRound,
} from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import useSWR from 'swr'

import { StudentProgressSection } from '@/components/progress/StudentProgressSection'
import { useAuth } from '@/components/providers/AuthProvider'
import { Button } from '@/components/ui/button'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { Skeleton } from '@/components/ui/skeleton'
import { apiFetch } from '@/lib/api-fetch'
import { fetchMyTestAttempts, fetchPublicTestsList } from '@/lib/tests/api'
import { formatPercent } from '@/lib/tests/format'
import type { PublicTestListItem, TestAttemptSummary } from '@/lib/tests/types'

type Topic = {
	id: string
	title: string
	isActive: boolean
	testsCount?: number
}

type AdminTest = {
	id: string
	slug?: string
	title: string
	topicId: string
	topicSlug?: string
	topicTitle?: string
	isPublished: boolean
	questionsCount?: number
	updatedAt?: string
}

type AttemptBundle = {
	test: PublicTestListItem
	rows: TestAttemptSummary[]
	total: number
}

type DashboardAttempt = TestAttemptSummary & {
	testTitle: string
	testHref: string
}

type AdminDashboardAttempt = {
	attemptId: string
	testId: string
	testTitle: string
	testSlug: string
	topicSlug: string
	topicTitle: string
	studentId: string
	studentName: string
	submittedAt: string
	earnedPoints: number
	totalPoints: number
	scorePercentage: number
	passed: boolean
}

type AdminDashboardData = {
	summary: {
		totalAttempts: number
		activeStudents: number
		averageScore: number
		passedAttempts: number
	}
	latestAttempts: AdminDashboardAttempt[]
	dailyActivity: Array<{
		date: string
		attempts: number
		averageScore: number
	}>
}

const studentChartConfig = {
	score: {
		label: 'Результат',
		color: 'var(--chart-1)',
	},
} satisfies ChartConfig

const adminStudentChartConfig = {
	score: {
		label: 'Балл',
		color: 'var(--chart-1)',
	},
} satisfies ChartConfig

const teacherChartConfig = {
	published: {
		label: 'Опубликовано',
		color: 'var(--chart-1)',
	},
	drafts: {
		label: 'Черновики',
		color: 'var(--chart-2)',
	},
	questions: {
		label: 'Вопросы',
		color: 'var(--chart-3)',
	},
} satisfies ChartConfig

async function fetchAdminJson<T>(url: string): Promise<T | null> {
	const response = await apiFetch(url, { cache: 'no-store' })
	if (response.status === 401 || response.status === 403) return null
	if (!response.ok) throw new Error(`HTTP ${response.status}`)
	return (await response.json()) as T
}

function formatDate(value?: string) {
	if (!value) return 'нет даты'
	return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short' }).format(new Date(value))
}

function average(values: number[]) {
	if (values.length === 0) return 0
	return values.reduce((sum, value) => sum + value, 0) / values.length
}

function dashboardName(firstName?: string | null, login?: string | null) {
	return firstName || login || 'Пользователь'
}

function SoftPanel({ children, className = '' }: { children: ReactNode; className?: string }) {
	return (
		<section className={`rounded-4xl border border-border/80 bg-card/90 shadow-sm ${className}`}>{children}</section>
	)
}

const interactiveCardClass =
	'transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'

function SectionTitle({ kicker, title, children }: { kicker: string; title: string; children?: ReactNode }) {
	return (
		<div>
			<p className="font-mono text-[0.6875rem] tracking-[0.22em] text-muted-foreground uppercase">{kicker}</p>
			<h2 className="mt-2 font-serif text-2xl text-foreground tab-sm:text-3xl">{title}</h2>
			{children ? <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{children}</p> : null}
		</div>
	)
}

function LoadingRow() {
	return (
		<div className="grid gap-3 tab-sm:grid-cols-3">
			<Skeleton className="h-28 rounded-3xl" />
			<Skeleton className="h-28 rounded-3xl" />
			<Skeleton className="h-28 rounded-3xl" />
		</div>
	)
}

function EmptyPanel({ children }: { children: ReactNode }) {
	return <div className="rounded-3xl bg-secondary/70 p-unit text-sm text-muted-foreground">{children}</div>
}

export default function DashboardClient() {
	const { me, can } = useAuth()
	const canReadTests = can('tests', 'read')

	const testsQuery = useSWR(canReadTests ? null : 'dashboard-public-tests', fetchPublicTestsList)
	const tests = useMemo(() => testsQuery.data?.tests ?? [], [testsQuery.data?.tests])
	const featuredTests = tests.slice(0, 4)

	const attemptsQuery = useSWR(
		!canReadTests && tests.length ? ['dashboard-attempts', tests.map((test) => test.id).join(',')] : null,
		() =>
			Promise.all(
				tests.slice(0, 8).map(async (test): Promise<AttemptBundle> => {
					try {
						const data = await fetchMyTestAttempts(test.id, { offset: 0, limit: 8 })
						return { test, rows: data.rows, total: data.total }
					} catch {
						return { test, rows: [], total: 0 }
					}
				})
			)
	)

	const adminTopicsQuery = useSWR(canReadTests ? 'dashboard-admin-topics' : null, () =>
		fetchAdminJson<{ topics: Topic[] }>('/api/tests/topics')
	)
	const adminTestsQuery = useSWR(canReadTests ? 'dashboard-admin-tests' : null, () =>
		fetchAdminJson<{ tests: AdminTest[] }>('/api/tests')
	)
	const adminDashboardQuery = useSWR(canReadTests ? 'dashboard-admin-summary' : null, () =>
		fetchAdminJson<AdminDashboardData>('/api/tests/admin/dashboard')
	)

	const attemptBundles = attemptsQuery.data ?? []
	const allAttempts: DashboardAttempt[] = attemptBundles.flatMap((bundle) =>
		bundle.rows.map((row) => ({
			...row,
			testTitle: bundle.test.title,
			testHref: `/tests/${bundle.test.topicSlug}/${bundle.test.slug}`,
		}))
	)
	const latestAttempts = [...allAttempts]
		.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())
		.slice(0, 6)
	const latestAttempt = latestAttempts[0] ?? null
	const averageScore = Math.round(average(allAttempts.map((attempt) => attempt.scorePercentage)))
	const completedTotal = attemptBundles.reduce((sum, bundle) => sum + bundle.total, 0)
	const bestAttempt = allAttempts.reduce<DashboardAttempt | null>(
		(best, attempt) => (!best || attempt.scorePercentage > best.scorePercentage ? attempt : best),
		null
	)

	const studentProgress = [...allAttempts]
		.sort((a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime())
		.slice(-12)
		.map((attempt, index) => ({
			label: `${index + 1}`,
			score: Math.round(attempt.scorePercentage),
			testTitle: attempt.testTitle,
			date: formatDate(attempt.submittedAt),
		}))

	const groupedTests = useMemo(() => {
		const groups = new Map<string, PublicTestListItem[]>()
		for (const test of tests) {
			const key = test.topicTitle
			groups.set(key, [...(groups.get(key) ?? []), test])
		}
		return Array.from(groups.entries()).slice(0, 4)
	}, [tests])

	const topics = adminTopicsQuery.data?.topics ?? []
	const adminTests = adminTestsQuery.data?.tests ?? []
	const adminDashboard = adminDashboardQuery.data
	const adminLatestAttempts = adminDashboard?.latestAttempts ?? []
	const adminLatestAttempt = adminLatestAttempts[0] ?? null
	const teacherAllowed = canReadTests && adminTopicsQuery.data !== null && adminTestsQuery.data !== null
	const publishedCount = adminTests.filter((test) => test.isPublished).length
	const draftCount = adminTests.length - publishedCount
	const totalQuestions = adminTests.reduce((sum, test) => sum + (test.questionsCount ?? 0), 0)
	const teacherTopicData = topics.slice(0, 8).map((topic) => {
		const topicTests = adminTests.filter((test) => test.topicId === topic.id)
		const published = topicTests.filter((test) => test.isPublished).length
		return {
			topic: topic.title.length > 18 ? `${topic.title.slice(0, 18)}…` : topic.title,
			published,
			drafts: topicTests.length - published,
			questions: topicTests.reduce((sum, test) => sum + (test.questionsCount ?? 0), 0),
		}
	})
	const adminStudentScores = [...adminLatestAttempts]
		.reverse()
		.slice(-8)
		.map((attempt) => ({
			student: attempt.studentName,
			score: Math.round(attempt.scorePercentage),
			testTitle: attempt.testTitle,
			date: formatDate(attempt.submittedAt),
		}))
	const heroTitle = canReadTests
		? 'Контроль тестов и активности студентов'
		: latestAttempt
			? 'Продолжить работу с тестами'
			: 'Выберите назначенный тест'
	const heroHref = canReadTests ? '/admin/tests' : (latestAttempt?.testHref ?? '/tests')
	const heroCta = canReadTests ? 'Управление тестами' : latestAttempt ? 'Открыть последний тест' : 'Перейти к тестам'
	const heroBadgeValue = canReadTests ? `${publishedCount} опубликовано` : `${tests.length} доступно`
	const adminSummary = adminDashboard?.summary

	return (
		<main className="space-y-5">
			<section className="grid gap-5 xl:grid-cols-[1.08fr_.92fr]">
				<SoftPanel className="overflow-hidden p-unit-mob tab-sm:p-unit">
					<div className="mb-6 flex flex-wrap gap-2">
						<span className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-4 py-2 text-sm text-secondary-foreground">
							<Leaf className="size-4" />
							{dashboardName(me?.firstName, me?.login)}
						</span>
						<span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm text-muted-foreground">
							<ClipboardList className="size-4" />
							{heroBadgeValue}
						</span>
					</div>

					<div className="grid gap-6 tab:grid-cols-[1fr_auto] tab:items-end">
						<div>
							<p className="font-mono text-[0.6875rem] tracking-[0.22em] text-muted-foreground uppercase">сегодня</p>
							<h1 className="mt-2 max-w-3xl font-serif text-3xl leading-[1.02] text-foreground mob:text-4xl tab-sm:text-5xl">
								{heroTitle}
							</h1>
						</div>
						<Button asChild size="lg" className="-md w-full rounded-full transition-all mob:w-auto">
							<Link href={heroHref}>
								{heroCta}
								<ArrowRight className="size-4" />
							</Link>
						</Button>
					</div>

					<div className="mt-8 grid gap-3 tab-sm:grid-cols-3">
						{canReadTests ? (
							adminDashboardQuery.isLoading ? (
								<LoadingRow />
							) : (
								[
									['попыток студентов', adminSummary?.totalAttempts ?? 0, BookOpenCheck],
									['активных студентов', adminSummary?.activeStudents ?? 0, UsersRound],
									['средний балл', adminSummary ? `${Math.round(adminSummary.averageScore)}%` : '—', LineChart],
								].map(([label, value, Icon]) => {
									const TypedIcon = Icon as typeof BookOpenCheck
									return (
										<div key={label as string} className="rounded-3xl bg-secondary/80 p-unit">
											<TypedIcon className="mb-5 size-5 text-primary" />
											<p className="font-serif text-3xl">{value as string | number}</p>
											<p className="mt-1 text-sm text-muted-foreground">{label as string}</p>
										</div>
									)
								})
							)
						) : attemptsQuery.isLoading ? (
							<LoadingRow />
						) : (
							[
								['завершено', completedTotal, BookOpenCheck],
								['средний балл', averageScore ? `${averageScore}%` : '—', LineChart],
								['лучший результат', bestAttempt ? formatPercent(bestAttempt.scorePercentage) : '—', Sparkles],
							].map(([label, value, Icon]) => {
								const TypedIcon = Icon as typeof BookOpenCheck
								return (
									<div key={label as string} className="rounded-3xl bg-secondary/80 p-unit">
										<TypedIcon className="mb-5 size-5 text-primary" />
										<p className="font-serif text-3xl">{value as string | number}</p>
										<p className="mt-1 text-sm text-muted-foreground">{label as string}</p>
									</div>
								)
							})
						)}
					</div>
				</SoftPanel>

				<SoftPanel className="relative min-h-80 overflow-hidden tab-sm:min-h-105">
					<Image
						src="/img/main-bg.jpg"
						alt="Лесной биологический фон"
						fill
						sizes="(min-width: 768px) 33vw, 100vw"
						className="object-cover"
						priority
						unoptimized
					/>
					<div className="absolute inset-0 bg-linear-to-b from-foreground/20 via-background/20 to-foreground/55" />
					<div className="absolute inset-x-3 bottom-3 rounded-3xl border border-white/45 bg-card/85 p-unit-mob shadow-lg backdrop-blur-md tab-sm:inset-x-5 tab-sm:bottom-5 tab-sm:p-unit">
						<p className="font-mono text-[0.6875rem] tracking-[0.2em] text-muted-foreground uppercase">
							{canReadTests ? 'последняя попытка студента' : 'последняя попытка'}
						</p>
						{canReadTests ? (
							adminLatestAttempt ? (
								<Link
									href={`/admin/attempts/${adminLatestAttempt.attemptId}`}
									className={`group mt-3 block rounded-2xl ${interactiveCardClass}`}
								>
									<div className="flex items-start justify-between gap-3">
										<div className="min-w-0">
											<p className="truncate font-serif text-xl mob:text-2xl">{adminLatestAttempt.studentName}</p>
											<p className="truncate text-sm text-muted-foreground">{adminLatestAttempt.testTitle}</p>
										</div>
										<ArrowRight className="mt-1 size-5 shrink-0 text-primary transition-transform group-hover:translate-x-1" />
									</div>
									<div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
										<div
											className="h-full rounded-full bg-primary"
											style={{ width: `${adminLatestAttempt.scorePercentage}%` }}
										/>
									</div>
									<div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
										<span>{formatDate(adminLatestAttempt.submittedAt)}</span>
										<span>{formatPercent(adminLatestAttempt.scorePercentage)}</span>
									</div>
								</Link>
							) : (
								<p className="mt-3 text-sm text-muted-foreground">Попыток студентов пока нет</p>
							)
						) : latestAttempt ? (
							<Link href={latestAttempt.testHref} className={`group mt-3 block rounded-2xl ${interactiveCardClass}`}>
								<div className="flex items-start justify-between gap-3">
									<p className="truncate font-serif text-xl mob:text-2xl">{latestAttempt.testTitle}</p>
									<ArrowRight className="mt-1 size-5 shrink-0 text-primary transition-transform group-hover:translate-x-1" />
								</div>
								<div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
									<div
										className="h-full rounded-full bg-primary"
										style={{ width: `${latestAttempt.scorePercentage}%` }}
									/>
								</div>
								<div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
									<span>{formatDate(latestAttempt.submittedAt)}</span>
									<span>{formatPercent(latestAttempt.scorePercentage)}</span>
								</div>
							</Link>
						) : (
							<p className="mt-3 text-sm text-muted-foreground">Попыток пока нет</p>
						)}
					</div>
				</SoftPanel>
			</section>

			{canReadTests ? null : (
				<section className="grid gap-5 xl:grid-cols-[1fr_23.75rem]">
					<SoftPanel className="p-unit-mob tab-sm:p-unit">
						<div className="flex flex-wrap items-start justify-between gap-4">
							<SectionTitle kicker="студент" title="Доступные тесты" />
							<Button asChild variant="outline" className="-sm rounded-full bg-card transition-all">
								<Link href="/tests">Все доступные</Link>
							</Button>
						</div>

						<div className="mt-7 grid gap-3">
							{testsQuery.isLoading ? (
								<LoadingRow />
							) : featuredTests.length === 0 ? (
								<EmptyPanel>Назначенных тестов пока нет.</EmptyPanel>
							) : (
								featuredTests.map((test) => (
									<Link
										key={test.id}
										href={`/tests/${test.topicSlug}/${test.slug}`}
										className={`grid gap-4 rounded-3xl border border-border bg-card p-unit hover:bg-secondary/45 tab-sm:grid-cols-[1fr_auto] ${interactiveCardClass}`}
									>
										<div>
											<p className="text-sm text-muted-foreground">{test.topicTitle}</p>
											<h3 className="mt-1 font-serif text-2xl">{test.title}</h3>
											<p className="mt-2 text-sm text-muted-foreground">
												{test.questionsCount} вопросов
												{test.timeLimitMinutes ? ` · ${test.timeLimitMinutes} мин` : ''}
												{test.passingScore != null ? ` · проходной ${formatPercent(test.passingScore)}` : ''}
											</p>
										</div>
										<div className="flex items-center gap-2 text-primary">
											Открыть
											<ArrowRight className="size-4" />
										</div>
									</Link>
								))
							)}
						</div>
					</SoftPanel>

					<SoftPanel className="p-unit-mob tab-sm:p-unit">
						<SectionTitle kicker="история" title="Последние попытки" />
						<div className="mt-6 space-y-3">
							{attemptsQuery.isLoading ? (
								[0, 1, 2].map((item) => <Skeleton key={item} className="h-20 rounded-3xl" />)
							) : latestAttempts.length === 0 ? (
								<EmptyPanel>История появится после первой попытки.</EmptyPanel>
							) : (
								latestAttempts.map((attempt) => (
									<Link
										key={attempt.id}
										href={attempt.testHref}
										className={`group block rounded-3xl bg-secondary/70 p-unit hover:bg-secondary ${interactiveCardClass}`}
									>
										<div className="flex items-center justify-between gap-3">
											<p className="truncate font-medium">{attempt.testTitle}</p>
											<span className="flex items-center gap-2 rounded-full bg-card px-3 py-1 text-sm">
												{formatPercent(attempt.scorePercentage)}
												<ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
											</span>
										</div>
										<div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
											<div
												className="h-full rounded-full bg-primary"
												style={{ width: `${attempt.scorePercentage}%` }}
											/>
										</div>
										<p className="mt-2 text-xs text-muted-foreground">{formatDate(attempt.submittedAt)}</p>
									</Link>
								))
							)}
						</div>
					</SoftPanel>
				</section>
			)}

			{canReadTests ? (
				<section className="grid gap-5 xl:grid-cols-[1fr_23.75rem]">
					<SoftPanel className="p-unit-mob tab-sm:p-unit">
						<SectionTitle kicker="история" title="Последние попытки студентов" />
						<div className="mt-6 space-y-3">
							{adminDashboardQuery.isLoading ? (
								[0, 1, 2].map((item) => <Skeleton key={item} className="h-20 rounded-3xl" />)
							) : adminLatestAttempts.length === 0 ? (
								<EmptyPanel>Студенты пока не завершали тесты.</EmptyPanel>
							) : (
								adminLatestAttempts.slice(0, 5).map((attempt) => (
									<Link
										key={attempt.attemptId}
										href={`/admin/attempts/${attempt.attemptId}`}
										className={`group block rounded-3xl bg-secondary/70 p-unit hover:bg-secondary ${interactiveCardClass}`}
									>
										<div className="flex items-center justify-between gap-3">
											<div className="min-w-0">
												<p className="truncate font-medium">{attempt.studentName}</p>
												<p className="truncate text-xs text-muted-foreground">{attempt.testTitle}</p>
											</div>
											<span className="flex items-center gap-2 rounded-full bg-card px-3 py-1 text-sm">
												{formatPercent(attempt.scorePercentage)}
												<ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
											</span>
										</div>
										<p className="mt-2 text-xs text-muted-foreground">{formatDate(attempt.submittedAt)}</p>
									</Link>
								))
							)}
						</div>
					</SoftPanel>

					<SoftPanel className="p-unit-mob tab-sm:p-unit">
						<SectionTitle kicker="быстрый вход" title="Администрирование" />
						<div className="mt-6 grid gap-3">
							<Link
								href="/tests"
								className={`group flex items-center justify-between rounded-3xl bg-secondary/70 p-unit hover:bg-secondary ${interactiveCardClass}`}
							>
								<span>Все тесты</span>
								<ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
							</Link>
							<Link
								href="/admin/tests"
								className={`group flex items-center justify-between rounded-3xl bg-secondary/70 p-unit hover:bg-secondary ${interactiveCardClass}`}
							>
								<span>Настройка тестов и тем</span>
								<ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
							</Link>
							<Link
								href="/admin/users"
								className={`group flex items-center justify-between rounded-3xl bg-secondary/70 p-unit hover:bg-secondary ${interactiveCardClass}`}
							>
								<span>Пользователи</span>
								<ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
							</Link>
							<Link
								href="/admin/attempts"
								className={`group flex items-center justify-between rounded-3xl bg-secondary/70 p-unit hover:bg-secondary ${interactiveCardClass}`}
							>
								<span>Попытки</span>
								<ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
							</Link>
						</div>
					</SoftPanel>
				</section>
			) : null}

			{canReadTests ? null : <StudentProgressSection />}
			{/* <section>
        <SoftPanel className="p-unit-mob tab-sm:p-unit">
          <SectionTitle kicker="график" title="Динамика результатов" />
          <div className="mt-6">
            {canReadTests ? (
              adminDashboardQuery.isLoading ? (
                <Skeleton className="h-70 rounded-3xl" />
              ) : adminStudentScores.length === 0 ? (
                <EmptyPanel>График появится после первых попыток студентов.</EmptyPanel>
              ) : (
                <ChartContainer config={adminStudentChartConfig} className="h-70 w-full">
                  <BarChart data={adminStudentScores}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="student" tickLine={false} axisLine={false} />
                    <YAxis domain={[0, 100]} tickLine={false} axisLine={false} unit="%" />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="score" fill="var(--color-score)" radius={8} />
                  </BarChart>
                </ChartContainer>
              )
            ) : attemptsQuery.isLoading ? (
              <Skeleton className="h-70 rounded-3xl" />
            ) : studentProgress.length === 0 ? (
              <EmptyPanel>График появится после первой попытки.</EmptyPanel>
            ) : (
              <ChartContainer config={studentChartConfig} className="h-70 w-full">
                <AreaChart data={studentProgress}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} />
                  <YAxis domain={[0, 100]} tickLine={false} axisLine={false} unit="%" />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area
                    dataKey="score"
                    type="monotone"
                    fill="var(--color-score)"
                    fillOpacity={0.22}
                    stroke="var(--color-score)"
                    strokeWidth={3}
                  />
                </AreaChart>
              </ChartContainer>
            )}
          </div>

          {canReadTests ? null : (
            <>
              <div className="mt-8 flex items-center justify-between gap-4">
                <SectionTitle kicker="темы" title="Доступные направления" />
                <Button
                  asChild
                  variant="outline"
                  className="-sm hidden rounded-full bg-card transition-all tab-sm:inline-flex"
                >
                  <Link href="/tests">Все тесты</Link>
                </Button>
              </div>
              <div className="mt-6 grid gap-3 tab-sm:grid-cols-2 tab:grid-cols-4">
                {groupedTests.length === 0 ? (
                  <EmptyPanel>Темы появятся после назначения тестов.</EmptyPanel>
                ) : (
                  groupedTests.map(([topicTitle, topicTests]) => (
                    <div key={topicTitle} className="rounded-3xl border border-border bg-card p-unit">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="font-serif text-2xl">{topicTitle}</h3>
                        <span className="rounded-full bg-secondary px-3 py-1 text-sm">{topicTests.length}</span>
                      </div>
                      <div className="mt-4 space-y-2">
                        {topicTests.slice(0, 5).map((test) => (
                          <Link
                            key={test.id}
                            href={`/tests/${test.topicSlug}/${test.slug}`}
                            className={`group flex items-center justify-between gap-3 rounded-2xl bg-secondary/55 px-3 py-2 text-sm hover:bg-secondary ${interactiveCardClass}`}
                          >
                            <span className="truncate">{test.title}</span>
                            <ArrowRight className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
                          </Link>
                        ))}
                        {topicTests.length > 5 ? (
                          <Link
                            href="/tests"
                            className={`group flex items-center justify-between gap-3 rounded-2xl px-3 py-2 text-sm text-muted-foreground hover:bg-secondary/45 hover:text-foreground ${interactiveCardClass}`}
                          >
                            <span>Ещё {topicTests.length - 5}</span>
                            <ArrowRight className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </SoftPanel>
      </section> */}

			{canReadTests ? (
				<section className="grid gap-5 tab:grid-cols-[23.75rem_1fr]">
					<SoftPanel className="p-unit-mob tab-sm:p-unit">
						<SectionTitle kicker="учитель / админ" title="Состояние базы" />

						{adminTopicsQuery.isLoading || adminTestsQuery.isLoading ? (
							<div className="mt-7">
								<LoadingRow />
							</div>
						) : !teacherAllowed ? (
							<div className="mt-7 rounded-3xl bg-secondary p-unit">
								<LockKeyhole className="mb-5 size-6 text-muted-foreground" />
								<p className="font-serif text-2xl">Нужны права администратора</p>
							</div>
						) : (
							<div className="mt-7 grid gap-3">
								{[
									['темы', topics.length, LibraryBig],
									['опубликовано', publishedCount, CheckCircle2],
									['черновики', draftCount, PanelTop],
									['вопросов', totalQuestions, Microscope],
								].map(([label, value, Icon]) => {
									const TypedIcon = Icon as typeof LibraryBig
									return (
										<div key={label as string} className="flex items-center gap-4 rounded-3xl bg-secondary/70 p-unit">
											<TypedIcon className="size-5 text-primary" />
											<p className="font-serif text-2xl">{value as number}</p>
											<p className="text-sm text-muted-foreground">{label as string}</p>
										</div>
									)
								})}
							</div>
						)}
					</SoftPanel>

					<SoftPanel className="p-unit-mob tab-sm:p-unit">
						<div className="flex flex-wrap items-start justify-between gap-4">
							<SectionTitle kicker="график" title="Публикации и наполнение" />
							<Button asChild variant="outline" className="-sm rounded-full bg-card transition-all">
								<Link href="/admin/tests">Управление тестами</Link>
							</Button>
						</div>

						<div className="mt-7">
							{adminTopicsQuery.isLoading || adminTestsQuery.isLoading ? (
								<Skeleton className="h-75 rounded-3xl" />
							) : teacherTopicData.length === 0 ? (
								<EmptyPanel>Нет тем для отображения.</EmptyPanel>
							) : (
								<ChartContainer config={teacherChartConfig} className="h-75 w-full">
									<BarChart data={teacherTopicData}>
										<CartesianGrid vertical={false} />
										<XAxis dataKey="topic" tickLine={false} axisLine={false} />
										<YAxis tickLine={false} axisLine={false} />
										<ChartTooltip content={<ChartTooltipContent />} />
										<Bar dataKey="published" stackId="tests" fill="var(--color-published)" radius={[8, 8, 0, 0]} />
										<Bar dataKey="drafts" stackId="tests" fill="var(--color-drafts)" radius={[8, 8, 0, 0]} />
										<Bar dataKey="questions" fill="var(--color-questions)" radius={8} />
									</BarChart>
								</ChartContainer>
							)}
						</div>
					</SoftPanel>
				</section>
			) : null}
		</main>
	)
}

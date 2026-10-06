'use client'

import { useMemo, useState, type ReactNode } from 'react'

import { ArrowRight } from 'lucide-react'
import Link from 'next/link'
import useSWR from 'swr'

import { ActivityChart, ContentChart } from '@/components/charts/DashboardCharts'
import { EmptyState } from '@/components/page/EmptyState'
import { PageHeader } from '@/components/page/PageHeader'
import { StudentProgressSection } from '@/components/progress/StudentProgressSection'
import { useAuth } from '@/components/providers/AuthProvider'
import { TableCard } from '@/components/table/TableCard'
import { useRowLink } from '@/components/table/use-row-link'
import { AttemptReviewLine, type AttemptReviewAudience } from '@/components/tests/attempt-result/AttemptReviewLine'
import { TeacherCheckedMark } from '@/components/tests/attempt-result/TeacherCheckedMark'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { dashboardUrl, useChartConfigs } from '@/lib/charts/api'
import { request } from '@/lib/http/request'
import { quickLinkSections } from '@/lib/navigation/sections'
import { optionalAdminData } from '@/lib/tests/admin-optional'
import { fetchMyTestAttempts, fetchPublicTestsList } from '@/lib/tests/api'
import { attemptResultView, type AttemptResultFields } from '@/lib/tests/attempt-result-view'
import { formatPercent } from '@/lib/tests/format'
import type { PublicTestListItem, TestAttemptSummary } from '@/lib/tests/types'
import { formatShortDay } from '@/lib/utils/dates'

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

type AdminDashboardAttempt = AttemptResultFields & {
	attemptId: string
	testId: string
	testTitle: string
	testSlug: string
	topicSlug: string
	topicTitle: string
	studentId: string
	studentName: string
	submittedAt: string
}

type AdminDashboardData = {
	summary: {
		totalAttempts: number
		activeStudents: number
		averageScore: number | null
		passedAttempts: number
	}
	latestAttempts: AdminDashboardAttempt[]
	dailyActivity: Array<{
		date: string
		attempts: number
		averageScore: number | null
	}>
}

async function fetchAdminJson<T>(url: string): Promise<T | null> {
	return optionalAdminData(await request<T>(url))
}

function average(values: number[]) {
	if (values.length === 0) return 0
	return values.reduce((sum, value) => sum + value, 0) / values.length
}

function dashboardName(firstName?: string | null, login?: string | null) {
	return firstName || login || 'Пользователь'
}

type Stat = {
	label: string
	value: string | number
	loading: boolean
}

function StatCards({ stats }: { stats: Stat[] }) {
	return (
		<div className="grid grid-cols-[repeat(auto-fit,minmax(6.5rem,1fr))] gap-3">
			{stats.map((stat) => (
				<div key={stat.label} className="rounded-3xl border border-border/80 bg-card px-4 py-3">
					{stat.loading ? (
						<Skeleton className="my-0.5 h-6 w-12" />
					) : (
						<p className="text-xl font-semibold text-foreground tabular-nums">{stat.value}</p>
					)}
					<p className="text-xs text-muted-foreground">{stat.label}</p>
				</div>
			))}
		</div>
	)
}

function SectionHeading({ title, children }: { title: string; children?: ReactNode }) {
	return (
		<div className="flex min-h-9 flex-wrap items-center justify-between gap-3">
			<h2 className="text-lg font-semibold text-foreground">{title}</h2>
			{children}
		</div>
	)
}

function EmptyPanel({ children }: { children: ReactNode }) {
	return <div className="rounded-3xl bg-secondary/70 p-unit text-sm text-muted-foreground">{children}</div>
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section className="min-w-0 rounded-3xl border border-border/80 bg-card p-4 shadow-sm tab-sm:p-5">
			<h2 className="mb-4 text-lg font-semibold text-foreground">{title}</h2>
			{children}
		</section>
	)
}

const mainLinkClass =
	'font-medium [overflow-wrap:anywhere] text-foreground transition-colors hover:text-primary focus-visible:underline focus-visible:outline-none'

function testHrefOf(test: PublicTestListItem) {
	return `/tests/${test.topicSlug}/${test.slug}`
}

function AvailableTestsTable({ tests }: { tests: PublicTestListItem[] }) {
	const rowLink = useRowLink()
	return (
		<TableCard>
			<Table className="table-fixed">
				<TableHeader>
					<TableRow className="hover:bg-transparent">
						<TableHead className="pl-4">Тест</TableHead>
						<TableHead className="hidden w-24 text-right tab-sm:table-cell">Вопросы</TableHead>
						<TableHead className="hidden w-24 pr-4 text-right tab-sm:table-cell">Таймер</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{tests.map((test) => (
						<TableRow key={test.id} className="cursor-pointer" {...rowLink(testHrefOf(test))}>
							<TableCell className="py-3 pl-4">
								<Link href={testHrefOf(test)} className={mainLinkClass}>
									{test.title}
								</Link>
								<p className="mt-0.5 text-xs text-muted-foreground">
									{test.topicTitle}
									{test.passingScore != null ? ` · проходной ${formatPercent(test.passingScore)}` : null}
									<span className="tab-sm:hidden">
										{` · вопросов: ${test.questionsCount}`}
										{test.timeLimitMinutes ? ` · ${test.timeLimitMinutes} мин` : null}
									</span>
								</p>
							</TableCell>
							<TableCell className="hidden text-right tabular-nums tab-sm:table-cell">{test.questionsCount}</TableCell>
							<TableCell className="hidden pr-4 text-right whitespace-nowrap text-muted-foreground tabular-nums tab-sm:table-cell">
								{test.timeLimitMinutes ? `${test.timeLimitMinutes} мин` : '—'}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</TableCard>
	)
}

function ResultCell({ attempt, audience }: { attempt: AttemptResultFields; audience: AttemptReviewAudience }) {
	const view = attemptResultView(attempt)
	if (view.kind === 'pending') {
		return (
			<TableCell className="py-3 pr-4 text-right">
				<span className="inline-flex justify-end">
					<AttemptReviewLine view={view} audience={audience} />
				</span>
			</TableCell>
		)
	}
	return (
		<TableCell className="py-3 pr-4 text-right whitespace-nowrap tabular-nums">
			{formatPercent(view.percent)}
			{view.teacherChecked ? (
				<span className="mt-1 flex justify-end">
					<TeacherCheckedMark />
				</span>
			) : null}
		</TableCell>
	)
}

function LatestAttemptsTable({ attempts }: { attempts: DashboardAttempt[] }) {
	const rowLink = useRowLink()
	return (
		<TableCard>
			<Table className="table-fixed">
				<TableHeader>
					<TableRow className="hover:bg-transparent">
						<TableHead className="pl-4">Тест</TableHead>
						<TableHead className="hidden w-24 text-right tab-sm:table-cell">Дата</TableHead>
						<TableHead className="w-40 pr-4 text-right">Результат</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{attempts.map((attempt) => (
						<TableRow key={attempt.id} className="cursor-pointer" {...rowLink(attempt.testHref)}>
							<TableCell className="py-3 pl-4">
								<Link href={attempt.testHref} className={mainLinkClass}>
									{attempt.testTitle}
								</Link>
								<p className="mt-0.5 text-xs text-muted-foreground tab-sm:hidden">
									{formatShortDay(attempt.submittedAt)}
								</p>
							</TableCell>
							<TableCell className="hidden text-right whitespace-nowrap text-muted-foreground tabular-nums tab-sm:table-cell">
								{formatShortDay(attempt.submittedAt)}
							</TableCell>
							<ResultCell attempt={attempt} audience="student" />
						</TableRow>
					))}
				</TableBody>
			</Table>
		</TableCard>
	)
}

function StudentAttemptsTable({ attempts }: { attempts: AdminDashboardAttempt[] }) {
	const rowLink = useRowLink()
	return (
		<TableCard>
			<Table className="table-fixed">
				<TableHeader>
					<TableRow className="hover:bg-transparent">
						<TableHead className="pl-4">Ученик</TableHead>
						<TableHead className="hidden lg:table-cell">Тест</TableHead>
						<TableHead className="hidden w-24 text-right tab-sm:table-cell">Дата</TableHead>
						<TableHead className="w-40 pr-4 text-right">Результат</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{attempts.map((attempt) => {
						const href = `/admin/attempts/${attempt.attemptId}`
						return (
							<TableRow key={attempt.attemptId} className="cursor-pointer" {...rowLink(href)}>
								<TableCell className="py-3 pl-4">
									<Link href={href} className={mainLinkClass}>
										{attempt.studentName}
									</Link>
									<p className="mt-0.5 text-xs [overflow-wrap:anywhere] text-muted-foreground lg:hidden">
										{attempt.testTitle}
										<span className="tab-sm:hidden"> · {formatShortDay(attempt.submittedAt)}</span>
									</p>
								</TableCell>
								<TableCell className="hidden truncate text-muted-foreground lg:table-cell">
									{attempt.testTitle}
								</TableCell>
								<TableCell className="hidden text-right whitespace-nowrap text-muted-foreground tabular-nums tab-sm:table-cell">
									{formatShortDay(attempt.submittedAt)}
								</TableCell>
								<ResultCell attempt={attempt} audience="staff" />
							</TableRow>
						)
					})}
				</TableBody>
			</Table>
		</TableCard>
	)
}

function QuickLinks({ links }: { links: { href: string; title: string }[] }) {
	return (
		<TableCard>
			<ul className="divide-y divide-border">
				{links.map((section) => (
					<li key={section.href}>
						<Link
							href={section.href}
							className="group flex items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:underline focus-visible:outline-none"
						>
							<span>{section.title}</span>
							<ArrowRight
								className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
								aria-hidden="true"
							/>
						</Link>
					</li>
				))}
			</ul>
		</TableCard>
	)
}

export default function DashboardClient() {
	const { me, can, perms } = useAuth()
	const quickLinks = useMemo(() => quickLinkSections(perms), [perms])
	const canReadTests = can('tests', 'read')
	const chartConfigs = useChartConfigs()
	const [now] = useState(() => new Date())

	const testsQuery = useSWR(canReadTests ? null : 'dashboard-public-tests', fetchPublicTestsList)
	const tests = useMemo(() => testsQuery.data?.tests ?? [], [testsQuery.data?.tests])
	const featuredTests = tests.slice(0, 4)

	const attemptsQuery = useSWR(
		!canReadTests && tests.length ? `dashboard-attempts:${tests.map((test) => test.id).join(',')}` : null,
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
		fetchAdminJson<AdminDashboardData>(dashboardUrl())
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
	const finalPercents = allAttempts.flatMap((attempt) => {
		const view = attemptResultView(attempt)
		return view.kind === 'final' ? [view.percent] : []
	})
	const averageScore = finalPercents.length === 0 ? null : Math.round(average(finalPercents))
	const bestPercent = finalPercents.length === 0 ? null : Math.max(...finalPercents)
	const completedTotal = attemptBundles.reduce((sum, bundle) => sum + bundle.total, 0)

	const topics = adminTopicsQuery.data?.topics ?? []
	const adminTests = adminTestsQuery.data?.tests ?? []
	const adminDashboard = adminDashboardQuery.data
	const adminLatestAttempts = adminDashboard?.latestAttempts ?? []
	const teacherAllowed = canReadTests && adminTopicsQuery.data !== null && adminTestsQuery.data !== null
	const publishedCount = adminTests.filter((test) => test.isPublished).length
	const draftCount = adminTests.length - publishedCount
	const totalQuestions = adminTests.reduce((sum, test) => sum + (test.questionsCount ?? 0), 0)
	const heroHref = canReadTests ? '/admin/tests' : (latestAttempt?.testHref ?? '/tests')
	const heroCta = canReadTests ? 'Управление тестами' : latestAttempt ? 'Открыть последний тест' : 'Перейти к тестам'
	const adminSummary = adminDashboard?.summary
	const studentAttemptsLoading = testsQuery.isLoading || attemptsQuery.isLoading
	const statsLoadingAdmin = adminDashboardQuery.isLoading
	const statsLoadingCatalog = adminTopicsQuery.isLoading || adminTestsQuery.isLoading
	const stats: Stat[] = canReadTests
		? [
				{ label: 'попыток студентов', value: adminSummary?.totalAttempts ?? 0, loading: statsLoadingAdmin },
				{ label: 'активных студентов', value: adminSummary?.activeStudents ?? 0, loading: statsLoadingAdmin },
				{
					label: 'средний балл',
					value: adminSummary?.averageScore != null ? `${Math.round(adminSummary.averageScore)}%` : '—',
					loading: statsLoadingAdmin,
				},
				...(statsLoadingCatalog || teacherAllowed
					? [
							{ label: 'темы', value: topics.length, loading: statsLoadingCatalog },
							{ label: 'опубликовано', value: publishedCount, loading: statsLoadingCatalog },
							{ label: 'черновики', value: draftCount, loading: statsLoadingCatalog },
							{ label: 'вопросов', value: totalQuestions, loading: statsLoadingCatalog },
						]
					: []),
			]
		: [
				{ label: 'завершено', value: completedTotal, loading: studentAttemptsLoading },
				{
					label: 'средний балл',
					value: averageScore === null ? '—' : `${averageScore}%`,
					loading: studentAttemptsLoading,
				},
				{
					label: 'лучший результат',
					value: bestPercent === null ? '—' : formatPercent(bestPercent),
					loading: studentAttemptsLoading,
				},
			]

	return (
		<div className="space-y-6">
			<PageHeader title={dashboardName(me?.firstName, me?.login)}>
				<Button asChild className="h-10 rounded-full px-5">
					<Link href={heroHref}>
						{heroCta}
						<ArrowRight className="size-4" aria-hidden="true" />
					</Link>
				</Button>
			</PageHeader>

			<StatCards stats={stats} />

			{canReadTests ? null : (
				<div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-2">
					<section className="space-y-3">
						<SectionHeading title="Доступные тесты">
							<Button asChild variant="outline" size="sm" className="rounded-full bg-card">
								<Link href="/tests">Все доступные</Link>
							</Button>
						</SectionHeading>
						{testsQuery.isLoading ? (
							<Skeleton className="h-48 rounded-3xl" aria-label="Загрузка тестов" />
						) : featuredTests.length === 0 ? (
							<EmptyState description="Назначенных тестов пока нет." className="py-10" />
						) : (
							<AvailableTestsTable tests={featuredTests} />
						)}
					</section>

					<section className="space-y-3">
						<SectionHeading title="Последние попытки" />
						{studentAttemptsLoading ? (
							<Skeleton className="h-48 rounded-3xl" aria-label="Загрузка попыток" />
						) : latestAttempts.length === 0 ? (
							<EmptyState description="История появится после первой попытки." className="py-10" />
						) : (
							<LatestAttemptsTable attempts={latestAttempts} />
						)}
					</section>
				</div>
			)}

			{canReadTests ? (
				<div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_23.75rem]">
					<section className="space-y-3">
						<SectionHeading title="Последние попытки студентов" />
						{adminDashboardQuery.isLoading ? (
							<Skeleton className="h-48 rounded-3xl" aria-label="Загрузка попыток" />
						) : adminLatestAttempts.length === 0 ? (
							<EmptyState description="Студенты пока не завершали тесты." className="py-10" />
						) : (
							<StudentAttemptsTable attempts={adminLatestAttempts.slice(0, 5)} />
						)}
					</section>

					<section className="space-y-3">
						<SectionHeading title="Управление" />
						<QuickLinks links={quickLinks} />
					</section>
				</div>
			) : null}

			{canReadTests ? null : <StudentProgressSection />}

			{canReadTests ? (
				<div className="grid gap-4 xl:grid-cols-2">
					<ChartCard title="Публикации и наполнение">
						{adminTopicsQuery.isLoading || adminTestsQuery.isLoading ? (
							<Skeleton className="h-72 rounded-2xl" />
						) : topics.length === 0 ? (
							<EmptyPanel>
								{can('zone', 'all')
									? 'Нет тем для отображения.'
									: 'Вам ещё не закреплены темы. Обратитесь к администратору.'}
							</EmptyPanel>
						) : (
							<ContentChart topics={topics} tests={adminTests} config={chartConfigs.content} />
						)}
					</ChartCard>
					<ChartCard title="Активность учеников">
						{adminDashboardQuery.isLoading ? (
							<Skeleton className="h-72 rounded-2xl" />
						) : !adminDashboard ? (
							<EmptyPanel>Нет данных об активности.</EmptyPanel>
						) : (
							<ActivityChart days={adminDashboard.dailyActivity} config={chartConfigs.activity} now={now} />
						)}
					</ChartCard>
				</div>
			) : null}
		</div>
	)
}

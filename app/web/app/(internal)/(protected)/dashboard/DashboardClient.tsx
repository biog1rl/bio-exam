'use client'

import { useMemo, useState, type ReactNode } from 'react'

import { ArrowRight } from 'lucide-react'
import Link from 'next/link'
import useSWR from 'swr'

import { ActivityChart, ContentChart } from '@/components/charts/DashboardCharts'
import { EmptyState } from '@/components/page/EmptyState'
import { PageHeader } from '@/components/page/PageHeader'
import { Panel } from '@/components/page/Panel'
import { StudentProgressSection } from '@/components/progress/StudentProgressSection'
import { useAuth } from '@/components/providers/AuthProvider'
import { TableCard } from '@/components/table/TableCard'
import { mainLinkClass } from '@/components/table/main-link'
import { useRowLink } from '@/components/table/use-row-link'
import { AttemptResultCells, AttemptResultHeads } from '@/components/tests/attempt-result/AttemptResultColumns'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useChartConfigs } from '@/lib/charts/api'
import { deniedAsNull } from '@/lib/http/swr'
import { quickLinkSections } from '@/lib/navigation/sections'
import { adminTestsKeys, adminTestsListFetcher, topicsListFetcher } from '@/lib/tests/admin-api'
import { fetchMyTestAttempts, fetchPublicTestsList } from '@/lib/tests/api'
import { attemptMetaLine, attemptResultView } from '@/lib/tests/attempt-result-view'
import { adminDashboardFetcher, adminDashboardKey, type AdminDashboardAttempt } from '@/lib/tests/dashboard-api'
import { formatPercent } from '@/lib/tests/format'
import type { PublicTestListItem, TestAttemptSummary } from '@/lib/tests/types'
import { cn } from '@/lib/utils/cn'
import { formatShortDay } from '@/lib/utils/dates'

type AttemptBundle = {
	test: PublicTestListItem
	rows: TestAttemptSummary[]
	total: number
}

type DashboardAttempt = TestAttemptSummary & {
	testTitle: string
	testHref: string
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

function StatGroup({ stats, className }: { stats: Stat[]; className: string }) {
	return (
		<div className={cn('grid gap-3', className)}>
			{stats.map((stat) => (
				<div key={stat.label} className="rounded-3xl border border-border/80 bg-card px-4 py-3 shadow-sm">
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

function StatCards({ people, bank }: { people: Stat[]; bank: Stat[] }) {
	return (
		<div className={cn('grid gap-3', bank.length > 0 && 'lg:grid-cols-[3fr_4fr]')}>
			<StatGroup stats={people} className="grid-cols-3" />
			{bank.length > 0 ? <StatGroup stats={bank} className="grid-cols-2 tab-sm:grid-cols-4" /> : null}
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

function LatestAttemptsTable({ attempts }: { attempts: DashboardAttempt[] }) {
	const rowLink = useRowLink()
	return (
		<TableCard>
			<Table className="table-fixed">
				<TableHeader>
					<TableRow className="hover:bg-transparent">
						<TableHead className="pl-4">Тест</TableHead>
						<TableHead className="hidden w-24 text-right tab-sm:table-cell">Дата</TableHead>
						<AttemptResultHeads />
					</TableRow>
				</TableHeader>
				<TableBody>
					{attempts.map((attempt) => {
						const view = attemptResultView(attempt)
						return (
							<TableRow key={attempt.id} className="cursor-pointer" {...rowLink(attempt.testHref)}>
								<TableCell className="py-3 pl-4">
									<Link href={attempt.testHref} className={mainLinkClass}>
										{attempt.testTitle}
									</Link>
									<p className="mt-0.5 text-xs text-muted-foreground tab-sm:hidden">
										{attemptMetaLine([formatShortDay(attempt.submittedAt)], view)}
									</p>
								</TableCell>
								<TableCell className="hidden text-right whitespace-nowrap text-muted-foreground tabular-nums tab-sm:table-cell">
									{formatShortDay(attempt.submittedAt)}
								</TableCell>
								<AttemptResultCells view={view} />
							</TableRow>
						)
					})}
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
						<TableHead className="hidden 2xl:table-cell">Тест</TableHead>
						<TableHead className="hidden w-24 text-right lg:table-cell">Дата</TableHead>
						<AttemptResultHeads from="lg" />
					</TableRow>
				</TableHeader>
				<TableBody>
					{attempts.map((attempt) => {
						const href = `/admin/attempts/${attempt.attemptId}`
						const view = attemptResultView(attempt)
						return (
							<TableRow key={attempt.attemptId} className="cursor-pointer" {...rowLink(href)}>
								<TableCell className="py-3 pl-4">
									<Link href={href} className={mainLinkClass}>
										{attempt.studentName}
									</Link>
									<p className="mt-0.5 text-xs [overflow-wrap:anywhere] text-muted-foreground 2xl:hidden">
										{attempt.testTitle}
									</p>
									<p className="mt-0.5 text-xs text-muted-foreground lg:hidden">
										{attemptMetaLine([formatShortDay(attempt.submittedAt)], view)}
									</p>
								</TableCell>
								<TableCell className="hidden truncate text-muted-foreground 2xl:table-cell">
									{attempt.testTitle}
								</TableCell>
								<TableCell className="hidden text-right whitespace-nowrap text-muted-foreground tabular-nums lg:table-cell">
									{formatShortDay(attempt.submittedAt)}
								</TableCell>
								<AttemptResultCells view={view} from="lg" />
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

	const adminTopicsQuery = useSWR(canReadTests ? adminTestsKeys.topics() : null, deniedAsNull(topicsListFetcher))
	const adminTestsQuery = useSWR(canReadTests ? adminTestsKeys.list() : null, deniedAsNull(adminTestsListFetcher))
	const adminDashboardQuery = useSWR(canReadTests ? adminDashboardKey() : null, deniedAsNull(adminDashboardFetcher))

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
	const adminSummary = adminDashboard?.summary
	const studentAttemptsLoading = testsQuery.isLoading || attemptsQuery.isLoading
	const statsLoadingAdmin = adminDashboardQuery.isLoading
	const statsLoadingCatalog = adminTopicsQuery.isLoading || adminTestsQuery.isLoading
	const peopleStats: Stat[] = canReadTests
		? [
				{ label: 'попыток студентов', value: adminSummary?.totalAttempts ?? 0, loading: statsLoadingAdmin },
				{ label: 'активных студентов', value: adminSummary?.activeStudents ?? 0, loading: statsLoadingAdmin },
				{
					label: 'средний балл',
					value: adminSummary?.averageScore != null ? `${Math.round(adminSummary.averageScore)}%` : '—',
					loading: statsLoadingAdmin,
				},
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
	const bankStats: Stat[] =
		canReadTests && (statsLoadingCatalog || teacherAllowed)
			? [
					{ label: 'темы', value: topics.length, loading: statsLoadingCatalog },
					{ label: 'опубликовано', value: publishedCount, loading: statsLoadingCatalog },
					{ label: 'черновики', value: draftCount, loading: statsLoadingCatalog },
					{ label: 'вопросов', value: totalQuestions, loading: statsLoadingCatalog },
				]
			: []

	return (
		<div className="space-y-6">
			<PageHeader title={dashboardName(me?.firstName, me?.login)} />

			<StatCards people={peopleStats} bank={bankStats} />

			{canReadTests ? null : (
				<div className="grid grid-cols-[minmax(0,1fr)] gap-6 3xl:grid-cols-2">
					<section className="space-y-3">
						<SectionHeading title="Доступные тесты">
							<Button asChild variant="outline" size="sm" className="rounded-full bg-card">
								<Link href="/tests">Все доступные</Link>
							</Button>
						</SectionHeading>
						{testsQuery.isLoading ? (
							<Skeleton className="h-48 rounded-3xl" aria-label="Загрузка тестов" />
						) : featuredTests.length === 0 ? (
							<EmptyState description="Назначенных тестов пока нет." />
						) : (
							<AvailableTestsTable tests={featuredTests} />
						)}
					</section>

					<section className="space-y-3">
						<SectionHeading title="Последние попытки" />
						{studentAttemptsLoading ? (
							<Skeleton className="h-48 rounded-3xl" aria-label="Загрузка попыток" />
						) : latestAttempts.length === 0 ? (
							<EmptyState description="История появится после первой попытки." />
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
							<EmptyState description="Ученики пока не завершали тесты." />
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
					<Panel title="Публикации и наполнение">
						{adminTopicsQuery.isLoading || adminTestsQuery.isLoading ? (
							<Skeleton className="h-72 rounded-2xl" />
						) : topics.length === 0 ? (
							<EmptyState
								size="sm"
								description={
									can('zone', 'all')
										? 'Нет тем для отображения.'
										: 'Вам ещё не закреплены темы. Обратитесь к администратору.'
								}
							/>
						) : (
							<ContentChart topics={topics} tests={adminTests} config={chartConfigs.content} />
						)}
					</Panel>
					<Panel title="Активность учеников">
						{adminDashboardQuery.isLoading ? (
							<Skeleton className="h-72 rounded-2xl" />
						) : !adminDashboard ? (
							<EmptyState size="sm" description="Нет данных об активности." />
						) : (
							<ActivityChart days={adminDashboard.dailyActivity} config={chartConfigs.activity} now={now} />
						)}
					</Panel>
				</div>
			) : null}
		</div>
	)
}

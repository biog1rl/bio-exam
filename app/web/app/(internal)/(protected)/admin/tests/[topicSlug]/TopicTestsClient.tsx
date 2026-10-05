'use client'

import { useMemo, useState } from 'react'

import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import useSWR from 'swr'

import { SetBreadcrumbsLabels } from '@/components/Breadcrumbs/SetBreadcrumbsLabels'
import { AccessDeniedState } from '@/components/auth/AccessDeniedState'
import { LoadErrorAlert } from '@/components/feedback/LoadErrorAlert'
import { useAuth } from '@/components/providers/AuthProvider'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useUiAlertDialog } from '@/components/ui/use-ui-alert-dialog'
import { saveBlob } from '@/lib/http/download'
import { exportFailureMessage, failureMessage } from '@/lib/http/errors'
import {
	adminTestsKeys,
	adminTestsListFetcher,
	deleteTest,
	deleteTopic,
	exportTestArchive,
	exportTopicArchive,
	topicsListFetcher,
} from '@/lib/tests/admin-api'
import {
	TOPICS_BACK_LABEL,
	TOPIC_DENIED_DESCRIPTION,
	TOPIC_DENIED_TITLE,
	canManageCatalog,
	deleteTestToast,
	topicPageState,
} from '@/lib/tests/bank-view'

import { TopicFormDialog } from '../components/TopicFormDialog'
import { TopicEmptyState } from '../components/topic-page/TopicEmptyState'
import { TopicHero } from '../components/topic-page/TopicHero'
import { TopicStatsPanel } from '../components/topic-page/TopicStatsPanel'
import { TopicTestCard } from '../components/topic-page/TopicTestCard'
import { getTopicStats, getTopicTests } from '../components/topic-page/topic-page-utils'
import type { Test, Topic } from '../types'

const exportOutcomeToast = (outcome: Awaited<ReturnType<typeof exportTestArchive>>, success: string) => {
	if (outcome.ok) {
		saveBlob(outcome.data.blob, outcome.data.filename)
		toast.success(success)
		return
	}
	const message = exportFailureMessage(outcome, 'Ошибка экспорта')
	if (message) toast.error(message)
}

function LoadingTopicPage() {
	return (
		<div className="space-y-5">
			<Skeleton className="h-88 rounded-4xl" />
			<div className="grid gap-3 tab-sm:grid-cols-2 tab:grid-cols-5">
				<Skeleton className="h-32 rounded-3xl" />
				<Skeleton className="h-32 rounded-3xl" />
				<Skeleton className="h-32 rounded-3xl" />
				<Skeleton className="h-32 rounded-3xl" />
				<Skeleton className="h-32 rounded-3xl" />
			</div>
			<Skeleton className="h-40 rounded-4xl" />
			<Skeleton className="h-40 rounded-4xl" />
		</div>
	)
}

export default function TopicTestsClient({ topicSlug }: { topicSlug: string }) {
	const router = useRouter()
	const { confirm, alertDialog } = useUiAlertDialog()
	const { can, perms, loading: authLoading } = useAuth()
	const catalog = canManageCatalog(perms)
	const [topicDialogOpen, setTopicDialogOpen] = useState(false)

	const {
		data: topicsData,
		mutate: mutateTopics,
		error: topicsError,
	} = useSWR(adminTestsKeys.topics(), topicsListFetcher, { revalidateOnFocus: false })
	const {
		data: testsData,
		mutate: mutateTests,
		error: testsError,
	} = useSWR(adminTestsKeys.list(), adminTestsListFetcher)
	const testsFailed = testsError !== undefined && testsData === undefined
	const testsPending = testsData === undefined

	const topics = useMemo(() => topicsData?.topics ?? [], [topicsData?.topics])
	const allTests = useMemo(() => testsData?.tests ?? [], [testsData?.tests])
	const topic = useMemo(() => topics.find((item) => item.slug === topicSlug) ?? null, [topicSlug, topics])
	const topicTests = useMemo(() => getTopicTests(allTests, topic, topicSlug), [allTests, topic, topicSlug])
	const stats = useMemo(() => getTopicStats(topicTests), [topicTests])

	const handleExportTopic = async (withAnswers: boolean) => {
		exportOutcomeToast(await exportTopicArchive(topicSlug, withAnswers), 'Тема экспортирована')
	}

	const handleExportTest = async (test: Test, withAnswers: boolean) => {
		exportOutcomeToast(await exportTestArchive(test.id, withAnswers), 'Тест экспортирован')
	}

	const handleDeleteTest = async (test: Test) => {
		const confirmed = await confirm({
			title: 'Удалить тест?',
			description: `Тест "${test.title}" будет удален без возможности восстановления.`,
			confirmText: 'Удалить',
			cancelText: 'Отмена',
			destructive: true,
		})
		if (!confirmed) return

		const outcome = await deleteTest(test.id)
		if (!outcome.ok && (outcome.kind === 'auth' || outcome.kind === 'aborted')) return

		const result = outcome.ok ? deleteTestToast(outcome.status) : deleteTestToast(outcome.status ?? 0, outcome.body)
		if (result.kind === 'success') {
			toast.success(result.message)
			mutateTests()
		} else {
			toast.error(result.message)
		}
	}

	const handleDeleteTopic = async (topicToDelete: Topic) => {
		const confirmed = await confirm({
			title: 'Удалить тему?',
			description: `Тема "${topicToDelete.title}" и все её тесты будут удалены.`,
			confirmText: 'Удалить',
			cancelText: 'Отмена',
			destructive: true,
		})
		if (!confirmed) return

		const outcome = await deleteTopic(topicToDelete.id)
		if (!outcome.ok) {
			const message = failureMessage(outcome, 'Ошибка удаления темы')
			if (message) toast.error(message)
			return
		}

		toast.success('Тема удалена')
		await mutateTopics()
		await mutateTests()
		router.push('/admin/tests')
	}

	if (topicsError !== undefined && topicsData === undefined) {
		return <LoadErrorAlert title="Не удалось загрузить тему" error={topicsError} onRetry={() => mutateTopics()} />
	}

	if (topicsData === undefined || authLoading) {
		return <LoadingTopicPage />
	}

	const pageState = topicPageState({ topicFound: Boolean(topic), zoneAll: can('zone', 'all') })

	if (pageState === 'denied') {
		return (
			<AccessDeniedState
				title={TOPIC_DENIED_TITLE}
				description={TOPIC_DENIED_DESCRIPTION}
				backHref="/admin/tests"
				backLabel={TOPICS_BACK_LABEL}
			/>
		)
	}

	if (!topic) {
		return (
			<>
				<TopicEmptyState
					title="Тема не найдена"
					description="Проверьте адрес или вернитесь к списку тем. Возможно, slug был изменен после редактирования темы."
				/>
				{alertDialog}
			</>
		)
	}

	return (
		<div className="space-y-5">
			<SetBreadcrumbsLabels labels={{ [`/admin/tests/${topic.slug}`]: topic.title }} />

			<div className="flex">
				<Button variant="ghost" asChild className="rounded-full">
					<Link href="/admin/tests">
						<ArrowLeft className="size-4" />
						Все темы
					</Link>
				</Button>
			</div>

			<TopicHero
				topic={topic}
				stats={testsPending ? null : stats}
				canManageCatalog={catalog}
				onEditTopic={() => setTopicDialogOpen(true)}
				onExportTopic={handleExportTopic}
				onDeleteTopic={() => handleDeleteTopic(topic)}
			/>

			<section aria-label="Статистика темы">
				{testsFailed ? (
					<LoadErrorAlert title="Не удалось загрузить статистику" error={testsError} onRetry={() => mutateTests()} />
				) : testsPending ? (
					<Skeleton className="h-32 w-full" />
				) : (
					<TopicStatsPanel stats={stats} />
				)}
			</section>

			<section className="space-y-3">
				<div className="flex flex-col gap-3 tab-sm:flex-row tab-sm:items-end tab-sm:justify-between">
					<div>
						<p className="font-mono text-[0.6875rem] tracking-[0.22em] text-muted-foreground uppercase">тесты темы</p>
						<h2 className="mt-2 font-serif text-3xl">Материалы</h2>
					</div>
					<div className="inline-flex w-fit rounded-full bg-secondary px-4 py-2 text-sm text-muted-foreground">
						{testsPending ? '…' : topicTests.length} тестов
					</div>
				</div>

				{testsFailed ? (
					<LoadErrorAlert title="Не удалось загрузить тесты" error={testsError} onRetry={() => mutateTests()} />
				) : testsPending ? (
					<Skeleton className="h-40 w-full" />
				) : topicTests.length === 0 ? (
					<TopicEmptyState
						title="В теме пока нет тестов"
						description="Создайте первый тест и привяжите его к этой теме в настройках редактора."
						showCreateAction
					/>
				) : (
					<div className="space-y-3">
						{topicTests.map((test) => (
							<TopicTestCard
								key={test.id}
								test={test}
								onExportTest={handleExportTest}
								onDeleteTest={handleDeleteTest}
							/>
						))}
					</div>
				)}
			</section>

			{catalog ? (
				<TopicFormDialog
					open={topicDialogOpen}
					onOpenChange={setTopicDialogOpen}
					editingTopic={topic}
					initialOrder={topics.length}
					showIsActive
					onSaved={() => {
						mutateTopics()
						mutateTests()
					}}
				/>
			) : null}
			{alertDialog}
		</div>
	)
}

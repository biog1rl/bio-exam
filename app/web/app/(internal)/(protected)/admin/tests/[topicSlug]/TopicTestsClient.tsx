'use client'

import { useMemo, useState } from 'react'

import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import useSWR from 'swr'

import { SetBreadcrumbsLabels } from '@/components/Breadcrumbs/SetBreadcrumbsLabels'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useUiAlertDialog } from '@/components/ui/use-ui-alert-dialog'
import { apiFetch } from '@/lib/api-fetch'

import { TopicFormDialog } from '../components/TopicFormDialog'
import { TopicEmptyState } from '../components/topic-page/TopicEmptyState'
import { TopicHero } from '../components/topic-page/TopicHero'
import { TopicStatsPanel } from '../components/topic-page/TopicStatsPanel'
import { TopicTestCard } from '../components/topic-page/TopicTestCard'
import { getTopicStats, getTopicTests } from '../components/topic-page/topic-page-utils'
import type { Test, Topic, TopicsResponse, TestsResponse } from '../types'

const fetcher = (url: string) => fetch(url, { credentials: 'include' }).then((r) => r.json())

function LoadingTopicPage() {
	return (
		<div className="space-y-5">
			<Skeleton className="h-88 rounded-4xl" />
			<div className="tab-sm:grid-cols-2 tab:grid-cols-5 grid gap-3">
				<Skeleton className="h-32 rounded-3xl" />
				<Skeleton className="h-32 rounded-3xl" />
				<Skeleton className="h-32 rounded-3xl" />
				<Skeleton className="h-32 rounded-3xl" />
				<Skeleton className="h-32 rounded-3xl" />
			</div>
			<Skeleton className="rounded-4xl h-40" />
			<Skeleton className="rounded-4xl h-40" />
		</div>
	)
}

export default function TopicTestsClient({ topicSlug }: { topicSlug: string }) {
	const router = useRouter()
	const { confirm, alertDialog } = useUiAlertDialog()
	const [topicDialogOpen, setTopicDialogOpen] = useState(false)

	const {
		data: topicsData,
		mutate: mutateTopics,
		isLoading: topicsLoading,
	} = useSWR<TopicsResponse>('/api/tests/topics', fetcher)
	const { data: testsData, mutate: mutateTests, isLoading: testsLoading } = useSWR<TestsResponse>('/api/tests', fetcher)

	const topics = useMemo(() => topicsData?.topics ?? [], [topicsData?.topics])
	const allTests = useMemo(() => testsData?.tests ?? [], [testsData?.tests])
	const topic = useMemo(() => topics.find((item) => item.slug === topicSlug) ?? null, [topicSlug, topics])
	const topicTests = useMemo(() => getTopicTests(allTests, topic, topicSlug), [allTests, topic, topicSlug])
	const stats = useMemo(() => getTopicStats(topicTests), [topicTests])
	const isLoading = topicsLoading || testsLoading

	const handleExportTopic = async (withAnswers: boolean) => {
		try {
			const res = await apiFetch(`/api/tests/topics/${topicSlug}/export?withAnswers=${withAnswers}`)

			if (!res.ok) throw new Error('Ошибка экспорта')

			const blob = await res.blob()
			const url = URL.createObjectURL(blob)
			const a = document.createElement('a')
			a.href = url
			a.download = `${topicSlug}.zip`
			a.click()
			URL.revokeObjectURL(url)

			toast.success('Тема экспортирована')
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Ошибка экспорта')
		}
	}

	const handleExportTest = async (test: Test, withAnswers: boolean) => {
		try {
			const res = await apiFetch(`/api/tests/${test.id}/export?withAnswers=${withAnswers}`)

			if (!res.ok) throw new Error('Ошибка экспорта')

			const blob = await res.blob()
			const url = URL.createObjectURL(blob)
			const a = document.createElement('a')
			a.href = url
			a.download = res.headers.get('content-disposition')?.split('filename=')[1]?.replace(/"/g, '') || 'test.zip'
			a.click()
			URL.revokeObjectURL(url)

			toast.success('Тест экспортирован')
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Ошибка экспорта')
		}
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

		try {
			const res = await apiFetch(`/api/tests/${test.id}`, { method: 'DELETE' })

			if (!res.ok) throw new Error('Ошибка удаления')

			toast.success('Тест удален')
			mutateTests()
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Ошибка удаления теста')
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

		try {
			const res = await apiFetch(`/api/tests/topics/${topicToDelete.id}`, { method: 'DELETE' })

			if (!res.ok) throw new Error('Ошибка удаления')

			toast.success('Тема удалена')
			await mutateTopics()
			await mutateTests()
			router.push('/admin/tests')
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Ошибка удаления темы')
		}
	}

	if (isLoading) {
		return <LoadingTopicPage />
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
				stats={stats}
				onEditTopic={() => setTopicDialogOpen(true)}
				onExportTopic={handleExportTopic}
				onDeleteTopic={() => handleDeleteTopic(topic)}
			/>

			<TopicStatsPanel stats={stats} />

			<section className="space-y-3">
				<div className="tab-sm:flex-row tab-sm:items-end tab-sm:justify-between flex flex-col gap-3">
					<div>
						<p className="text-muted-foreground font-mono text-[0.6875rem] uppercase tracking-[0.22em]">тесты темы</p>
						<h2 className="mt-2 font-serif text-3xl">Материалы</h2>
					</div>
					<div className="bg-secondary text-muted-foreground inline-flex w-fit rounded-full px-4 py-2 text-sm">
						{topicTests.length} тестов
					</div>
				</div>

				{topicTests.length === 0 ? (
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
			{alertDialog}
		</div>
	)
}

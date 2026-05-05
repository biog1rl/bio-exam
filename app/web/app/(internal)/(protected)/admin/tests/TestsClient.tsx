'use client'

import { useMemo, useState } from 'react'

import {
	BookOpen,
	ArrowRight,
	CheckCircle2,
	Clock3,
	Download,
	Edit,
	EyeOff,
	FileText,
	FolderPlus,
	Layers3,
	MoreHorizontal,
	Plus,
	Shapes,
	SlidersHorizontal,
	Trash2,
} from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import useSWR from 'swr'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { useUiAlertDialog } from '@/components/ui/use-ui-alert-dialog'
import { apiFetch } from '@/lib/api-fetch'
import { cn } from '@/lib/utils/cn'

import { TopicFormDialog } from './components/TopicFormDialog'
import type { Test, Topic, TopicsResponse, TestsResponse } from './types'

const fetcher = (url: string) => fetch(url, { credentials: 'include' }).then((r) => r.json())

const interactiveClass =
	'transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'

function formatDate(value?: string) {
	if (!value) return 'нет даты'
	return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short' }).format(new Date(value))
}

function StatTile({ label, value, icon: Icon }: { label: string; value: string | number; icon: typeof BookOpen }) {
	return (
		<div className="border-border/70 bg-secondary/70 p-unit rounded-3xl border">
			<Icon className="text-primary mb-5 size-5" />
			<p className="tab-sm:text-4xl font-serif text-3xl leading-none">{value}</p>
			<p className="text-muted-foreground mt-2 text-sm">{label}</p>
		</div>
	)
}

function LoadingState() {
	return (
		<div className="tab:grid-cols-[23.75rem_1fr] grid gap-5">
			<Skeleton className="h-105 rounded-4xl" />
			<div className="space-y-3">
				<Skeleton className="rounded-4xl h-32" />
				<Skeleton className="rounded-4xl h-32" />
				<Skeleton className="rounded-4xl h-32" />
			</div>
		</div>
	)
}

export default function TestsClient() {
	const { confirm, alertDialog } = useUiAlertDialog()
	const {
		data: topicsData,
		mutate: mutateTopics,
		isLoading: topicsLoading,
	} = useSWR<TopicsResponse>('/api/tests/topics', fetcher)
	const { data: testsData, mutate: mutateTests, isLoading: testsLoading } = useSWR<TestsResponse>('/api/tests', fetcher)

	const [selectedTopic, setSelectedTopic] = useState<string | null>(null)
	const [topicDialogOpen, setTopicDialogOpen] = useState(false)
	const [editingTopic, setEditingTopic] = useState<Topic | null>(null)

	const topics = useMemo(() => topicsData?.topics ?? [], [topicsData?.topics])
	const allTests = useMemo(() => testsData?.tests ?? [], [testsData?.tests])
	const filteredTests = selectedTopic ? allTests.filter((test) => test.topicId === selectedTopic) : allTests
	const selectedTopicData = topics.find((topic) => topic.id === selectedTopic) ?? null
	const publishedCount = allTests.filter((test) => test.isPublished).length
	const draftCount = allTests.length - publishedCount
	const totalQuestions = allTests.reduce((sum, test) => sum + (test.questionsCount ?? 0), 0)
	const topicRows = useMemo(
		() => [{ id: null, title: 'Все тесты', testsCount: allTests.length }, ...topics],
		[allTests.length, topics]
	)

	const handleCreateTopic = () => {
		setEditingTopic(null)
		setTopicDialogOpen(true)
	}

	const handleEditTopic = (topic: Topic) => {
		setEditingTopic(topic)
		setTopicDialogOpen(true)
	}

	const handleDeleteTopic = async (topic: Topic) => {
		const confirmed = await confirm({
			title: 'Удалить тему?',
			description: `Тема "${topic.title}" и все её тесты будут удалены.`,
			confirmText: 'Удалить',
			cancelText: 'Отмена',
			destructive: true,
		})
		if (!confirmed) return

		try {
			const res = await apiFetch(`/api/tests/topics/${topic.id}`, {
				method: 'DELETE',
			})

			if (!res.ok) throw new Error('Ошибка удаления')

			toast.success('Тема удалена')
			if (selectedTopic === topic.id) setSelectedTopic(null)
			mutateTopics()
			mutateTests()
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Ошибка удаления темы')
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
			const res = await apiFetch(`/api/tests/${test.id}`, {
				method: 'DELETE',
			})

			if (!res.ok) throw new Error('Ошибка удаления')

			toast.success('Тест удален')
			mutateTests()
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Ошибка удаления теста')
		}
	}

	const handleExport = async (testId: string, withAnswers: boolean) => {
		try {
			const res = await apiFetch(`/api/tests/${testId}/export?withAnswers=${withAnswers}`)

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

	const handleExportTopic = async (topicSlug: string, withAnswers: boolean) => {
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

	return (
		<div className="space-y-5">
			<section className="rounded-4xl border-border/80 bg-card/90 p-unit-mob tab-sm:p-unit border shadow-sm">
				<div className="tab:flex-row tab:items-end tab:justify-between flex flex-col gap-6">
					<div>
						<p className="text-muted-foreground font-mono text-[0.6875rem] uppercase tracking-[0.22em]">банк заданий</p>
						<h1 className="text-foreground tab-sm:text-5xl mob:text-4xl mt-2 max-w-3xl font-serif text-3xl leading-none">
							Тесты и темы
						</h1>
					</div>
					<div className="flex flex-wrap gap-2">
						<Button variant="outline" asChild className="-sm bg-card mob:w-auto w-full rounded-full transition-all">
							<Link href="/admin/tests/scoring">
								<SlidersHorizontal className="size-4" />
								Баллы
							</Link>
						</Button>
						<Button variant="outline" asChild className="-sm bg-card mob:w-auto w-full rounded-full transition-all">
							<Link href="/admin/tests/question-types">
								<Shapes className="size-4" />
								Типы вопросов
							</Link>
						</Button>
						<Button
							variant="outline"
							onClick={handleCreateTopic}
							className="-sm bg-card mob:w-auto w-full rounded-full transition-all"
						>
							<FolderPlus className="size-4" />
							Новая тема
						</Button>
						<Button asChild className="-md mob:w-auto w-full rounded-full transition-all">
							<Link href="/admin/tests/new">
								<Plus className="size-4" />
								Новый тест
							</Link>
						</Button>
					</div>
				</div>

				<div className="tab-sm:grid-cols-2 tab:grid-cols-4 mt-8 grid gap-3">
					<StatTile label="всего тестов" value={allTests.length} icon={BookOpen} />
					<StatTile label="опубликовано" value={publishedCount} icon={CheckCircle2} />
					<StatTile label="черновики" value={draftCount} icon={FileText} />
					<StatTile label="вопросов" value={totalQuestions} icon={Layers3} />
				</div>
			</section>

			{topicsLoading || testsLoading ? (
				<LoadingState />
			) : (
				<section className="grid gap-5 xl:grid-cols-[23.75rem_1fr]">
					<aside className="top-unit rounded-4xl border-border/80 bg-card/90 p-unit-mob tab-sm:p-unit h-fit border shadow-sm xl:sticky">
						<div className="flex items-start justify-between gap-3">
							<div>
								<p className="text-muted-foreground font-mono text-[0.6875rem] uppercase tracking-[0.22em]">темы</p>
								<h2 className="mt-2 font-serif text-2xl">Навигация</h2>
							</div>
							<Button variant="outline" size="icon" onClick={handleCreateTopic} className="bg-card rounded-full">
								<FolderPlus className="size-4" />
							</Button>
						</div>

						<div className="mt-6 space-y-2">
							{topicRows.map((topic) => {
								const isAll = topic.id === null
								const isSelected = selectedTopic === topic.id
								return (
									<div key={topic.id ?? 'all'} className="group flex items-center gap-2">
										<button
											type="button"
											onClick={() => setSelectedTopic(topic.id)}
											className={cn(
												'p-unit hover:bg-secondary/70 flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-3xl border border-transparent text-left',
												interactiveClass,
												isSelected && 'border-border bg-secondary text-secondary-foreground border'
											)}
										>
											<BookOpen className="text-primary size-4 shrink-0" />
											<span className="min-w-0 flex-1 truncate text-sm font-medium">{topic.title}</span>
											{!isAll && 'isActive' in topic && !topic.isActive ? (
												<EyeOff className="text-muted-foreground size-3.5" />
											) : null}
											<span className="bg-card text-muted-foreground rounded-full px-3 py-1 text-xs">
												{topic.testsCount ?? 0}
											</span>
										</button>
										{isAll ? null : (
											<DropdownMenu>
												<DropdownMenuTrigger asChild>
													<Button
														variant="ghost"
														size="icon"
														className="rounded-full opacity-0 group-hover:opacity-100"
													>
														<MoreHorizontal className="size-4" />
													</Button>
												</DropdownMenuTrigger>
												<DropdownMenuContent align="end">
													<DropdownMenuItem onClick={() => handleEditTopic(topic as Topic)}>
														<Edit className="mr-2 size-4" />
														Редактировать
													</DropdownMenuItem>
													<DropdownMenuItem asChild>
														<Link href={`/admin/tests/${(topic as Topic).slug}`}>
															<ArrowRight className="mr-2 size-4" />
															Открыть тему
														</Link>
													</DropdownMenuItem>
													<DropdownMenuItem onClick={() => handleExportTopic((topic as Topic).slug, false)}>
														<Download className="mr-2 size-4" />
														Экспорт
													</DropdownMenuItem>
													<DropdownMenuItem onClick={() => handleExportTopic((topic as Topic).slug, true)}>
														<Download className="mr-2 size-4" />
														Экспорт с ответами
													</DropdownMenuItem>
													<DropdownMenuSeparator />
													<DropdownMenuItem
														onClick={() => handleDeleteTopic(topic as Topic)}
														className="text-destructive"
													>
														<Trash2 className="mr-2 size-4" />
														Удалить
													</DropdownMenuItem>
												</DropdownMenuContent>
											</DropdownMenu>
										)}
									</div>
								)
							})}
						</div>
					</aside>

					<section className="rounded-4xl border-border/80 bg-card/90 p-unit-mob tab-sm:p-unit border shadow-sm">
						<div className="tab-sm:flex-row tab-sm:items-end tab-sm:justify-between flex flex-col gap-4 pb-3">
							<div>
								<p className="text-muted-foreground font-mono text-[0.6875rem] uppercase tracking-[0.22em]">
									{selectedTopicData ? selectedTopicData.slug : 'все темы'}
								</p>
								<h2 className="mt-2 font-serif text-3xl">{selectedTopicData?.title ?? 'Все тесты'}</h2>
							</div>
							<div className="bg-secondary text-muted-foreground rounded-full px-4 py-2 text-sm">
								{filteredTests.length} из {allTests.length}
							</div>
						</div>

						<ScrollArea>
							<div className="mt-3 h-full max-h-[calc(100dvh-34rem)] space-y-3">
								{filteredTests.length === 0 ? (
									<div className="bg-secondary/70 p-unit text-muted-foreground rounded-3xl text-sm">
										{selectedTopic ? 'В этой теме пока нет тестов.' : 'Создайте первый тест.'}
									</div>
								) : (
									filteredTests.map((test) => (
										<article
											key={test.id}
											className="border-border/70 bg-secondary/45 p-unit hover:bg-secondary/70 rounded-3xl border transition-colors"
										>
											<div className="tab-sm:grid-cols-[1fr_auto] tab-sm:items-start grid gap-4">
												<Link href={`/admin/tests/${test.topicSlug}/${test.slug}`} className="group min-w-0">
													<div className="flex flex-wrap items-center gap-2">
														<h3 className="group-hover:text-primary font-serif text-2xl leading-tight">{test.title}</h3>
														<Badge variant={test.isPublished ? 'default' : 'secondary'} className="rounded-full">
															{test.isPublished ? 'Опубликован' : 'Черновик'}
														</Badge>
													</div>
													<p className="text-muted-foreground mt-2 text-sm">{test.topicTitle}</p>
												</Link>

												<div className="tab-sm:justify-end flex items-center justify-between gap-2">
													<Button asChild variant="outline" className="bg-card rounded-full">
														<Link href={`/admin/tests/${test.topicSlug}/${test.slug}`}>Редактировать</Link>
													</Button>
													<DropdownMenu>
														<DropdownMenuTrigger asChild>
															<Button variant="ghost" size="icon" className="rounded-full">
																<MoreHorizontal className="size-4" />
															</Button>
														</DropdownMenuTrigger>
														<DropdownMenuContent align="end">
															<DropdownMenuItem onClick={() => handleExport(test.id, false)}>
																<Download className="mr-2 size-4" />
																Экспорт
															</DropdownMenuItem>
															<DropdownMenuItem onClick={() => handleExport(test.id, true)}>
																<Download className="mr-2 size-4" />
																Экспорт с ответами
															</DropdownMenuItem>
															<DropdownMenuSeparator />
															<DropdownMenuItem onClick={() => handleDeleteTest(test)} className="text-destructive">
																<Trash2 className="mr-2 size-4" />
																Удалить
															</DropdownMenuItem>
														</DropdownMenuContent>
													</DropdownMenu>
												</div>
											</div>

											<div className="text-muted-foreground mt-5 flex flex-wrap gap-2 text-sm">
												<span className="bg-card inline-flex items-center gap-2 rounded-full px-3 py-1">
													<FileText className="size-3.5" />
													{test.questionsCount ?? 0} вопросов
												</span>
												<span className="bg-card inline-flex items-center gap-2 rounded-full px-3 py-1">
													<Clock3 className="size-3.5" />
													{test.timeLimitMinutes ? `${test.timeLimitMinutes} мин` : 'без таймера'}
												</span>
												<span className="bg-card inline-flex items-center gap-2 rounded-full px-3 py-1">
													обновлён {formatDate(test.updatedAt)}
												</span>
											</div>
										</article>
									))
								)}
							</div>
						</ScrollArea>
					</section>
				</section>
			)}

			<TopicFormDialog
				open={topicDialogOpen}
				onOpenChange={setTopicDialogOpen}
				editingTopic={editingTopic}
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

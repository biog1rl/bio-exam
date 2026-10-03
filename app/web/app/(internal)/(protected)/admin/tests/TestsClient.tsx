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

const fetcher = async (url: string) => {
	const response = await apiFetch(url)
	if (!response.ok) throw new Error('Не удалось загрузить данные')
	return response.json()
}

const interactiveClass =
	'transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'

function formatDate(value?: string) {
	if (!value) return 'нет даты'
	return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short' }).format(new Date(value))
}

function StatTile({ label, value, icon: Icon }: { label: string; value: string | number; icon: typeof BookOpen }) {
	return (
		<div className="rounded-3xl border border-border/70 bg-secondary/70 p-unit">
			<Icon className="mb-5 size-5 text-primary" />
			<p className="font-serif text-3xl leading-none tab-sm:text-4xl">{value}</p>
			<p className="mt-2 text-sm text-muted-foreground">{label}</p>
		</div>
	)
}

function LoadingState() {
	return (
		<div className="space-y-3">
			<Skeleton className="h-32 rounded-4xl" />
			<Skeleton className="h-32 rounded-4xl" />
			<Skeleton className="h-32 rounded-4xl" />
		</div>
	)
}

export default function TestsClient() {
	const { confirm, alertDialog } = useUiAlertDialog()
	const {
		data: topicsData,
		mutate: mutateTopics,
		isLoading: topicsLoading,
		error: topicsError,
	} = useSWR<TopicsResponse>('/api/tests/topics', fetcher)
	const {
		data: testsData,
		mutate: mutateTests,
		isLoading: testsLoading,
		error: testsError,
	} = useSWR<TestsResponse>('/api/tests', fetcher)

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
			<section className="rounded-4xl border border-border/80 bg-card/90 p-unit-mob shadow-sm tab-sm:p-unit">
				<div className="flex flex-col gap-6 tab:flex-row tab:items-end tab:justify-between">
					<div>
						<p className="font-mono text-[0.6875rem] tracking-[0.22em] text-muted-foreground uppercase">банк заданий</p>
						<h1 className="mt-2 max-w-3xl font-serif text-3xl leading-none text-foreground mob:text-4xl tab-sm:text-5xl">
							Тесты и темы
						</h1>
					</div>
					<div className="flex flex-wrap gap-2">
						<Button variant="outline" asChild className="-sm w-full rounded-full bg-card transition-all mob:w-auto">
							<Link href="/admin/tests/scoring">
								<SlidersHorizontal className="size-4" />
								Баллы
							</Link>
						</Button>
						<Button variant="outline" asChild className="-sm w-full rounded-full bg-card transition-all mob:w-auto">
							<Link href="/admin/tests/question-types">
								<Shapes className="size-4" />
								Типы вопросов
							</Link>
						</Button>
						<Button
							variant="outline"
							onClick={handleCreateTopic}
							className="-sm w-full rounded-full bg-card transition-all mob:w-auto"
						>
							<FolderPlus className="size-4" />
							Новая тема
						</Button>
						<Button asChild className="-md w-full rounded-full transition-all mob:w-auto">
							<Link href="/admin/tests/new">
								<Plus className="size-4" />
								Новый тест
							</Link>
						</Button>
					</div>
				</div>

				<div className="mt-8 grid gap-3 tab-sm:grid-cols-2 tab:grid-cols-4">
					<StatTile label="всего тестов" value={testsLoading || testsError ? '…' : allTests.length} icon={BookOpen} />
					<StatTile
						label="опубликовано"
						value={testsLoading || testsError ? '…' : publishedCount}
						icon={CheckCircle2}
					/>
					<StatTile label="черновики" value={testsLoading || testsError ? '…' : draftCount} icon={FileText} />
					<StatTile label="вопросов" value={testsLoading || testsError ? '…' : totalQuestions} icon={Layers3} />
				</div>
			</section>

			<section className="grid gap-5 xl:grid-cols-[23.75rem_1fr]">
				<aside className="top-unit h-fit rounded-4xl border border-border/80 bg-card/90 p-unit-mob shadow-sm tab-sm:p-unit xl:sticky">
					<div className="flex items-start justify-between gap-3">
						<div>
							<p className="font-mono text-[0.6875rem] tracking-[0.22em] text-muted-foreground uppercase">темы</p>
							<h2 className="mt-2 font-serif text-2xl">Навигация</h2>
						</div>
						<Button variant="outline" size="icon" onClick={handleCreateTopic} className="rounded-full bg-card">
							<FolderPlus className="size-4" />
						</Button>
					</div>

					<div className="mt-6 space-y-2">
						{topicsLoading ? (
							<Skeleton className="h-40 w-full" />
						) : topicsError ? (
							<p role="alert">Не удалось загрузить темы</p>
						) : (
							topicRows.map((topic) => {
								const isAll = topic.id === null
								const isSelected = selectedTopic === topic.id
								return (
									<div key={topic.id ?? 'all'} className="group flex items-center gap-2">
										<button
											type="button"
											onClick={() => setSelectedTopic(topic.id)}
											className={cn(
												'flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-3xl border border-transparent p-unit text-left hover:bg-secondary/70',
												interactiveClass,
												isSelected && 'border border-border bg-secondary text-secondary-foreground'
											)}
										>
											<BookOpen className="size-4 shrink-0 text-primary" />
											<span className="min-w-0 flex-1 truncate text-sm font-medium">{topic.title}</span>
											{!isAll && 'isActive' in topic && !topic.isActive ? (
												<EyeOff className="size-3.5 text-muted-foreground" />
											) : null}
											<span className="rounded-full bg-card px-3 py-1 text-xs text-muted-foreground">
												{isAll && (testsLoading || testsError) ? '…' : (topic.testsCount ?? 0)}
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
							})
						)}
					</div>
				</aside>

				<section className="rounded-4xl border border-border/80 bg-card/90 p-unit-mob shadow-sm tab-sm:p-unit">
					<div className="flex flex-col gap-4 pb-3 tab-sm:flex-row tab-sm:items-end tab-sm:justify-between">
						<div>
							<p className="font-mono text-[0.6875rem] tracking-[0.22em] text-muted-foreground uppercase">
								{selectedTopicData ? selectedTopicData.slug : 'все темы'}
							</p>
							<h2 className="mt-2 font-serif text-3xl">{selectedTopicData?.title ?? 'Все тесты'}</h2>
						</div>
						<div className="rounded-full bg-secondary px-4 py-2 text-sm text-muted-foreground">
							{filteredTests.length} из {allTests.length}
						</div>
					</div>

					<ScrollArea>
						<div className="mt-3 h-full max-h-[calc(100dvh-34rem)] space-y-3">
							{testsLoading ? (
								<LoadingState />
							) : testsError ? (
								<p role="alert">Не удалось загрузить тесты</p>
							) : filteredTests.length === 0 ? (
								<div className="rounded-3xl bg-secondary/70 p-unit text-sm text-muted-foreground">
									{selectedTopic ? 'В этой теме пока нет тестов.' : 'Создайте первый тест.'}
								</div>
							) : (
								filteredTests.map((test) => (
									<article
										key={test.id}
										className="rounded-3xl border border-border/70 bg-secondary/45 p-unit transition-colors hover:bg-secondary/70"
									>
										<div className="grid gap-4 tab-sm:grid-cols-[1fr_auto] tab-sm:items-start">
											<Link href={`/admin/tests/${test.topicSlug}/${test.slug}`} className="group min-w-0">
												<div className="flex flex-wrap items-center gap-2">
													<h3 className="font-serif text-2xl leading-tight group-hover:text-primary">{test.title}</h3>
													<Badge variant={test.isPublished ? 'default' : 'secondary'} className="rounded-full">
														{test.isPublished ? 'Опубликован' : 'Черновик'}
													</Badge>
												</div>
												<p className="mt-2 text-sm text-muted-foreground">{test.topicTitle}</p>
											</Link>

											<div className="flex items-center justify-between gap-2 tab-sm:justify-end">
												<Button asChild variant="outline" className="rounded-full bg-card">
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

										<div className="mt-5 flex flex-wrap gap-2 text-sm text-muted-foreground">
											<span className="inline-flex items-center gap-2 rounded-full bg-card px-3 py-1">
												<FileText className="size-3.5" />
												{test.questionsCount ?? 0} вопросов
											</span>
											<span className="inline-flex items-center gap-2 rounded-full bg-card px-3 py-1">
												<Clock3 className="size-3.5" />
												{test.timeLimitMinutes ? `${test.timeLimitMinutes} мин` : 'без таймера'}
											</span>
											<span className="inline-flex items-center gap-2 rounded-full bg-card px-3 py-1">
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

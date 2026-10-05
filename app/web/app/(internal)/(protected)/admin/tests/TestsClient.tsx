'use client'

import { useMemo, useRef, useState } from 'react'

import {
	BookOpen,
	ArrowRight,
	CheckCircle2,
	Clock3,
	Download,
	Edit,
	EyeOff,
	FileText,
	FolderOpen,
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

import { AccessDeniedState } from '@/components/auth/AccessDeniedState'
import { LoadErrorAlert } from '@/components/feedback/LoadErrorAlert'
import { useAuth } from '@/components/providers/AuthProvider'
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
	NO_TOPICS_DESCRIPTION,
	NO_TOPICS_KICKER,
	NO_TOPICS_TITLE,
	canManageCatalog,
	deleteTestToast,
	emptyBankState,
	teachersLine,
} from '@/lib/tests/bank-view'
import { cn } from '@/lib/utils/cn'

import { TopicFormDialog } from './components/TopicFormDialog'
import type { Test, Topic } from './types'

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
	const { can, perms, loading: authLoading } = useAuth()
	const catalog = canManageCatalog(perms)
	const {
		data: topicsData,
		mutate: mutateTopics,
		error: topicsError,
	} = useSWR(adminTestsKeys.topics(), topicsListFetcher)
	const {
		data: testsData,
		mutate: mutateTests,
		error: testsError,
	} = useSWR(adminTestsKeys.list(), adminTestsListFetcher)
	const topicsTitleRef = useRef<HTMLHeadingElement>(null)
	const testsTitleRef = useRef<HTMLHeadingElement>(null)

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
	const topicsFailed = topicsError !== undefined && topicsData === undefined
	const testsFailed = testsError !== undefined && testsData === undefined
	const testsPending = testsData === undefined
	const bankState =
		topicsData === undefined || authLoading
			? null
			: emptyBankState({ topics: topics.length, zoneAll: can('zone', 'all') })
	const teacherWithoutTopics = bankState === 'teacher-no-topics'
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

		const outcome = await deleteTopic(topic.id)
		if (!outcome.ok) {
			const message = failureMessage(outcome, 'Ошибка удаления темы')
			if (message) toast.error(message)
			return
		}

		toast.success('Тема удалена')
		if (selectedTopic === topic.id) setSelectedTopic(null)
		mutateTopics()
		mutateTests()
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

	const handleExport = async (testId: string, withAnswers: boolean) => {
		const outcome = await exportTestArchive(testId, withAnswers)
		if (outcome.ok) {
			saveBlob(outcome.data.blob, outcome.data.filename)
			toast.success('Тест экспортирован')
			return
		}
		const message = exportFailureMessage(outcome, 'Ошибка экспорта')
		if (message) toast.error(message)
	}

	const handleExportTopic = async (topicSlug: string, withAnswers: boolean) => {
		const outcome = await exportTopicArchive(topicSlug, withAnswers)
		if (outcome.ok) {
			saveBlob(outcome.data.blob, outcome.data.filename)
			toast.success('Тема экспортирована')
			return
		}
		const message = exportFailureMessage(outcome, 'Ошибка экспорта')
		if (message) toast.error(message)
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
					{catalog || !teacherWithoutTopics ? (
						<div className="flex flex-wrap gap-2">
							{catalog ? (
								<>
									<Button
										variant="outline"
										asChild
										className="-sm w-full rounded-full bg-card transition-all mob:w-auto"
									>
										<Link href="/admin/tests/scoring">
											<SlidersHorizontal className="size-4" />
											Баллы
										</Link>
									</Button>
									<Button
										variant="outline"
										asChild
										className="-sm w-full rounded-full bg-card transition-all mob:w-auto"
									>
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
								</>
							) : null}
							{teacherWithoutTopics ? null : (
								<Button asChild className="-md w-full rounded-full transition-all mob:w-auto">
									<Link href="/admin/tests/new">
										<Plus className="size-4" />
										Новый тест
									</Link>
								</Button>
							)}
						</div>
					) : null}
				</div>

				{teacherWithoutTopics ? null : (
					<div className="mt-8 grid gap-3 tab-sm:grid-cols-2 tab:grid-cols-4">
						<StatTile label="всего тестов" value={testsPending ? '…' : allTests.length} icon={BookOpen} />
						<StatTile label="опубликовано" value={testsPending ? '…' : publishedCount} icon={CheckCircle2} />
						<StatTile label="черновики" value={testsPending ? '…' : draftCount} icon={FileText} />
						<StatTile label="вопросов" value={testsPending ? '…' : totalQuestions} icon={Layers3} />
					</div>
				)}
			</section>

			{teacherWithoutTopics ? (
				<AccessDeniedState
					icon={FolderOpen}
					kicker={NO_TOPICS_KICKER}
					title={NO_TOPICS_TITLE}
					description={NO_TOPICS_DESCRIPTION}
				/>
			) : (
				<section className="grid gap-5 xl:grid-cols-[23.75rem_1fr]">
					<aside className="top-unit h-fit rounded-4xl border border-border/80 bg-card/90 p-unit-mob shadow-sm tab-sm:p-unit xl:sticky">
						<div className="flex items-start justify-between gap-3">
							<div>
								<p className="font-mono text-[0.6875rem] tracking-[0.22em] text-muted-foreground uppercase">темы</p>
								<h2 ref={topicsTitleRef} tabIndex={-1} className="mt-2 font-serif text-2xl">
									Навигация
								</h2>
							</div>
							{catalog ? (
								<Button variant="outline" size="icon" onClick={handleCreateTopic} className="rounded-full bg-card">
									<FolderPlus className="size-4" />
								</Button>
							) : null}
						</div>

						<div className="mt-6 space-y-2">
							{topicsFailed ? (
								<LoadErrorAlert
									title="Не удалось загрузить темы"
									error={topicsError}
									onRetry={() => mutateTopics()}
									focusTarget={topicsTitleRef}
								/>
							) : topicsData === undefined ? (
								<Skeleton className="h-40 w-full" />
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
												<span className="min-w-0 flex-1">
													<span className="block truncate text-sm font-medium">{topic.title}</span>
													{'teachers' in topic && topic.teachers ? (
														<span className="block truncate text-xs text-muted-foreground">
															{teachersLine(topic.teachers)}
														</span>
													) : null}
												</span>
												{!isAll && 'isActive' in topic && !topic.isActive ? (
													<EyeOff className="size-3.5 text-muted-foreground" />
												) : null}
												<span className="shrink-0 rounded-full bg-card px-3 py-1 text-xs text-muted-foreground">
													{isAll && testsPending ? '…' : (topic.testsCount ?? 0)}
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
														{catalog ? (
															<DropdownMenuItem onClick={() => handleEditTopic(topic as Topic)}>
																<Edit className="mr-2 size-4" />
																Редактировать
															</DropdownMenuItem>
														) : null}
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
														{catalog ? (
															<>
																<DropdownMenuSeparator />
																<DropdownMenuItem
																	onClick={() => handleDeleteTopic(topic as Topic)}
																	className="text-destructive"
																>
																	<Trash2 className="mr-2 size-4" />
																	Удалить
																</DropdownMenuItem>
															</>
														) : null}
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
								<h2 ref={testsTitleRef} tabIndex={-1} className="mt-2 font-serif text-3xl">
									{selectedTopicData?.title ?? 'Все тесты'}
								</h2>
							</div>
							<div className="rounded-full bg-secondary px-4 py-2 text-sm text-muted-foreground">
								{filteredTests.length} из {allTests.length}
							</div>
						</div>

						<ScrollArea>
							<div className="mt-3 h-full max-h-[calc(100dvh-34rem)] space-y-3">
								{testsFailed ? (
									<LoadErrorAlert
										title="Не удалось загрузить тесты"
										error={testsError}
										onRetry={() => mutateTests()}
										focusTarget={testsTitleRef}
									/>
								) : testsPending ? (
									<LoadingState />
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
			)}

			{catalog ? (
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
			) : null}
			{alertDialog}
		</div>
	)
}

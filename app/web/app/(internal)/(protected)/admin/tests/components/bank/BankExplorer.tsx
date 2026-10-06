'use client'

import { useMemo, useState } from 'react'

import { Download, Edit, FolderOpen, Plus, Settings2, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import useSWR from 'swr'

import { SetBreadcrumbsLabels } from '@/components/Breadcrumbs/SetBreadcrumbsLabels'
import { AccessDeniedState } from '@/components/auth/AccessDeniedState'
import { LoadErrorAlert } from '@/components/feedback/LoadErrorAlert'
import { EmptyState } from '@/components/page/EmptyState'
import { PageHeader } from '@/components/page/PageHeader'
import { ToolbarButton, ToolbarTooltip } from '@/components/page/ToolbarButton'
import { ToolbarSearch } from '@/components/page/ToolbarSearch'
import { useAuth } from '@/components/providers/AuthProvider'
import { ColumnFilterMenu } from '@/components/table/ColumnFilterMenu'
import { Button } from '@/components/ui/button'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
	BANK_STATUSES,
	bankSearch,
	filterBankTests,
	parseBankUrl,
	sortBankTests,
	statusCounts,
	type BankStatus,
	type BankUrlState,
} from '@/lib/tests/bank-table'
import {
	NO_TOPICS_DESCRIPTION,
	NO_TOPICS_KICKER,
	NO_TOPICS_TITLE,
	TOPICS_BACK_LABEL,
	TOPIC_DENIED_DESCRIPTION,
	TOPIC_DENIED_TITLE,
	canManageCatalog,
	deleteTestToast,
	emptyBankState,
	topicPageState,
} from '@/lib/tests/bank-view'

import type { Test, Topic } from '../../types'
import { TopicFormDialog } from '../TopicFormDialog'
import { newTestHref } from '../test-editor/test-editor-view'
import { BankTestsTable } from './BankTestsTable'
import { BankTopicSelect, BankTopicsNav, bankTopicLinks } from './BankTopicsNav'

const STATUS_LABELS: Record<BankStatus, string> = { published: 'Опубликован', draft: 'Черновик' }

function topicTestsOf(tests: readonly Test[], topic: Topic): Test[] {
	return tests.filter((test) => test.topicId === topic.id || test.topicSlug === topic.slug)
}

function saveExport(outcome: Awaited<ReturnType<typeof exportTestArchive>>, success: string) {
	if (outcome.ok) {
		saveBlob(outcome.data.blob, outcome.data.filename)
		toast.success(success)
		return
	}
	const message = exportFailureMessage(outcome, 'Ошибка экспорта')
	if (message) toast.error(message)
}

function LoadingBank() {
	return (
		<div className="space-y-4">
			<Skeleton className="h-12 rounded-3xl" />
			<div className="grid gap-5 tab:grid-cols-[16rem_minmax(0,1fr)] xl:grid-cols-[18rem_minmax(0,1fr)]">
				<Skeleton className="hidden h-96 rounded-4xl tab:block" />
				<Skeleton className="h-96 rounded-3xl" />
			</div>
		</div>
	)
}

export function BankExplorer({ topicSlug }: { topicSlug?: string }) {
	const router = useRouter()
	const searchParams = useSearchParams()
	const { confirm, alertDialog } = useUiAlertDialog()
	const { can, perms, loading: authLoading } = useAuth()
	const catalog = canManageCatalog(perms)
	const [topicDialogOpen, setTopicDialogOpen] = useState(false)
	const [editingTopic, setEditingTopic] = useState<Topic | null>(null)

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

	const url = parseBankUrl(searchParams)
	const topics = useMemo(() => topicsData?.topics ?? [], [topicsData?.topics])
	const allTests = useMemo(() => testsData?.tests ?? [], [testsData?.tests])
	const topic = topicSlug ? (topics.find((item) => item.slug === topicSlug) ?? null) : null
	const scopeTests = useMemo(() => (topic ? topicTestsOf(allTests, topic) : allTests), [allTests, topic])
	const counts = statusCounts(scopeTests)
	const visibleTests = useMemo(
		() => sortBankTests(filterBankTests(scopeTests, url.statuses, url.q), url.sort),
		[scopeTests, url.statuses, url.q, url.sort]
	)

	const updateUrl = (patch: Partial<BankUrlState>) => {
		window.history.replaceState(null, '', `${window.location.pathname}${bankSearch({ ...url, ...patch })}`)
	}

	const topicHref = (slug: string | null) =>
		`${slug ? `/admin/tests/${slug}` : '/admin/tests'}${bankSearch({ ...url, q: '' })}`
	const links = bankTopicLinks(topics, allTests.length, (item) => topicTestsOf(allTests, item).length, topicHref)

	const openTopicDialog = (target: Topic | null) => {
		setEditingTopic(target)
		setTopicDialogOpen(true)
	}

	const handleDeleteTopic = async (target: Topic) => {
		const confirmed = await confirm({
			title: 'Удалить тему?',
			description: `Тема "${target.title}" и все её тесты будут удалены.`,
			confirmText: 'Удалить',
			cancelText: 'Отмена',
			destructive: true,
		})
		if (!confirmed) return
		const outcome = await deleteTopic(target.id)
		if (!outcome.ok) {
			const message = failureMessage(outcome, 'Ошибка удаления темы')
			if (message) toast.error(message)
			return
		}
		toast.success('Тема удалена')
		await Promise.all([mutateTopics(), mutateTests()])
		router.push('/admin/tests')
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

	if (topicsError !== undefined && topicsData === undefined) {
		return <LoadErrorAlert title="Не удалось загрузить темы" error={topicsError} onRetry={() => mutateTopics()} />
	}

	if (topicsData === undefined || authLoading) return <LoadingBank />

	const zoneAll = can('zone', 'all')

	if (!topicSlug && emptyBankState({ topics: topics.length, zoneAll }) === 'teacher-no-topics') {
		return (
			<AccessDeniedState
				icon={FolderOpen}
				kicker={NO_TOPICS_KICKER}
				title={NO_TOPICS_TITLE}
				description={NO_TOPICS_DESCRIPTION}
			/>
		)
	}

	if (topicSlug && topicPageState({ topicFound: Boolean(topic), zoneAll }) === 'denied') {
		return (
			<AccessDeniedState
				title={TOPIC_DENIED_TITLE}
				description={TOPIC_DENIED_DESCRIPTION}
				backHref="/admin/tests"
				backLabel={TOPICS_BACK_LABEL}
			/>
		)
	}

	const testsFailed = testsError !== undefined && testsData === undefined
	const testsPending = testsData === undefined
	const filtering = url.statuses.length > 0 || url.q.trim() !== ''
	const currentSlug = topic?.slug ?? null
	const statusFilter = (
		<ColumnFilterMenu
			label="Фильтр по статусу"
			options={BANK_STATUSES.map((value) => ({ value, label: STATUS_LABELS[value], count: counts[value] }))}
			selected={url.statuses}
			onChange={(statuses) => updateUrl({ statuses })}
		/>
	)

	return (
		<div className="space-y-4">
			{topic ? <SetBreadcrumbsLabels labels={{ [`/admin/tests/${topic.slug}`]: topic.title }} /> : null}

			<PageHeader title={topicSlug ? (topic?.title ?? 'Тема не найдена') : 'Банк заданий'}>
				{topicSlug && !topic ? null : (
					<>
						<div className="tab-sm:hidden">{statusFilter}</div>
						<ToolbarSearch
							value={url.q}
							onChange={(q) => updateUrl({ q })}
							placeholder={topic ? 'Название теста' : 'Название теста или темы'}
							label="Поиск тестов"
						/>
						<ToolbarTooltip label="Новый тест">
							<ToolbarButton asChild tone="primary" label="Новый тест">
								<Link href={newTestHref(topic?.slug)}>
									<Plus className="size-4" aria-hidden="true" />
								</Link>
							</ToolbarButton>
						</ToolbarTooltip>
						{topic ? (
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<ToolbarButton label="Действия с темой">
										<Settings2 className="size-4" aria-hidden="true" />
									</ToolbarButton>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end">
									{catalog ? (
										<>
											<DropdownMenuItem onSelect={() => openTopicDialog(topic)}>
												<Edit className="size-4" aria-hidden="true" />
												Изменить тему
											</DropdownMenuItem>
											<DropdownMenuSeparator />
										</>
									) : null}
									<DropdownMenuItem
										onSelect={async () =>
											saveExport(await exportTopicArchive(topic.slug, false), 'Тема экспортирована')
										}
									>
										<Download className="size-4" aria-hidden="true" />
										Экспорт без ответов
									</DropdownMenuItem>
									<DropdownMenuItem
										onSelect={async () => saveExport(await exportTopicArchive(topic.slug, true), 'Тема экспортирована')}
									>
										<Download className="size-4" aria-hidden="true" />
										Экспорт с ответами
									</DropdownMenuItem>
									{catalog ? (
										<>
											<DropdownMenuSeparator />
											<DropdownMenuItem
												className="text-destructive focus:text-destructive"
												onSelect={() => handleDeleteTopic(topic)}
											>
												<Trash2 className="size-4" aria-hidden="true" />
												Удалить тему
											</DropdownMenuItem>
										</>
									) : null}
								</DropdownMenuContent>
							</DropdownMenu>
						) : catalog ? (
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<ToolbarButton label="Настройки банка">
										<Settings2 className="size-4" aria-hidden="true" />
									</ToolbarButton>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end">
									<DropdownMenuItem onSelect={() => openTopicDialog(null)}>Создать тему</DropdownMenuItem>
									<DropdownMenuSeparator />
									<DropdownMenuItem asChild>
										<Link href="/admin/tests/question-types">Типы вопросов</Link>
									</DropdownMenuItem>
									<DropdownMenuItem asChild>
										<Link href="/admin/tests/scoring">Настройка баллов</Link>
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						) : null}
					</>
				)}
			</PageHeader>

			<div className="grid gap-5 tab:grid-cols-[16rem_minmax(0,1fr)] xl:grid-cols-[18rem_minmax(0,1fr)]">
				<div className="hidden tab:block">
					<BankTopicsNav
						links={links}
						currentSlug={currentSlug}
						canCreateTopic={catalog}
						onCreateTopic={() => openTopicDialog(null)}
					/>
				</div>

				<div className="min-w-0 space-y-4">
					<div className="tab:hidden">
						<BankTopicSelect links={links} currentSlug={currentSlug} />
					</div>

					{topicSlug && !topic ? (
						<EmptyState
							description="Проверьте адрес: возможно, адрес темы изменили."
							action={
								<Button asChild variant="outline" className="rounded-full">
									<Link href="/admin/tests">Все тесты</Link>
								</Button>
							}
						/>
					) : (
						<>
							{testsFailed ? (
								<LoadErrorAlert title="Не удалось загрузить тесты" error={testsError} onRetry={() => mutateTests()} />
							) : testsPending ? (
								<Skeleton className="h-96 rounded-3xl" aria-label="Загрузка тестов" />
							) : scopeTests.length === 0 ? (
								<EmptyState
									title={topic ? 'В теме пока нет тестов' : 'В банке пока нет тестов'}
									description={
										topic
											? 'Создайте первый тест: тема подставится сама.'
											: topics.length === 0 && catalog
												? 'Сначала создайте тему, затем тест в ней.'
												: 'Создайте первый тест.'
									}
									action={
										!topic && topics.length === 0 && catalog ? (
											<Button className="rounded-full" onClick={() => openTopicDialog(null)}>
												Создать тему
											</Button>
										) : (
											<Button asChild className="rounded-full">
												<Link href={newTestHref(topic?.slug)}>Создать тест</Link>
											</Button>
										)
									}
								/>
							) : visibleTests.length === 0 ? (
								<EmptyState
									description="Ничего не найдено с такими фильтрами."
									action={
										<Button
											variant="outline"
											className="rounded-full"
											onClick={() => updateUrl({ statuses: [], q: '' })}
										>
											Сбросить фильтры
										</Button>
									}
								/>
							) : (
								<div className="space-y-2">
									<BankTestsTable
										tests={visibleTests}
										showTopic={!topic}
										sort={url.sort}
										onSortChange={(sort) => updateUrl({ sort })}
										statusFilter={statusFilter}
										onExport={async (test, withAnswers) =>
											saveExport(await exportTestArchive(test.id, withAnswers), 'Тест экспортирован')
										}
										onDelete={handleDeleteTest}
									/>
									{filtering ? (
										<p className="px-3 text-xs text-muted-foreground" aria-live="polite">
											Показано {visibleTests.length} из {scopeTests.length}
										</p>
									) : null}
								</div>
							)}
						</>
					)}
				</div>
			</div>

			{catalog ? (
				<TopicFormDialog
					open={topicDialogOpen}
					onOpenChange={setTopicDialogOpen}
					editingTopic={editingTopic}
					initialOrder={topics.length}
					showIsActive
					onSaved={(saved) => {
						mutateTopics()
						mutateTests()
						if (saved?.slug && saved.slug !== topicSlug) router.push(`/admin/tests/${saved.slug}`)
					}}
				/>
			) : null}
			{alertDialog}
		</div>
	)
}

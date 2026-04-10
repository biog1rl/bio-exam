'use client'

import { useState } from 'react'

import {
	BookOpen,
	ChevronRight,
	Download,
	Edit,
	EyeOff,
	FolderPlus,
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useUiAlertDialog } from '@/components/ui/use-ui-alert-dialog'
import { apiFetch } from '@/lib/api-fetch'

import { TopicFormDialog } from './components/TopicFormDialog'
import type { Test, Topic, TopicsResponse, TestsResponse } from './types'

const fetcher = (url: string) => fetch(url, { credentials: 'include' }).then((r) => r.json())

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

	const topics = topicsData?.topics ?? []
	const allTests = testsData?.tests ?? []
	const filteredTests = selectedTopic ? allTests.filter((t) => t.topicId === selectedTopic) : allTests

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

	if (topicsLoading || testsLoading) {
		return <div className="p-6">Загрузка...</div>
	}

	return (
		<div className="space-y-6">
			<div className="tab-sm:flex-row tab-sm:items-center tab-sm:justify-between flex flex-col gap-4">
				<div>
					<h1 className="text-2xl font-semibold">Управление тестами</h1>
					<p className="text-muted-foreground">Создание и редактирование тестов</p>
				</div>
				<div className="flex gap-2">
					<Button variant="outline" asChild>
						<Link href="/admin/tests/scoring">
							<SlidersHorizontal className="mr-2 h-4 w-4" />
							Настройка баллов
						</Link>
					</Button>
					<Button variant="outline" asChild>
						<Link href="/admin/tests/question-types">
							<Shapes className="mr-2 h-4 w-4" />
							Типы вопросов
						</Link>
					</Button>
					<Button variant="outline" onClick={handleCreateTopic}>
						<FolderPlus className="mr-2 h-4 w-4" />
						Новая тема
					</Button>
					<Button asChild>
						<Link href="/admin/tests/new">
							<Plus className="mr-2 h-4 w-4" />
							Новый тест
						</Link>
					</Button>
				</div>
			</div>

			<div className="grid gap-6 lg:grid-cols-4">
				{/* Topics Sidebar */}
				<Card className="h-fit lg:col-span-1">
					<CardHeader className="pb-3">
						<CardTitle className="text-lg">Темы</CardTitle>
					</CardHeader>
					<CardContent className="space-y-1 p-2">
						<Button
							variant={selectedTopic === null ? 'secondary' : 'ghost'}
							className="w-full justify-start"
							onClick={() => setSelectedTopic(null)}
						>
							<BookOpen className="mr-2 h-4 w-4" />
							Все тесты
							<Badge variant="secondary" className="ml-auto">
								{allTests.length}
							</Badge>
						</Button>
						{topics.map((topic) => (
							<div key={topic.id} className="group flex items-center">
								<Button
									variant={selectedTopic === topic.id ? 'secondary' : 'ghost'}
									className="flex-1 justify-start"
									onClick={() => setSelectedTopic(topic.id)}
								>
									<ChevronRight className="mr-2 h-4 w-4" />
									<span className="truncate">{topic.title}</span>
									{!topic.isActive && <EyeOff className="text-muted-foreground ml-1 h-3 w-3" />}
									<Badge variant="secondary" className="ml-auto">
										{topic.testsCount ?? 0}
									</Badge>
								</Button>
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100">
											<MoreHorizontal className="h-4 w-4" />
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="end">
										<DropdownMenuItem onClick={() => handleEditTopic(topic)}>
											<Edit className="mr-2 h-4 w-4" />
											Редактировать
										</DropdownMenuItem>
										<DropdownMenuItem onClick={() => handleExportTopic(topic.slug, false)}>
											<Download className="mr-2 h-4 w-4" />
											Экспорт
										</DropdownMenuItem>
										<DropdownMenuItem onClick={() => handleExportTopic(topic.slug, true)}>
											<Download className="mr-2 h-4 w-4" />
											Экспорт с ответами
										</DropdownMenuItem>
										<DropdownMenuSeparator />
										<DropdownMenuItem onClick={() => handleDeleteTopic(topic)} className="text-destructive">
											<Trash2 className="mr-2 h-4 w-4" />
											Удалить
										</DropdownMenuItem>
									</DropdownMenuContent>
								</DropdownMenu>
							</div>
						))}
					</CardContent>
				</Card>

				{/* Tests List */}
				<div className="flex flex-col gap-2 lg:col-span-3">
					{filteredTests.length === 0 ? (
						<Card className="justify-between">
							<CardContent className="flex flex-col items-center justify-center py-12">
								<BookOpen className="text-muted-foreground mb-4 h-12 w-12" />
								<CardTitle className="mb-2">Нет тестов</CardTitle>
								<CardDescription>
									{selectedTopic ? 'В этой теме пока нет тестов' : 'Создайте первый тест, нажав кнопку выше'}
								</CardDescription>
							</CardContent>
						</Card>
					) : (
						filteredTests.map((test) => (
							<Card key={test.id} className="hover:bg-accent/50 transition-colors">
								<CardContent className="tab-sm:flex-row tab-sm:items-center tab-sm:justify-between flex flex-col gap-2 p-4">
									<Link href={`/admin/tests/${test.topicSlug}/${test.slug}`} className="block flex-1">
										<div className="flex items-center gap-2">
											<h3 className="font-medium">{test.title}</h3>
											{test.isPublished ? (
												<Badge variant="default">Опубликован</Badge>
											) : (
												<Badge variant="secondary">Черновик</Badge>
											)}
										</div>
										<p className="text-muted-foreground mt-2 text-sm">
											{test.topicTitle}
											{test.questionsCount !== undefined && ` • Вопросов: ${test.questionsCount}`}
											{test.timeLimitMinutes && ` • ${test.timeLimitMinutes} мин`}
										</p>
									</Link>
									<div className="max-tab-sm:justify-between flex items-center gap-2">
										<DropdownMenu>
											<DropdownMenuTrigger asChild>
												<Button variant="ghost" size="icon">
													<MoreHorizontal className="h-4 w-4" />
												</Button>
											</DropdownMenuTrigger>
											<DropdownMenuContent align="end">
												<DropdownMenuItem onClick={() => handleExport(test.id, false)}>
													<Download className="mr-2 h-4 w-4" />
													Экспорт
												</DropdownMenuItem>
												<DropdownMenuItem onClick={() => handleExport(test.id, true)}>
													<Download className="mr-2 h-4 w-4" />
													Экспорт с ответами
												</DropdownMenuItem>
												<DropdownMenuSeparator />
												<DropdownMenuItem onClick={() => handleDeleteTest(test)} className="text-destructive">
													<Trash2 className="mr-2 h-4 w-4" />
													Удалить
												</DropdownMenuItem>
											</DropdownMenuContent>
										</DropdownMenu>
									</div>
								</CardContent>
							</Card>
						))
					)}
				</div>
			</div>

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

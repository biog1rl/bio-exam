'use client'

import {
	DndContext,
	closestCenter,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
	DragEndEvent,
} from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'

import { useState, useEffect, useMemo } from 'react'

import { ArrowLeft, Download, FolderPlus, Loader2, Plus, Save } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import useSWR from 'swr'

import { SetBreadcrumbsLabels } from '@/components/Breadcrumbs/SetBreadcrumbsLabels'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { transliterate } from '@/lib/utils/transliterate'

import QuestionCard from '../../components/QuestionCard'
import QuestionEditor from '../../components/QuestionEditor'
import type { Question, TestFormData, TopicFormData, TopicsResponse, TestDetailResponse } from '../../types'
import { createDefaultQuestion } from '../../types'

const fetcher = (url: string) => fetch(url, { credentials: 'include' }).then((r) => r.json())

interface Props {
	topicSlug?: string
	testSlug?: string
}

export default function TestEditorClient({ topicSlug, testSlug }: Props) {
	const router = useRouter()
	const isNew = !topicSlug || !testSlug

	const { data: topicsData, mutate: mutateTopics } = useSWR<TopicsResponse>('/api/tests/topics', fetcher)
	const { data: testData, isLoading: testLoading } = useSWR<TestDetailResponse>(
		!isNew ? `/api/tests/by-slug/${topicSlug}/${testSlug}` : null,
		fetcher
	)

	const [saving, setSaving] = useState(false)
	const [form, setForm] = useState<TestFormData>({
		topicId: '',
		title: '',
		slug: '',
		description: '',
		isPublished: false,
		timeLimitMinutes: null,
		passingScore: null,
		order: 0,
		questions: [],
	})
	const [editingQuestion, setEditingQuestion] = useState<Question | null>(null)
	const [editingQuestionIndex, setEditingQuestionIndex] = useState<number | null>(null)

	// Topic creation dialog state
	const [topicDialogOpen, setTopicDialogOpen] = useState(false)
	const [topicForm, setTopicForm] = useState<TopicFormData>({
		slug: '',
		title: '',
		description: '',
		order: 0,
		isActive: true,
	})

	const topics = useMemo(() => topicsData?.topics ?? [], [topicsData])

	// Load existing test data
	useEffect(() => {
		if (testData?.test && testData?.questions) {
			setForm({
				topicId: testData.test.topicId,
				title: testData.test.title,
				slug: testData.test.slug,
				description: testData.test.description || '',
				isPublished: testData.test.isPublished,
				timeLimitMinutes: testData.test.timeLimitMinutes,
				passingScore: testData.test.passingScore,
				order: testData.test.order,
				questions: testData.questions.map((q, i) => ({
					...q,
					order: q.order ?? i,
				})),
			})
		}
	}, [testData])

	// Set first topic as default for new tests
	useEffect(() => {
		if (isNew && topics.length > 0 && !form.topicId) {
			setForm((f) => ({ ...f, topicId: topics[0].id }))
		}
	}, [isNew, topics, form.topicId])

	const sensors = useSensors(
		useSensor(PointerSensor),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		})
	)

	const handleCreateTopic = () => {
		setTopicForm({
			slug: '',
			title: '',
			description: '',
			order: topics.length,
			isActive: true,
		})
		setTopicDialogOpen(true)
	}

	const handleSaveTopic = async () => {
		if (!topicForm.title || !topicForm.slug) {
			toast.error('Заполните название и slug')
			return
		}

		try {
			const res = await fetch('/api/tests/topics', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify(topicForm),
			})

			if (!res.ok) {
				const data = await res.json()
				throw new Error(data.error || 'Ошибка создания темы')
			}

			const data = await res.json()
			toast.success('Тема создана')
			setTopicDialogOpen(false)
			mutateTopics()

			// Set the new topic as selected
			if (data.topic?.id) {
				setForm((f) => ({ ...f, topicId: data.topic.id }))
			}
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Ошибка создания темы')
		}
	}

	const handleDragEnd = (event: DragEndEvent) => {
		const { active, over } = event
		if (!over || active.id === over.id) return

		const oldIndex = form.questions.findIndex((q) => (q.id || `new-${q.order}`) === active.id)
		const newIndex = form.questions.findIndex((q) => (q.id || `new-${q.order}`) === over.id)

		const newQuestions = arrayMove(form.questions, oldIndex, newIndex).map((q, i) => ({
			...q,
			order: i,
		}))

		setForm({ ...form, questions: newQuestions })
	}

	const handleAddQuestion = () => {
		const newQuestion = createDefaultQuestion(form.questions.length)
		setEditingQuestion(newQuestion)
		setEditingQuestionIndex(null)
	}

	const handleEditQuestion = (index: number) => {
		setEditingQuestion({ ...form.questions[index] })
		setEditingQuestionIndex(index)
	}

	const handleDeleteQuestion = (index: number) => {
		if (!confirm('Удалить этот вопрос?')) return
		const newQuestions = form.questions.filter((_, i) => i !== index).map((q, i) => ({ ...q, order: i }))
		setForm({ ...form, questions: newQuestions })
	}

	const handleSaveQuestion = (question: Question) => {
		if (editingQuestionIndex !== null) {
			// Update existing
			const newQuestions = [...form.questions]
			newQuestions[editingQuestionIndex] = question
			setForm({ ...form, questions: newQuestions })
		} else {
			// Add new
			setForm({ ...form, questions: [...form.questions, question] })
		}
		setEditingQuestion(null)
		setEditingQuestionIndex(null)
	}

	const handleSave = async () => {
		if (!form.topicId) {
			toast.error('Выберите тему')
			return
		}
		if (!form.title) {
			toast.error('Введите название теста')
			return
		}
		if (!form.slug) {
			toast.error('Введите slug')
			return
		}
		if (form.questions.length === 0) {
			toast.error('Добавьте хотя бы один вопрос')
			return
		}

		// Validate questions
		for (let i = 0; i < form.questions.length; i++) {
			const q = form.questions[i]
			if (!q.promptText.trim()) {
				toast.error(`Вопрос ${i + 1}: введите текст вопроса`)
				return
			}
			if (q.type === 'radio' || q.type === 'checkbox') {
				if (!q.options || q.options.length < 2) {
					toast.error(`Вопрос ${i + 1}: добавьте минимум 2 варианта ответа`)
					return
				}
				if (q.options.some((o) => !o.text.trim())) {
					toast.error(`Вопрос ${i + 1}: заполните все варианты ответа`)
					return
				}
				if (q.type === 'radio' && !q.correct) {
					toast.error(`Вопрос ${i + 1}: выберите правильный ответ`)
					return
				}
				if (q.type === 'checkbox' && (!Array.isArray(q.correct) || q.correct.length === 0)) {
					toast.error(`Вопрос ${i + 1}: выберите правильные ответы`)
					return
				}
			}
			if (q.type === 'matching') {
				if (!q.matchingPairs || q.matchingPairs.left.length < 2 || q.matchingPairs.right.length < 2) {
					toast.error(`Вопрос ${i + 1}: добавьте минимум 2 пары для сопоставления`)
					return
				}
				if (q.matchingPairs.left.some((p) => !p.text.trim()) || q.matchingPairs.right.some((p) => !p.text.trim())) {
					toast.error(`Вопрос ${i + 1}: заполните все элементы сопоставления`)
					return
				}
				if (typeof q.correct !== 'object' || Array.isArray(q.correct) || Object.keys(q.correct).length === 0) {
					toast.error(`Вопрос ${i + 1}: укажите правильные соответствия`)
					return
				}
			}
		}

		setSaving(true)
		try {
			const testId = testData?.test?.id
			const url = isNew ? '/api/tests/save' : `/api/tests/${testId}/save`
			const res = await fetch(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify(form),
			})

			if (!res.ok) {
				const data = await res.json()
				throw new Error(data.error || 'Ошибка сохранения')
			}

			const data = await res.json()
			toast.success(isNew ? 'Тест создан' : 'Тест сохранен')

			if (isNew && data.test) {
				// Redirect to slug-based URL after creation
				const newTopicSlug = data.test.topicSlug || topics.find((t) => t.id === form.topicId)?.slug
				router.push(`/admin/tests/${newTopicSlug}/${form.slug}`)
			} else if (!isNew && data.test) {
				// If slug or topic changed, update URL
				const newTopicSlug = data.test.topicSlug || topics.find((t) => t.id === form.topicId)?.slug
				if (newTopicSlug !== topicSlug || form.slug !== testSlug) {
					router.replace(`/admin/tests/${newTopicSlug}/${form.slug}`)
				}
			}
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Ошибка сохранения')
		} finally {
			setSaving(false)
		}
	}

	const handleExport = async (withAnswers: boolean) => {
		const testId = testData?.test?.id
		if (!testId) return

		try {
			const res = await fetch(`/api/tests/${testId}/export?withAnswers=${withAnswers}`, {
				credentials: 'include',
			})

			if (!res.ok) throw new Error('Ошибка экспорта')

			const blob = await res.blob()
			const url = URL.createObjectURL(blob)
			const a = document.createElement('a')
			a.href = url
			a.download = `${form.slug || 'test'}.zip`
			a.click()
			URL.revokeObjectURL(url)

			toast.success('Тест экспортирован')
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Ошибка экспорта')
		}
	}

	// Breadcrumb labels: показываем названия вместо slug'ов
	const breadcrumbLabels = useMemo(() => {
		const labels: Record<string, string> = {}
		if (topicSlug) {
			const topicTitle = testData?.test?.topicTitle || topics.find((t) => t.slug === topicSlug)?.title
			if (topicTitle) {
				labels[`/admin/tests/${topicSlug}`] = topicTitle
			}
		}
		if (topicSlug && testSlug) {
			const testTitle = testData?.test?.title || form.title
			if (testTitle) {
				labels[`/admin/tests/${topicSlug}/${testSlug}`] = testTitle
			}
		}
		return labels
	}, [topicSlug, testSlug, testData, topics, form.title])

	if (!isNew && testLoading) {
		return (
			<div className="flex items-center justify-center p-12">
				<Loader2 className="h-8 w-8 animate-spin" />
			</div>
		)
	}

	// Question editor — full page replacement
	if (editingQuestion) {
		return (
			<QuestionEditor
				question={editingQuestion}
				onSave={handleSaveQuestion}
				onCancel={() => {
					setEditingQuestion(null)
					setEditingQuestionIndex(null)
				}}
			/>
		)
	}

	return (
		<div className="space-y-6">
			<SetBreadcrumbsLabels labels={breadcrumbLabels} />
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-4">
					<Button variant="ghost" size="icon" onClick={() => router.push('/admin/tests')}>
						<ArrowLeft className="h-4 w-4" />
					</Button>
					<div>
						<h1 className="text-2xl font-semibold">{isNew ? 'Новый тест' : 'Редактирование теста'}</h1>
						<p className="text-muted-foreground">
							{form.questions.length} вопросов
							{form.isPublished ? ' • Опубликован' : ' • Черновик'}
						</p>
					</div>
				</div>
				<div className="flex gap-2">
					{!isNew && (
						<>
							<Button variant="outline" onClick={() => handleExport(false)}>
								<Download className="mr-2 h-4 w-4" />
								Экспорт
							</Button>
							<Button variant="outline" onClick={() => handleExport(true)}>
								<Download className="mr-2 h-4 w-4" />С ответами
							</Button>
						</>
					)}
					<Button onClick={handleSave} disabled={saving}>
						{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
						Сохранить
					</Button>
				</div>
			</div>

			<div className="grid gap-6 lg:grid-cols-3">
				{/* Meta Form */}
				<Card className="lg:col-span-1">
					<CardHeader>
						<CardTitle>Настройки теста</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="space-y-2">
							<Label>Тема</Label>
							{topics.length === 0 ? (
								<div className="space-y-2">
									<p className="text-muted-foreground text-sm">Нет доступных тем. Создайте первую тему.</p>
									<Button type="button" variant="outline" className="w-full" onClick={handleCreateTopic}>
										<FolderPlus className="mr-2 h-4 w-4" />
										Создать тему
									</Button>
								</div>
							) : (
								<div className="flex gap-2">
									<Select value={form.topicId} onValueChange={(v) => setForm({ ...form, topicId: v })}>
										<SelectTrigger className="flex-1">
											<SelectValue placeholder="Выберите тему" />
										</SelectTrigger>
										<SelectContent>
											{topics.map((topic) => (
												<SelectItem key={topic.id} value={topic.id}>
													{topic.title}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<Button type="button" variant="outline" size="icon" onClick={handleCreateTopic} title="Создать тему">
										<FolderPlus className="h-4 w-4" />
									</Button>
								</div>
							)}
						</div>

						<div className="space-y-2">
							<Label>Название</Label>
							<Input
								value={form.title}
								onChange={(e) => {
									const title = e.target.value
									setForm({
										...form,
										title,
										slug: isNew ? transliterate(title) : form.slug,
									})
								}}
								placeholder="Тест по теме..."
							/>
						</div>

						<div className="space-y-2">
							<Label>Slug (URL)</Label>
							<Input
								value={form.slug}
								onChange={(e) => setForm({ ...form, slug: e.target.value })}
								placeholder="test-slug"
							/>
						</div>

						<div className="space-y-2">
							<Label>Описание</Label>
							<Textarea
								value={form.description}
								onChange={(e) => setForm({ ...form, description: e.target.value })}
								placeholder="Описание теста..."
								rows={3}
							/>
						</div>

						<div className="space-y-2">
							<Label>Лимит времени (минуты)</Label>
							<Input
								type="number"
								value={form.timeLimitMinutes || ''}
								onChange={(e) =>
									setForm({
										...form,
										timeLimitMinutes: e.target.value ? parseInt(e.target.value) : null,
									})
								}
								placeholder="Без лимита"
							/>
						</div>

						<div className="space-y-2">
							<Label>Проходной балл (%)</Label>
							<Input
								type="number"
								min={0}
								max={100}
								value={form.passingScore || ''}
								onChange={(e) =>
									setForm({
										...form,
										passingScore: e.target.value ? parseFloat(e.target.value) : null,
									})
								}
								placeholder="Не задан"
							/>
						</div>

						<div className="flex items-center justify-between pt-2">
							<Label>Опубликовать</Label>
							<Switch
								checked={form.isPublished}
								onCheckedChange={(checked) => setForm({ ...form, isPublished: checked })}
							/>
						</div>
					</CardContent>
				</Card>

				{/* Questions List */}
				<Card className="lg:col-span-2">
					<CardHeader className="flex flex-row items-center justify-between">
						<CardTitle>Вопросы</CardTitle>
						<Button onClick={handleAddQuestion}>
							<Plus className="mr-2 h-4 w-4" />
							Добавить вопрос
						</Button>
					</CardHeader>
					<CardContent>
						{form.questions.length === 0 ? (
							<div className="text-muted-foreground py-12 text-center">
								Нет вопросов. Нажмите &quot;Добавить вопрос&quot; чтобы начать.
							</div>
						) : (
							<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
								<SortableContext
									items={form.questions.map((q) => q.id || `new-${q.order}`)}
									strategy={verticalListSortingStrategy}
								>
									<div className="space-y-2">
										{form.questions.map((question, index) => (
											<QuestionCard
												key={question.id || `new-${question.order}`}
												question={question}
												index={index}
												onEdit={() => handleEditQuestion(index)}
												onDelete={() => handleDeleteQuestion(index)}
											/>
										))}
									</div>
								</SortableContext>
							</DndContext>
						)}
					</CardContent>
				</Card>
			</div>

			{/* Topic Creation Dialog */}
			<Dialog open={topicDialogOpen} onOpenChange={setTopicDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Новая тема</DialogTitle>
						<DialogDescription>Темы помогают организовать тесты по категориям</DialogDescription>
					</DialogHeader>

					<div className="space-y-4">
						<div className="space-y-2">
							<Label>Название</Label>
							<Input
								value={topicForm.title}
								onChange={(e) => {
									const title = e.target.value
									setTopicForm({
										...topicForm,
										title,
										slug: transliterate(title),
									})
								}}
								placeholder="Биология 9 класс"
							/>
						</div>

						<div className="space-y-2">
							<Label>Slug (URL)</Label>
							<Input
								value={topicForm.slug}
								onChange={(e) => setTopicForm({ ...topicForm, slug: e.target.value })}
								placeholder="biology-9"
							/>
							<p className="text-muted-foreground text-xs">Только латинские буквы, цифры и дефисы</p>
						</div>

						<div className="space-y-2">
							<Label>Описание</Label>
							<Textarea
								value={topicForm.description}
								onChange={(e) => setTopicForm({ ...topicForm, description: e.target.value })}
								placeholder="Описание темы..."
								rows={3}
							/>
						</div>
					</div>

					<DialogFooter>
						<Button variant="outline" onClick={() => setTopicDialogOpen(false)}>
							Отмена
						</Button>
						<Button onClick={handleSaveTopic}>Создать</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	)
}

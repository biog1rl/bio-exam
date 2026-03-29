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

import { useState, useEffect, useMemo, useCallback } from 'react'

import { Download, FolderPlus, Loader2, Plus, Save, Trash2, UserPlus } from 'lucide-react'
import Link from 'next/link'
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
import { useUiAlertDialog } from '@/components/ui/use-ui-alert-dialog'
import { apiFetch } from '@/lib/api-fetch'
import { transliterate } from '@/lib/utils/transliterate'

import QuestionCard from '../../components/QuestionCard'
import { resolveInitialCreateModePersistence } from '../../lifecycle'
import type {
	QuestionDraft,
	QuestionDraftsResponse,
	TestDetailResponse,
	TestFormData,
	TopicFormData,
	TopicsResponse,
} from '../../types'
import {
	isValidSequenceCorrectValue,
	normalizeQuestionForSave,
	normalizeShortTextCorrectValue,
	resolveQuestionTemplate,
} from '../../types'

const fetcher = (url: string) => fetch(url, { credentials: 'include' }).then((r) => r.json())

function normalizeFormPayload(payload: TestFormData): TestFormData {
	return {
		...payload,
		questions: payload.questions.map((question) => normalizeQuestionForSave(question)),
	}
}

function resolveQuestionDraftId(data: unknown): string | null {
	if (!data || typeof data !== 'object') return null
	const candidate = data as {
		draftId?: string
		id?: string
		draft?: { id?: string }
	}
	return candidate.draftId ?? candidate.id ?? candidate.draft?.id ?? null
}

function resolveQuestionDraftLabel(draft: QuestionDraft): string {
	const payload = draft.payload
	const questionValue = payload && typeof payload === 'object' ? (payload as { question?: unknown }).question : null
	if (!questionValue || typeof questionValue !== 'object') return 'Черновик вопроса'
	const promptRaw = (questionValue as { promptText?: unknown }).promptText
	const prompt = typeof promptRaw === 'string' ? promptRaw.trim() : ''
	if (!prompt) return 'Черновик вопроса'
	const singleLine = prompt.replace(/\s+/g, ' ')
	return singleLine.slice(0, 64) + (singleLine.length > 64 ? '...' : '')
}

interface Props {
	topicSlug?: string
	testSlug?: string
}

interface CreateTestPersistenceResult {
	testId: string
	topicSlug: string
	testSlug: string
	forcedDraft: boolean
}

export default function TestEditorClient({ topicSlug, testSlug }: Props) {
	const router = useRouter()
	const { confirm, alertDialog } = useUiAlertDialog()
	const isEditingExisting = Boolean(topicSlug && testSlug)
	const isCreateMode = !isEditingExisting

	const { data: topicsData, mutate: mutateTopics } = useSWR<TopicsResponse>('/api/tests/topics', fetcher)
	const {
		data: testData,
		isLoading: testLoading,
		mutate: mutateTest,
	} = useSWR<TestDetailResponse>(isEditingExisting ? `/api/tests/by-slug/${topicSlug}/${testSlug}` : null, fetcher)
	const testId = testData?.test?.id
	const { data: questionDraftsData, mutate: mutateQuestionDrafts } = useSWR<QuestionDraftsResponse>(
		testId ? `/api/tests/${testId}/question-drafts` : null,
		fetcher
	)

	type StudentAssignment = {
		userId: string
		assignedAt: string
		name: string | null
		login: string | null
	}
	type UserItem = {
		id: string
		login: string | null
		name: string | null
		firstName: string | null
		lastName: string | null
	}

	const { data: studentAssignmentsData, mutate: mutateStudentAssignments } = useSWR<{
		assignments: StudentAssignment[]
	}>(testId ? `/api/tests/${testId}/assignments` : null, fetcher)
	const { data: allUsersData } = useSWR<{ rows: UserItem[]; total: number }>(testId ? '/api/users' : null, fetcher)

	const [assigningUserId, setAssigningUserId] = useState<string | null>(null)
	const [removingUserId, setRemovingUserId] = useState<string | null>(null)

	const studentAssignments = useMemo(() => studentAssignmentsData?.assignments ?? [], [studentAssignmentsData])
	const assignedUserIds = useMemo(() => new Set(studentAssignments.map((a) => a.userId)), [studentAssignments])
	const availableUsers = useMemo(
		() => (allUsersData?.rows ?? []).filter((u) => !assignedUserIds.has(u.id)),
		[allUsersData, assignedUserIds]
	)

	const handleAssignStudent = useCallback(
		async (userId: string) => {
			if (!testId || assigningUserId) return
			setAssigningUserId(userId)
			try {
				const res = await apiFetch(`/api/tests/${testId}/assignments`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ userId }),
				})
				if (!res.ok) {
					const data = (await res.json().catch(() => null)) as { error?: string } | null
					throw new Error(data?.error || 'Ошибка назначения студента')
				}
				await mutateStudentAssignments()
				toast.success('Студент добавлен')
			} catch (err) {
				toast.error(err instanceof Error ? err.message : 'Ошибка назначения студента')
			} finally {
				setAssigningUserId(null)
			}
		},
		[testId, assigningUserId, mutateStudentAssignments]
	)

	const handleRemoveStudent = useCallback(
		async (userId: string) => {
			if (!testId || removingUserId) return
			setRemovingUserId(userId)
			try {
				const res = await apiFetch(`/api/tests/${testId}/assignments/${userId}`, {
					method: 'DELETE',
				})
				if (!res.ok) {
					const data = (await res.json().catch(() => null)) as { error?: string } | null
					throw new Error(data?.error || 'Ошибка удаления студента')
				}
				await mutateStudentAssignments()
				toast.success('Доступ удален')
			} catch (err) {
				toast.error(err instanceof Error ? err.message : 'Ошибка удаления студента')
			} finally {
				setRemovingUserId(null)
			}
		},
		[testId, removingUserId, mutateStudentAssignments]
	)

	const [saving, setSaving] = useState(false)
	const [creatingQuestionDraft, setCreatingQuestionDraft] = useState(false)
	const [deletingQuestionId, setDeletingQuestionId] = useState<string | null>(null)
	const [reorderingQuestions, setReorderingQuestions] = useState(false)
	const [form, setForm] = useState<TestFormData>({
		topicId: '',
		title: '',
		slug: '',
		description: '',
		isPublished: false,
		showCorrectAnswer: true,
		timeLimitMinutes: null,
		redThresholdMinutes: null,
		warningThresholdMinutes: null,
		passingScore: null,
		order: 0,
		questions: [],
	})

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
	const questionDrafts = useMemo(() => questionDraftsData?.drafts ?? [], [questionDraftsData])

	// Load existing test data
	useEffect(() => {
		if (!isEditingExisting) return
		if (testData?.test && testData?.questions) {
			setForm({
				topicId: testData.test.topicId,
				title: testData.test.title,
				slug: testData.test.slug,
				description: testData.test.description || '',
				isPublished: testData.test.isPublished,
				showCorrectAnswer: testData.test.showCorrectAnswer ?? true,
				timeLimitMinutes: testData.test.timeLimitMinutes,
				redThresholdMinutes: testData.test.redThresholdMinutes ?? null,
				warningThresholdMinutes: testData.test.warningThresholdMinutes ?? null,
				passingScore: testData.test.passingScore,
				order: testData.test.order,
				questions: testData.questions.map((q, i) => {
					const normalized = normalizeQuestionForSave(q)
					return {
						...normalized,
						order: q.order ?? i,
					}
				}),
			})
		}
	}, [isEditingExisting, testData])

	// Set first topic as default for new tests
	useEffect(() => {
		if (!isCreateMode) return
		if (topics.length === 0 || form.topicId) return

		setForm((prev) => ({ ...prev, topicId: topics[0].id }))
	}, [isCreateMode, topics, form.topicId])

	const sensors = useSensors(
		useSensor(PointerSensor),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		})
	)

	const getBaseValidationError = useCallback(() => {
		if (!form.topicId) return 'Выберите тему'
		if (!form.title) return 'Введите название теста'
		if (!form.slug) return 'Введите slug'
		return null
	}, [form.topicId, form.title, form.slug])

	const getCreateQuestionsValidationError = useCallback(() => {
		for (let i = 0; i < form.questions.length; i++) {
			const q = form.questions[i]
			const template = resolveQuestionTemplate(q)
			if (!template) {
				return `Вопрос ${i + 1}: тип вопроса не настроен в БД`
			}
			if (!q.promptText.trim()) {
				return `Вопрос ${i + 1}: введите текст вопроса`
			}
			if (template === 'single_choice' || template === 'multi_choice') {
				if (!q.options || q.options.length < 2) {
					return `Вопрос ${i + 1}: добавьте минимум 2 варианта ответа`
				}
				if (q.options.some((o) => !o.text.trim())) {
					return `Вопрос ${i + 1}: заполните все варианты ответа`
				}
				if (template === 'single_choice' && !q.correct) {
					return `Вопрос ${i + 1}: выберите правильный ответ`
				}
				if (template === 'multi_choice' && (!Array.isArray(q.correct) || q.correct.length === 0)) {
					return `Вопрос ${i + 1}: выберите правильные ответы`
				}
			}
			if (template === 'matching') {
				if (!q.matchingPairs || q.matchingPairs.left.length < 2 || q.matchingPairs.right.length < 2) {
					return `Вопрос ${i + 1}: добавьте минимум 2 пары для сопоставления`
				}
				if (q.matchingPairs.left.some((p) => !p.text.trim()) || q.matchingPairs.right.some((p) => !p.text.trim())) {
					return `Вопрос ${i + 1}: заполните все элементы сопоставления`
				}
				if (typeof q.correct !== 'object' || Array.isArray(q.correct) || Object.keys(q.correct).length === 0) {
					return `Вопрос ${i + 1}: укажите правильные соответствия`
				}
			}
			if (template === 'short_text') {
				const normalized = normalizeShortTextCorrectValue(q.correct)
				if (!normalized || !normalized.trim()) {
					return `Вопрос ${i + 1}: укажите правильный краткий ответ`
				}
			}
			if (template === 'sequence_digits' && !isValidSequenceCorrectValue(q.correct)) {
				return `Вопрос ${i + 1}: для последовательности используйте только цифры`
			}
		}
		return null
	}, [form.questions])

	const persistNewTest = useCallback(async (): Promise<CreateTestPersistenceResult> => {
		const baseValidationError = getBaseValidationError()
		if (baseValidationError) {
			throw new Error(baseValidationError)
		}

		const questionsValidationError = getCreateQuestionsValidationError()
		if (questionsValidationError) {
			throw new Error(questionsValidationError)
		}

		const { shouldForceDraft, persistedPublicationState } = resolveInitialCreateModePersistence({
			questionCount: form.questions.length,
			requestedPublicationState: form.isPublished,
		})

		const res = await apiFetch('/api/tests/save', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(
				normalizeFormPayload({
					...form,
					isPublished: persistedPublicationState,
				})
			),
		})

		if (!res.ok) {
			const data = (await res.json().catch(() => null)) as { error?: string } | null
			throw new Error(data?.error || 'Ошибка сохранения')
		}

		const data = (await res.json().catch(() => null)) as {
			test?: { id?: string; topicSlug?: string; slug?: string }
		} | null
		const createdTestId = data?.test?.id
		const createdTopicSlug = data?.test?.topicSlug || topics.find((t) => t.id === form.topicId)?.slug
		const createdTestSlug = data?.test?.slug || form.slug
		if (!createdTestId || !createdTopicSlug || !createdTestSlug) {
			throw new Error('Не удалось определить путь нового теста после сохранения')
		}

		return {
			testId: createdTestId,
			topicSlug: createdTopicSlug,
			testSlug: createdTestSlug,
			forcedDraft: shouldForceDraft,
		}
	}, [form, getBaseValidationError, getCreateQuestionsValidationError, topics])

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
			const res = await apiFetch('/api/tests/topics', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
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

	const handleDragEnd = async (event: DragEndEvent) => {
		const { active, over } = event
		if (!over || active.id === over.id || reorderingQuestions) return

		const oldIndex = form.questions.findIndex((q) => (q.id || `new-${q.order}`) === active.id)
		const newIndex = form.questions.findIndex((q) => (q.id || `new-${q.order}`) === over.id)
		if (oldIndex < 0 || newIndex < 0) return

		const previousQuestions = form.questions
		const newQuestions = arrayMove(previousQuestions, oldIndex, newIndex).map((q, i) => ({
			...q,
			order: i,
		}))

		setForm((prev) => ({ ...prev, questions: newQuestions }))

		if (!isEditingExisting || !testId) return

		const questionIds = newQuestions.map((question) => question.id).filter((id): id is string => Boolean(id))
		if (questionIds.length !== newQuestions.length) {
			toast.error('Нельзя сортировать несохраненные вопросы')
			setForm((prev) => ({ ...prev, questions: previousQuestions }))
			return
		}

		setReorderingQuestions(true)
		try {
			const res = await apiFetch(`/api/tests/${testId}/questions/reorder`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ questionIds }),
			})
			if (!res.ok) {
				const data = (await res.json().catch(() => null)) as { error?: string } | null
				throw new Error(data?.error || 'Не удалось сохранить порядок вопросов')
			}
		} catch (err) {
			setForm((prev) => ({ ...prev, questions: previousQuestions }))
			toast.error(err instanceof Error ? err.message : 'Ошибка сортировки вопросов')
		} finally {
			setReorderingQuestions(false)
		}
	}

	const handleAddQuestion = async () => {
		if (creatingQuestionDraft) return
		setCreatingQuestionDraft(true)
		try {
			let resolvedTestId = testId
			let resolvedTopicSlug = topicSlug
			let resolvedTestSlug = testSlug
			let forcedDraft = false

			if (!isEditingExisting) {
				const created = await persistNewTest()
				resolvedTestId = created.testId
				resolvedTopicSlug = created.topicSlug
				resolvedTestSlug = created.testSlug
				forcedDraft = created.forcedDraft
			}

			if (!resolvedTestId || !resolvedTopicSlug || !resolvedTestSlug) {
				throw new Error('Сначала сохраните тест, затем добавляйте вопросы')
			}

			const res = await apiFetch(`/api/tests/${resolvedTestId}/question-drafts`, { method: 'POST' })
			if (!res.ok) {
				const data = (await res.json().catch(() => null)) as { error?: string } | null
				throw new Error(data?.error || 'Не удалось создать черновик вопроса')
			}
			const data = (await res.json().catch(() => null)) as unknown
			const draftId = resolveQuestionDraftId(data)
			if (!draftId) {
				throw new Error('API не вернул draftId черновика вопроса')
			}
			if (forcedDraft) {
				toast.success('Тест сохранен как черновик. После первого вопроса его можно будет опубликовать.')
			}
			router.push(`/admin/tests/${resolvedTopicSlug}/${resolvedTestSlug}/questions/drafts/${draftId}`)
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Не удалось создать черновик вопроса')
		} finally {
			setCreatingQuestionDraft(false)
		}
	}

	const handleDeleteQuestionDraft = async (draft: QuestionDraft) => {
		if (!testId) return
		const confirmed = await confirm({
			title: 'Удалить черновик вопроса?',
			description: 'Это действие нельзя отменить.',
			confirmText: 'Удалить',
			cancelText: 'Отмена',
			destructive: true,
		})
		if (!confirmed) return
		try {
			const res = await apiFetch(`/api/tests/${testId}/question-drafts/${draft.id}`, { method: 'DELETE' })
			if (!res.ok) {
				const data = (await res.json().catch(() => null)) as { error?: string } | null
				throw new Error(data?.error || 'Не удалось удалить черновик вопроса')
			}
			await mutateQuestionDrafts()
			toast.success('Черновик вопроса удален')
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Ошибка удаления черновика вопроса')
		}
	}

	const handleEditQuestion = (index: number) => {
		const question = form.questions[index]
		if (!topicSlug || !testSlug || !question?.id) {
			toast.error('Не удалось открыть редактор вопроса')
			return
		}
		router.push(`/admin/tests/${topicSlug}/${testSlug}/questions/${question.id}`)
	}

	const handleDeleteQuestion = async (index: number) => {
		if (deletingQuestionId) return
		const question = form.questions[index]
		if (!question) return

		const confirmed = await confirm({
			title: 'Удалить вопрос?',
			description: 'Вопрос будет удален из теста сразу, без сохранения настроек теста.',
			confirmText: 'Удалить',
			cancelText: 'Отмена',
			destructive: true,
		})
		if (!confirmed) return

		if (isEditingExisting && testId && question.id) {
			setDeletingQuestionId(question.id)
			try {
				const res = await apiFetch(`/api/tests/${testId}/questions/${question.id}`, { method: 'DELETE' })
				if (!res.ok) {
					const data = (await res.json().catch(() => null)) as { error?: string } | null
					throw new Error(data?.error || 'Не удалось удалить вопрос')
				}

				setForm((prev) => ({
					...prev,
					questions: prev.questions.filter((q) => q.id !== question.id).map((q, i) => ({ ...q, order: i })),
				}))
				toast.success('Вопрос удален')
			} catch (err) {
				toast.error(err instanceof Error ? err.message : 'Ошибка удаления вопроса')
			} finally {
				setDeletingQuestionId(null)
			}
			return
		}

		setForm((prev) => ({
			...prev,
			questions: prev.questions.filter((_, i) => i !== index).map((q, i) => ({ ...q, order: i })),
		}))
		toast.success('Вопрос удален')
	}

	const handleSave = async () => {
		const baseValidationError = getBaseValidationError()
		if (baseValidationError) {
			toast.error(baseValidationError)
			return
		}
		if (isEditingExisting && form.isPublished && form.questions.length === 0) {
			toast.error('Для публикации добавьте хотя бы один вопрос')
			return
		}

		setSaving(true)
		try {
			if (!isEditingExisting) {
				const created = await persistNewTest()
				toast.success(
					created.forcedDraft
						? 'Тест сохранен как черновик. Добавьте хотя бы один вопрос для публикации.'
						: 'Тест создан'
				)
				router.push(`/admin/tests/${created.topicSlug}/${created.testSlug}`)
				return
			}

			const currentTestId = testData?.test?.id
			if (!currentTestId) {
				throw new Error('Не удалось определить ID теста')
			}
			const res = await apiFetch(`/api/tests/${currentTestId}/settings`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					topicId: form.topicId,
					title: form.title,
					slug: form.slug,
					description: form.description,
					isPublished: form.isPublished,
					showCorrectAnswer: form.showCorrectAnswer,
					scoringRules: form.scoringRules,
					timeLimitMinutes: form.timeLimitMinutes,
					redThresholdMinutes: form.redThresholdMinutes,
					warningThresholdMinutes: form.warningThresholdMinutes,
					passingScore: form.passingScore,
					order: form.order,
				}),
			})

			if (!res.ok) {
				const data = await res.json()
				throw new Error(data.error || 'Ошибка сохранения')
			}

			const data = await res.json()
			toast.success('Настройки теста сохранены')

			if (data.test) {
				// If slug or topic changed, update URL
				const newTopicSlug = data.test.topicSlug || topics.find((t) => t.id === form.topicId)?.slug
				if (newTopicSlug !== topicSlug || form.slug !== testSlug) {
					router.replace(`/admin/tests/${newTopicSlug}/${form.slug}`)
				}

				// If backend moved assets after rename/topic change, refresh test data to update references
				if (data.assetsMoved === true) {
					try {
						await mutateTest()
					} catch (e) {
						console.warn('Failed to revalidate test data after assets moved', e)
					}
				} else if (data.assetsMoved === false) {
					// Non-blocking warning for client-visible stale links
					toast.warning('Изображения не были перемещены — проверьте ссылки на вложения')
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
			const res = await apiFetch(`/api/tests/${testId}/export?withAnswers=${withAnswers}`)

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

	if (isEditingExisting && testLoading) {
		return (
			<div className="flex items-center justify-center p-12">
				<Loader2 className="h-8 w-8 animate-spin" />
			</div>
		)
	}

	return (
		<div className="space-y-6">
			<SetBreadcrumbsLabels labels={breadcrumbLabels} />
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-4">
					<div>
						<h1 className="text-2xl font-semibold">{isEditingExisting ? 'Редактирование теста' : 'Новый тест'}</h1>
						<p className="text-muted-foreground">
							{form.questions.length} вопросов
							{form.isPublished ? ' • Опубликован' : ' • Черновик'}
						</p>
					</div>
				</div>
				<div className="flex gap-2">
					{isEditingExisting && (
						<>
							<Button variant="secondary" onClick={() => handleExport(false)}>
								<Download className="mr-2 h-4 w-4" />
								Экспорт
							</Button>
							<Button variant="secondary" onClick={() => handleExport(true)}>
								<Download className="mr-2 h-4 w-4" />С ответами
							</Button>
						</>
					)}
				</div>
			</div>

			<div className="grid gap-6 lg:grid-cols-3">
				{/* Meta Form */}
				<Card className="h-fit lg:col-span-1">
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
										slug: isCreateMode ? transliterate(title) : form.slug,
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
								min={0}
								value={form.timeLimitMinutes || ''}
								onChange={(e) =>
									setForm({
										...form,
										timeLimitMinutes: e.target.value ? parseInt(e.target.value) : null,
									})
								}
								placeholder="Без лимита"
							/>
							{(form.timeLimitMinutes ?? 0) > 60 && (
								<p className="text-muted-foreground text-xs">
									{Math.floor(form.timeLimitMinutes! / 60)} ч{' '}
									{form.timeLimitMinutes! % 60 > 0 ? `${form.timeLimitMinutes! % 60} мин` : ''}
								</p>
							)}
						</div>

						{form.timeLimitMinutes ? (
							<div className="space-y-3">
								<div className="space-y-2">
									<Label>Красный таймер (мин до конца, null = глобальный)</Label>
									<div className="flex gap-2">
										<Input
											type="number"
											min={1}
											value={form.redThresholdMinutes ?? ''}
											onChange={(e) =>
												setForm({
													...form,
													redThresholdMinutes: e.target.value ? parseInt(e.target.value) : null,
												})
											}
											placeholder="Глобальный (5 мин)"
											className="flex-1"
										/>
										{form.redThresholdMinutes !== null && (
											<Button
												type="button"
												variant="ghost"
												size="sm"
												onClick={() => setForm({ ...form, redThresholdMinutes: null })}
											>
												Сброс
											</Button>
										)}
									</div>
								</div>
								<div className="space-y-2">
									<Label>Предупреждение (мин до конца, null = глобальный)</Label>
									<div className="flex gap-2">
										<Input
											type="number"
											min={1}
											value={form.warningThresholdMinutes ?? ''}
											onChange={(e) =>
												setForm({
													...form,
													warningThresholdMinutes: e.target.value ? parseInt(e.target.value) : null,
												})
											}
											placeholder="Глобальный (1 мин)"
											className="flex-1"
										/>
										{form.warningThresholdMinutes !== null && (
											<Button
												type="button"
												variant="ghost"
												size="sm"
												onClick={() => setForm({ ...form, warningThresholdMinutes: null })}
											>
												Сброс
											</Button>
										)}
									</div>
								</div>
							</div>
						) : null}

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

						<div className="space-y-3">
							<Label>Начисление баллов</Label>
							{isEditingExisting && topicSlug && testSlug ? (
								<div className="space-y-2">
									<Button variant="outline" asChild className="w-full">
										<Link href={`/admin/tests/scoring?scope=test&topicSlug=${topicSlug}&testSlug=${testSlug}`}>
											Настроить баллы для этого теста
										</Link>
									</Button>
									<Button variant="outline" asChild className="w-full">
										<Link href="/admin/tests/question-types">Настроить типы вопросов</Link>
									</Button>
								</div>
							) : (
								<p className="text-muted-foreground text-sm">
									Сохраните тест, чтобы настроить баллы для него отдельно.
								</p>
							)}
						</div>

						<div className="flex items-center justify-between pt-2">
							<Label>Опубликовать</Label>
							<Switch
								checked={form.isPublished}
								onCheckedChange={(checked) => setForm({ ...form, isPublished: checked })}
							/>
						</div>
						{isCreateMode && form.isPublished && form.questions.length === 0 ? (
							<p className="text-muted-foreground text-xs">
								Первое сохранение создаст черновик. Опубликовать тест можно после добавления хотя бы одного вопроса.
							</p>
						) : null}

						<div className="flex items-center justify-between pt-2">
							<Label>Показывать правильный ответ после проверки</Label>
							<Switch
								checked={form.showCorrectAnswer}
								onCheckedChange={(checked) => setForm({ ...form, showCorrectAnswer: checked })}
							/>
						</div>
						<Button onClick={handleSave} disabled={saving} className="w-full">
							{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
							Сохранить
						</Button>
					</CardContent>
				</Card>

				<div className="space-y-4 lg:col-span-2">
					{questionDrafts.length > 0 ? (
						<Card>
							<CardHeader>
								<CardTitle>Черновики вопросов</CardTitle>
							</CardHeader>
							<CardContent>
								{questionDrafts.map((draft) => (
									<div key={draft.id} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5">
										<Link
											className="min-w-0 flex-1 truncate text-sm hover:underline"
											href={`/admin/tests/${topicSlug}/${testSlug}/questions/drafts/${draft.id}`}
										>
											{resolveQuestionDraftLabel(draft)}
										</Link>
										<div className="text-muted-foreground text-xs">
											{new Date(draft.updatedAt).toLocaleString('ru-RU')}
										</div>
										<Button
											size="icon"
											variant="ghost"
											aria-label="Удалить черновик вопроса"
											onClick={() => handleDeleteQuestionDraft(draft)}
										>
											<Trash2 className="h-4 w-4" />
										</Button>
									</div>
								))}
							</CardContent>
						</Card>
					) : null}

					{/* Questions List */}
					<Card>
						<CardHeader className="flex flex-row items-center justify-between">
							<CardTitle>Вопросы</CardTitle>
							<Button onClick={handleAddQuestion} disabled={creatingQuestionDraft}>
								{creatingQuestionDraft ? (
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								) : (
									<Plus className="mr-2 h-4 w-4" />
								)}
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
													editHref={
														question.id && topicSlug && testSlug
															? `/admin/tests/${topicSlug}/${testSlug}/questions/${question.id}`
															: undefined
													}
													viewHref={
														question.id && topicSlug && testSlug
															? `/tests/${topicSlug}/${testSlug}#question-${question.id}`
															: undefined
													}
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
			</div>

			{/* Student Access Section */}
			{isEditingExisting && testId && (
				<div className="grid gap-6 lg:grid-cols-2">
					{/* Assigned students list */}
					<Card>
						<CardHeader>
							<CardTitle>Доступ студентов</CardTitle>
						</CardHeader>
						<CardContent>
							{!studentAssignmentsData ? (
								<div className="text-muted-foreground flex items-center gap-2 text-sm">
									<Loader2 className="h-4 w-4 animate-spin" />
									Загрузка...
								</div>
							) : studentAssignments.length === 0 ? (
								<p className="text-muted-foreground text-sm">Нет студентов с доступом к этому тесту</p>
							) : (
								<div className="space-y-2">
									{studentAssignments.map((a) => {
										const displayName = a.name || a.login || a.userId
										return (
											<div
												key={a.userId}
												className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
											>
												<div className="min-w-0 flex-1">
													<p className="truncate text-sm font-medium">{displayName}</p>
													{a.login && a.name && <p className="text-muted-foreground text-xs">{a.login}</p>}
												</div>
												<Button
													size="icon"
													variant="ghost"
													aria-label="Удалить доступ"
													onClick={() => handleRemoveStudent(a.userId)}
													disabled={removingUserId === a.userId}
												>
													{removingUserId === a.userId ? (
														<Loader2 className="h-4 w-4 animate-spin" />
													) : (
														<Trash2 className="h-4 w-4" />
													)}
												</Button>
											</div>
										)
									})}
								</div>
							)}
						</CardContent>
					</Card>

					{/* Assign student */}
					<Card>
						<CardHeader>
							<CardTitle>Добавить студента</CardTitle>
						</CardHeader>
						<CardContent>
							{!allUsersData ? (
								<div className="text-muted-foreground flex items-center gap-2 text-sm">
									<Loader2 className="h-4 w-4 animate-spin" />
									Загрузка пользователей...
								</div>
							) : availableUsers.length === 0 ? (
								<p className="text-muted-foreground text-sm">Все пользователи уже имеют доступ</p>
							) : (
								<div className="max-h-80 space-y-2 overflow-y-auto">
									{availableUsers.map((u) => {
										const fullName = [u.firstName, u.lastName].filter(Boolean).join(' ')
										const displayName = u.name || fullName || u.login || u.id
										return (
											<div key={u.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
												<div className="min-w-0 flex-1">
													<p className="truncate text-sm font-medium">{displayName}</p>
													{u.login && displayName !== u.login && (
														<p className="text-muted-foreground text-xs">{u.login}</p>
													)}
												</div>
												<Button
													size="sm"
													variant="outline"
													onClick={() => handleAssignStudent(u.id)}
													disabled={assigningUserId === u.id}
												>
													{assigningUserId === u.id ? (
														<Loader2 className="mr-1 h-3 w-3 animate-spin" />
													) : (
														<UserPlus className="mr-1 h-3 w-3" />
													)}
													Добавить
												</Button>
											</div>
										)
									})}
								</div>
							)}
						</CardContent>
					</Card>
				</div>
			)}

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
			{alertDialog}
		</div>
	)
}

import type { DragEndEvent } from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import useSWR from 'swr'

import { useUiAlertDialog } from '@/components/ui/use-ui-alert-dialog'

import { resolveInitialCreateModePersistence } from '../../lifecycle'
import type {
	QuestionDraft,
	QuestionDraftsResponse,
	TestDetailResponse,
	TestFormData,
	TopicsResponse,
} from '../../types'
import { normalizeQuestionForSave } from '../../types'
import {
	assignStudentToTest,
	createQuestionDraft,
	createTest,
	deleteQuestionDraft,
	deleteTestQuestion,
	exportTestArchive,
	removeStudentFromTest,
	reorderTestQuestions,
	updateTestSettings,
} from './test-editor-api'
import type { StudentAssignment, UserItem } from './test-editor-types'
import {
	createInitialTestForm,
	getBaseValidationError,
	getCreateQuestionsValidationError,
	normalizeFormPayload,
	resolveQuestionDraftId,
} from './test-editor-utils'

const fetcher = (url: string) => fetch(url, { credentials: 'include' }).then((r) => r.json())

interface UseTestEditorModelParams {
	topicSlug?: string
	testSlug?: string
}

interface CreateTestPersistenceResult {
	testId: string
	topicSlug: string
	testSlug: string
	forcedDraft: boolean
}

export function useTestEditorModel({ topicSlug, testSlug }: UseTestEditorModelParams) {
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
	const { data: studentAssignmentsData, mutate: mutateStudentAssignments } = useSWR<{
		assignments: StudentAssignment[]
	}>(testId ? `/api/tests/${testId}/assignments` : null, fetcher)
	const { data: allUsersData } = useSWR<{ rows: UserItem[]; total: number }>(testId ? '/api/users' : null, fetcher)

	const [assigningUserId, setAssigningUserId] = useState<string | null>(null)
	const [removingUserId, setRemovingUserId] = useState<string | null>(null)
	const [testSlugError, setTestSlugError] = useState<string | null>(null)
	const [saving, setSaving] = useState(false)
	const [creatingQuestionDraft, setCreatingQuestionDraft] = useState(false)
	const [deletingQuestionId, setDeletingQuestionId] = useState<string | null>(null)
	const [reorderingQuestions, setReorderingQuestions] = useState(false)
	const [topicDialogOpen, setTopicDialogOpen] = useState(false)
	const [form, setForm] = useState<TestFormData>(() => createInitialTestForm())

	const topics = useMemo(() => topicsData?.topics ?? [], [topicsData])
	const questionDrafts = useMemo(() => questionDraftsData?.drafts ?? [], [questionDraftsData])
	const studentAssignments = useMemo(() => studentAssignmentsData?.assignments ?? [], [studentAssignmentsData])
	const assignedUserIds = useMemo(() => new Set(studentAssignments.map((a) => a.userId)), [studentAssignments])
	const availableUsers = useMemo(
		() => (allUsersData?.rows ?? []).filter((u) => !assignedUserIds.has(u.id)),
		[allUsersData, assignedUserIds]
	)

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

	useEffect(() => {
		if (!isCreateMode) return
		if (topics.length === 0 || form.topicId) return

		setForm((prev) => ({ ...prev, topicId: topics[0].id }))
	}, [isCreateMode, topics, form.topicId])

	const handleAssignStudent = useCallback(
		async (userId: string) => {
			if (!testId || assigningUserId) return
			setAssigningUserId(userId)
			try {
				await assignStudentToTest(testId, userId)
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
				await removeStudentFromTest(testId, userId)
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

	const persistNewTest = useCallback(async (): Promise<CreateTestPersistenceResult> => {
		const baseValidationError = getBaseValidationError(form)
		if (baseValidationError) {
			throw new Error(baseValidationError)
		}

		const questionsValidationError = getCreateQuestionsValidationError(form.questions)
		if (questionsValidationError) {
			throw new Error(questionsValidationError)
		}

		const { shouldForceDraft, persistedPublicationState } = resolveInitialCreateModePersistence({
			questionCount: form.questions.length,
			requestedPublicationState: form.isPublished,
		})

		const data = await createTest(
			normalizeFormPayload({
				...form,
				isPublished: persistedPublicationState,
			})
		)
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
	}, [form, topics])

	const handleCreateTopic = () => setTopicDialogOpen(true)

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
			await reorderTestQuestions(testId, questionIds)
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

			const data = await createQuestionDraft(resolvedTestId)
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
			await deleteQuestionDraft(testId, draft.id)
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
				await deleteTestQuestion(testId, question.id)

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
		const baseValidationError = getBaseValidationError(form)
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
			const data = await updateTestSettings(currentTestId, form)
			toast.success('Настройки теста сохранены')

			if (data.test) {
				const newTopicSlug = data.test.topicSlug || topics.find((t) => t.id === form.topicId)?.slug
				if (newTopicSlug !== topicSlug || form.slug !== testSlug) {
					router.replace(`/admin/tests/${newTopicSlug}/${form.slug}`)
				}

				if (data.assetsMoved === true) {
					try {
						await mutateTest()
					} catch (e) {
						console.warn('Failed to revalidate test data after assets moved', e)
					}
				} else if (data.assetsMoved === false) {
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
			await exportTestArchive(testId, form.slug, withAnswers)
			toast.success('Тест экспортирован')
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Ошибка экспорта')
		}
	}

	const handleTopicSaved = (topic?: { id?: string } | null) => {
		mutateTopics()
		if (topic?.id) setForm((f) => ({ ...f, topicId: topic.id! }))
	}

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

	const headerProps = {
		title: form.title,
		questionCount: form.questions.length,
		isEditingExisting,
		isPublished: form.isPublished,
		timeLimitMinutes: form.timeLimitMinutes,
		saving,
		onSave: handleSave,
		onExport: handleExport,
	}

	const settingsPanelProps = {
		form,
		setForm,
		topics,
		isCreateMode,
		isEditingExisting,
		topicSlug,
		testSlug,
		testSlugError,
		setTestSlugError,
		saving,
		onCreateTopic: handleCreateTopic,
		onSave: handleSave,
	}

	const questionsPanelProps = {
		questions: form.questions,
		questionDrafts,
		topicSlug,
		testSlug,
		creatingQuestionDraft,
		onAddQuestion: handleAddQuestion,
		onDeleteQuestionDraft: handleDeleteQuestionDraft,
		onEditQuestion: handleEditQuestion,
		onDeleteQuestion: handleDeleteQuestion,
		onDragEnd: handleDragEnd,
	}

	const studentAccessPanelProps = {
		assignmentsLoaded: Boolean(studentAssignmentsData),
		usersLoaded: Boolean(allUsersData),
		studentAssignments,
		availableUsers,
		assigningUserId,
		removingUserId,
		onAssignStudent: handleAssignStudent,
		onRemoveStudent: handleRemoveStudent,
	}

	const topicDialogProps = {
		open: topicDialogOpen,
		onOpenChange: setTopicDialogOpen,
		initialOrder: topics.length,
		onSaved: handleTopicSaved,
	}

	return {
		alertDialog,
		breadcrumbLabels,
		headerProps,
		isEditingExisting,
		isLoading: isEditingExisting && testLoading,
		questionsPanelProps,
		settingsPanelProps,
		studentAccessPanelProps,
		testId,
		topicDialogProps,
	}
}

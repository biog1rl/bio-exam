import type { DragEndEvent } from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import useSWR from 'swr'

import { useAuth } from '@/components/providers/AuthProvider'
import { useUiAlertDialog } from '@/components/ui/use-ui-alert-dialog'
import { swrFetcher } from '@/lib/http/swr'
import { adminTestsKeys, questionTypesFetcher, topicsListFetcher } from '@/lib/tests/admin-api'
import { canManageCatalog, testTopicPickerState } from '@/lib/tests/bank-view'
import { usersKeys } from '@/lib/users/api'
import { isStudentOnly } from '@/lib/users/student-card'

import { resolveInitialCreateModePersistence } from '../../lifecycle'
import type { QuestionDraft, TestFormData } from '../../types'
import { normalizeQuestionForSave } from '../../types'
import {
	actionErrorMessage,
	assignStudentToTest,
	createQuestionDraft,
	createTest,
	deleteQuestionDraft,
	deleteTestQuestion,
	exportTestFromEditor,
	questionDraftsFetcher,
	removeStudentFromTest,
	reorderTestQuestions,
	testAssignmentsFetcher,
	testDetailFetcher,
	testSaveFailure,
	testSummaryFetcher,
	updateTestSettings,
} from './test-editor-api'
import type { UserItem } from './test-editor-types'
import {
	createInitialTestForm,
	getBaseValidationError,
	getCreateQuestionsValidationError,
	normalizeFormPayload,
	resolveQuestionDraftId,
} from './test-editor-utils'
import { savedSettings, settingsDirty, totalPoints } from './test-editor-view'

const CANDIDATES_LIMIT = 500

function toastActionError(error: unknown, fallback: string) {
	const message = actionErrorMessage(error, fallback)
	if (message) toast.error(message)
}

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
	const { perms } = useAuth()
	const catalog = canManageCatalog(perms)
	const isEditingExisting = Boolean(topicSlug && testSlug)
	const isCreateMode = !isEditingExisting

	const {
		data: topicsData,
		mutate: mutateTopics,
		isLoading: topicsLoading,
		error: topicsError,
	} = useSWR(adminTestsKeys.topics(), topicsListFetcher)
	const {
		data: testData,
		mutate: mutateTest,
		error: testError,
	} = useSWR(
		isEditingExisting && topicSlug && testSlug ? adminTestsKeys.bySlug(topicSlug, testSlug, 'summary') : null,
		testSummaryFetcher,
		{ revalidateOnFocus: false }
	)
	const {
		data: questionsData,
		mutate: mutateQuestions,
		error: questionsError,
	} = useSWR(
		isEditingExisting && topicSlug && testSlug ? adminTestsKeys.bySlug(topicSlug, testSlug) : null,
		testDetailFetcher,
		{ revalidateOnFocus: false }
	)
	const testId = testData?.test?.id
	const { data: questionDraftsData, mutate: mutateQuestionDrafts } = useSWR(
		testId ? adminTestsKeys.questionDrafts(testId) : null,
		questionDraftsFetcher
	)
	const { data: studentAssignmentsData, mutate: mutateStudentAssignments } = useSWR(
		testId ? adminTestsKeys.assignments(testId) : null,
		testAssignmentsFetcher
	)
	const { data: allUsersData } = useSWR<{ rows: UserItem[]; total: number }>(
		testId ? `${usersKeys.list()}?limit=${CANDIDATES_LIMIT}` : null,
		swrFetcher
	)
	const { data: questionTypesData } = useSWR(
		isCreateMode ? adminTestsKeys.questionTypes({ includeInactive: true }) : null,
		questionTypesFetcher
	)
	const testLoadFailed = isEditingExisting && testError !== undefined && testData === undefined
	const questionsLoadFailed = isEditingExisting && questionsError !== undefined && questionsData === undefined

	const [assigningUserId, setAssigningUserId] = useState<string | null>(null)
	const [removingUserId, setRemovingUserId] = useState<string | null>(null)
	const [testSlugError, setTestSlugError] = useState<string | null>(null)
	const [saving, setSaving] = useState(false)
	const [creatingQuestionDraft, setCreatingQuestionDraft] = useState(false)
	const [deletingQuestionId, setDeletingQuestionId] = useState<string | null>(null)
	const [reorderingQuestions, setReorderingQuestions] = useState(false)
	const [topicDialogOpen, setTopicDialogOpen] = useState(false)
	const [settingsOpen, setSettingsOpen] = useState(isCreateMode)
	const [form, setForm] = useState<TestFormData>(() => createInitialTestForm())

	const topics = useMemo(() => topicsData?.topics ?? [], [topicsData])
	const questionDrafts = useMemo(() => questionDraftsData?.drafts ?? [], [questionDraftsData])
	const studentAssignments = useMemo(() => studentAssignmentsData?.assignments ?? [], [studentAssignmentsData])
	const assignedUserIds = useMemo(() => new Set(studentAssignments.map((a) => a.userId)), [studentAssignments])
	const availableUsers = useMemo(
		() => (allUsersData?.rows ?? []).filter((u) => !assignedUserIds.has(u.id) && isStudentOnly(u.roles ?? [])),
		[allUsersData, assignedUserIds]
	)

	useEffect(() => {
		if (!isEditingExisting) return
		if (testData?.test) {
			setForm((prev) => ({
				...prev,
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
			}))
		}
	}, [isEditingExisting, testData])

	useEffect(() => {
		if (!isEditingExisting || !questionsData?.questions) return
		setForm((prev) => ({
			...prev,
			questions: questionsData.questions.map((q, i) => ({
				...normalizeQuestionForSave(q),
				order: q.order ?? i,
			})),
		}))
	}, [isEditingExisting, questionsData])

	const questionCount = questionsData ? form.questions.length : (testData?.questionsCount ?? form.questions.length)
	const saved = useMemo(() => (testData?.test ? savedSettings(testData.test) : null), [testData])
	const dirty = isEditingExisting && settingsDirty(form, saved)

	const discardChanges = () => {
		if (!saved) return
		setTestSlugError(null)
		setForm((prev) => ({ ...prev, ...saved }))
	}

	const presetTopicSlug = useSearchParams()?.get('topic') ?? null

	useEffect(() => {
		if (!isCreateMode) return
		if (topics.length === 0 || form.topicId) return

		const preset = topics.find((topic) => topic.slug === presetTopicSlug)
		setForm((prev) => ({ ...prev, topicId: (preset ?? topics[0]).id }))
	}, [isCreateMode, topics, form.topicId, presetTopicSlug])

	const handleAssignStudent = useCallback(
		async (userId: string) => {
			if (!testId || assigningUserId) return
			setAssigningUserId(userId)
			try {
				await assignStudentToTest(testId, userId)
				await mutateStudentAssignments()
				toast.success('Доступ выдан')
			} catch (err) {
				toastActionError(err, 'Ошибка назначения студента')
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
				toast.success('Доступ убран')
			} catch (err) {
				toastActionError(err, 'Ошибка удаления студента')
			} finally {
				setRemovingUserId(null)
			}
		},
		[testId, removingUserId, mutateStudentAssignments]
	)

	const applySaveFailure = useCallback((error: unknown): string => {
		const failure = testSaveFailure(error, 'Ошибка сохранения')
		if (failure.slugError) {
			setTestSlugError(failure.slugError)
			setSettingsOpen(true)
		}
		return failure.toast
	}, [])

	const persistNewTest = useCallback(async (): Promise<CreateTestPersistenceResult> => {
		const baseValidationError = getBaseValidationError(form)
		if (baseValidationError) {
			throw new Error(baseValidationError)
		}

		const questionsValidationError = getCreateQuestionsValidationError(form.questions, questionTypesData?.questionTypes)
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
		).catch((error: unknown) => {
			throw new Error(applySaveFailure(error))
		})
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
	}, [form, topics, questionTypesData, applySaveFailure])

	const handleCreateTopic = () => {
		if (!catalog) return
		setTopicDialogOpen(true)
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
			await reorderTestQuestions(testId, questionIds)
		} catch (err) {
			setForm((prev) => ({ ...prev, questions: previousQuestions }))
			toastActionError(err, 'Не удалось сохранить порядок вопросов')
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
			toastActionError(err, 'Не удалось создать черновик вопроса')
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
			toastActionError(err, 'Не удалось удалить черновик вопроса')
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
				toastActionError(err, 'Не удалось удалить вопрос')
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
		if (isEditingExisting && form.isPublished && questionCount === 0) {
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
			const data = await updateTestSettings(currentTestId, form).catch((error: unknown) => {
				throw new Error(applySaveFailure(error))
			})
			await mutateTest()
			setSettingsOpen(false)
			toast.success('Настройки теста сохранены')

			if (data.test) {
				const newTopicSlug = data.test.topicSlug || topics.find((t) => t.id === form.topicId)?.slug
				if (newTopicSlug !== topicSlug || form.slug !== testSlug) {
					router.replace(`/admin/tests/${newTopicSlug}/${form.slug}`)
				}
			}
		} catch (err) {
			toastActionError(err, 'Ошибка сохранения')
		} finally {
			setSaving(false)
		}
	}

	const handleExport = async (withAnswers: boolean) => {
		const testId = testData?.test?.id
		if (!testId) return

		const result = await exportTestFromEditor(testId, withAnswers)
		if (result?.kind === 'success') toast.success(result.text)
		else if (result) toast.error(result.text)
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
		totalPoints: totalPoints(form.questions),
		onPublishedChange: (isPublished: boolean) => setForm((prev) => ({ ...prev, isPublished })),
		route: topicSlug && testSlug ? { topicSlug, testSlug } : null,
		questionCount,
		isEditingExisting,
		isPublished: form.isPublished,
		timeLimitMinutes: form.timeLimitMinutes,
		settingsDirty: dirty,
		onExport: handleExport,
		onOpenSettings: () => setSettingsOpen(true),
	}

	const saveDisabled =
		!topicsLoading &&
		!topicsError &&
		testTopicPickerState({ topics: topics.length, canManage: catalog }) === 'ask-admin'
	const onDiscard = isCreateMode ? undefined : discardChanges

	const settingsSheetProps = {
		open: settingsOpen,
		onOpenChange: setSettingsOpen,
		isNew: isCreateMode,
		dirty,
		saving,
		saveDisabled,
		onSave: handleSave,
		onDiscard,
		panel: {
			form,
			setForm,
			topics,
			topicsLoading,
			topicsError: Boolean(topicsError),
			isCreateMode,
			isEditingExisting,
			topicSlug,
			testSlug,
			testSlugError,
			setTestSlugError,
			canManageCatalog: catalog,
			onCreateTopic: handleCreateTopic,
		},
	}

	const saveBarProps = {
		visible: (isCreateMode || dirty) && !settingsOpen,
		isNew: isCreateMode,
		saving,
		disabled: saveDisabled,
		onSave: handleSave,
		onDiscard,
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

	const studentAccessToolbarProps = {
		usersLoaded: Boolean(allUsersData),
		availableUsers,
		assigningUserId,
		onAssignStudent: handleAssignStudent,
	}

	const studentAccessPanelProps = {
		assignmentsLoaded: Boolean(studentAssignmentsData),
		studentAssignments,
		removingUserId,
		onRemoveStudent: handleRemoveStudent,
	}

	const topicDialogProps = {
		open: topicDialogOpen && catalog,
		onOpenChange: setTopicDialogOpen,
		initialOrder: topics.length,
		onSaved: handleTopicSaved,
	}

	return {
		alertDialog,
		breadcrumbLabels,
		headerProps,
		isEditingExisting,
		isLoading: isEditingExisting && testData === undefined,
		testError: testLoadFailed ? testError : undefined,
		retryTest: () => mutateTest(),
		questionsLoading: isEditingExisting && questionsData === undefined,
		questionsError: questionsLoadFailed ? questionsError : undefined,
		retryQuestions: () => mutateQuestions(),
		questionsPanelProps,
		saveBarProps,
		settingsSheetProps,
		isCreateMode,
		assignedCount: studentAssignments.length,
		studentAccessToolbarProps,
		studentAccessPanelProps,
		testId,
		topicDialogProps,
	}
}

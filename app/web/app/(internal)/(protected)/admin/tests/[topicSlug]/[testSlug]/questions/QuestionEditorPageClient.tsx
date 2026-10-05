'use client'

import { normalizeKeyValue } from '@bio-exam/exam-core'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ArrowRightLeft, Loader2 } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import useSWR from 'swr'

import { SetBreadcrumbsLabels } from '@/components/Breadcrumbs/SetBreadcrumbsLabels'
import { UnsavedChangesDialog } from '@/components/Buttons/UnsavedChangesDialog'
import { useAuth } from '@/components/providers/AuthProvider'
import { Button } from '@/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createBeforeUnloadGuard } from '@/lib/drafts/before-unload'
import { type AutosaveStatusView, autosaveStatusView, UNSAVED_CHANGES_TEXT } from '@/lib/drafts/draft-ui'
import type { QuestionDraftAutosave } from '@/lib/drafts/question-draft-autosave'
import { useQuestionDraftAutosave } from '@/lib/drafts/use-question-draft-autosave'
import { failureMessage, failureOf } from '@/lib/http/errors'
import { adminTestsKeys, adminTestsListFetcher, questionTypesFetcher, topicsListFetcher } from '@/lib/tests/admin-api'
import { type LeaveDecision, useUnsavedChanges } from '@/store/unsavedChanges.store'

import QuestionEditor from '../../../components/QuestionEditor'
import {
	actionErrorMessage,
	deleteQuestionDraft,
	moveTestQuestion,
	questionDraftDetailFetcher,
	saveTestQuestion,
	testDetailFetcher,
} from '../../../components/test-editor/test-editor-api'
import { validateQuestion } from '../../../question-validation'
import type { Question } from '../../../types'
import { createDefaultQuestion, normalizeQuestionForSave } from '../../../types'
import { questionFormKey, toQuestionDraftPayload } from './question-draft-payload'

function loadFailureText(error: unknown): string {
	return failureMessage(failureOf(error), 'Не удалось загрузить тест')
}

function toastActionError(error: unknown, fallback: string) {
	const message = actionErrorMessage(error, fallback)
	if (message) toast.error(message)
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null
}

function normalizeDraftOptions(value: unknown): Question['options'] {
	if (!Array.isArray(value)) return null
	const options = value
		.filter(
			(item): item is { id: string; text: string } =>
				isRecord(item) && typeof item.id === 'string' && typeof item.text === 'string'
		)
		.map((item) => ({ id: item.id, text: item.text }))
	return options.length > 0 ? options : null
}

function normalizeDraftMatchingPairs(value: unknown): Question['matchingPairs'] {
	if (!isRecord(value)) return null
	const left = normalizeDraftOptions(value.left)
	const right = normalizeDraftOptions(value.right)
	if (!left || !right) return null
	return { left, right }
}

function extractQuestionFromDraftPayload(payload: unknown, order: number): Question | null {
	const payloadRecord = isRecord(payload) ? payload : null
	const candidate = payloadRecord && 'question' in payloadRecord ? payloadRecord.question : payload
	if (!isRecord(candidate) || typeof candidate.type !== 'string' || typeof candidate.promptText !== 'string') {
		return null
	}

	const fallback = createDefaultQuestion(order)
	return normalizeQuestionForSave({
		...fallback,
		...candidate,
		id: undefined,
		order,
		promptText: candidate.promptText,
		explanationText:
			typeof candidate.explanationText === 'string' || candidate.explanationText === null
				? candidate.explanationText
				: null,
		options: normalizeDraftOptions(candidate.options),
		matchingPairs: normalizeDraftMatchingPairs(candidate.matchingPairs),
		correct: normalizeKeyValue(candidate.correct),
	})
}

function questionFromDraftPayload(payload: unknown, order: number): Question {
	return extractQuestionFromDraftPayload(payload, order) ?? createDefaultQuestion(order)
}

function statusFor(view: AutosaveStatusView | null, onRetry: () => void) {
	return view ? { view, onRetry } : null
}

type DraftForm = { source: QuestionDraftAutosave; question: Question; version: number }

interface Props {
	topicSlug: string
	testSlug: string
	questionId?: string
	questionDraftId?: string
}

export default function QuestionEditorPageClient({ topicSlug, testSlug, questionId, questionDraftId }: Props) {
	const router = useRouter()
	const pathname = usePathname() || '/'
	const { me } = useAuth()
	const setUnsavedDirty = useUnsavedChanges((s) => s.setDirty)
	const clearUnsaved = useUnsavedChanges((s) => s.clear)
	const leaveUnsaved = useUnsavedChanges((s) => s.leave)
	const isLeaving = useUnsavedChanges((s) => !!s.leavingByPath[pathname])
	const [isSaving, setIsSaving] = useState(false)
	const [isFormDirty, setIsFormDirty] = useState(false)
	const [leaveDialogOpen, setLeaveDialogOpen] = useState(false)
	const [leaveDescription, setLeaveDescription] = useState(UNSAVED_CHANGES_TEXT.description)
	const handledLeaveRef = useRef<Promise<LeaveDecision> | null>(null)
	const [moving, setMoving] = useState(false)
	const [moveDialogOpen, setMoveDialogOpen] = useState(false)
	const [targetTopicId, setTargetTopicId] = useState('')
	const [targetTestId, setTargetTestId] = useState('')
	const [draftForm, setDraftForm] = useState<DraftForm | null>(null)
	const isDraftMode = Boolean(questionDraftId)
	const isNewQuestion = questionId === undefined
	const isEditingExistingQuestion = Boolean(questionId)
	const isEditMode = isEditingExistingQuestion && !isDraftMode

	const {
		data: testData,
		error,
		isLoading,
		mutate,
	} = useSWR(adminTestsKeys.bySlug(topicSlug, testSlug), testDetailFetcher, { revalidateOnFocus: false })
	const { data: questionTypesData } = useSWR(
		testData?.test?.id ? adminTestsKeys.questionTypes({ testId: testData.test.id, includeInactive: true }) : null,
		questionTypesFetcher
	)
	const { data: topicsData } = useSWR(adminTestsKeys.topics(), topicsListFetcher)
	const { data: testsData } = useSWR(adminTestsKeys.list(), adminTestsListFetcher)
	const { data: questionDraftData, error: questionDraftError } = useSWR(
		isDraftMode && testData?.test?.id && questionDraftId
			? adminTestsKeys.questionDraft(testData.test.id, questionDraftId)
			: null,
		questionDraftDetailFetcher,
		{ revalidateOnFocus: false }
	)

	const draftOrder = testData?.questions.length ?? 0

	const serverDraft = useMemo(() => {
		if (!isDraftMode || !questionDraftData || !testData) return undefined
		const order = testData.questions.length
		return {
			payload: toQuestionDraftPayload(questionFromDraftPayload(questionDraftData.draft?.payload, order), order),
			lockVersion: questionDraftData.draft?.lockVersion ?? 0,
		}
	}, [isDraftMode, questionDraftData, testData])

	const restoreDraftCopy = useCallback(
		(payload: unknown) => {
			setDraftForm((prev) =>
				prev ? { ...prev, question: questionFromDraftPayload(payload, draftOrder), version: prev.version + 1 } : prev
			)
		},
		[draftOrder]
	)

	const { autosave, snapshot: autosaveSnapshot } = useQuestionDraftAutosave({
		testId: testData?.test?.id,
		draftId: questionDraftId,
		userId: me?.id,
		serverDraft,
		pathname,
		onRestoreCopy: restoreDraftCopy,
	})

	if (autosave && draftForm?.source !== autosave) {
		setDraftForm({
			source: autosave,
			question: questionFromDraftPayload(autosave.initialPayload, draftOrder),
			version: 0,
		})
	}

	const availableTopics = useMemo(() => {
		const allTopics = topicsData?.topics ?? []
		const currentTopicId = testData?.test?.topicId
		return allTopics.filter((topic) => topic.id !== currentTopicId)
	}, [topicsData, testData?.test?.topicId])

	const availableTests = useMemo(() => {
		const allTests = testsData?.tests ?? []
		const currentTestId = testData?.test?.id
		return allTests.filter((test) => test.id !== currentTestId && test.topicId === targetTopicId)
	}, [testsData, targetTopicId, testData?.test?.id])

	const currentQuestion = useMemo(() => {
		if (!testData) return null
		if (isDraftMode) return draftForm?.question ?? null
		if (isNewQuestion) return createDefaultQuestion(testData.questions.length)
		const found = testData.questions.find((question) => question.id === questionId) ?? null
		return found ? normalizeQuestionForSave(found) : null
	}, [testData, isDraftMode, draftForm?.question, isNewQuestion, questionId])

	const savedFormKey = useMemo(
		() => (isEditMode && currentQuestion ? questionFormKey(currentQuestion) : null),
		[isEditMode, currentQuestion]
	)

	const handleEditFormChange = useCallback(
		(nextQuestion: Question) => {
			if (savedFormKey === null) return
			setIsFormDirty(questionFormKey(nextQuestion) !== savedFormKey)
		},
		[savedFormKey]
	)

	useEffect(() => {
		if (!isEditMode) return
		setUnsavedDirty(pathname, isFormDirty)
	}, [isEditMode, pathname, isFormDirty, setUnsavedDirty])

	useEffect(() => {
		if (!isEditMode) return
		return () => clearUnsaved(pathname)
	}, [isEditMode, pathname, clearUnsaved])

	useEffect(() => {
		if (!isEditMode) return
		const guard = createBeforeUnloadGuard(window)
		guard.setActive(isFormDirty)
		return () => guard.dispose()
	}, [isEditMode, isFormDirty])

	const breadcrumbLabels = useMemo(() => {
		const labels: Record<string, string> = {}
		const topicTitle = testData?.test?.topicTitle
		const testTitle = testData?.test?.title

		if (topicTitle) {
			labels[`/admin/tests/${topicSlug}`] = topicTitle
		}
		if (testTitle) {
			labels[`/admin/tests/${topicSlug}/${testSlug}`] = testTitle
		}
		if (isDraftMode && questionDraftId) {
			labels[`/admin/tests/${topicSlug}/${testSlug}/questions/drafts/${questionDraftId}`] = 'Черновик вопроса'
		}
		if (!isDraftMode && isEditingExistingQuestion && questionId) {
			labels[`/admin/tests/${topicSlug}/${testSlug}/questions/${questionId}`] = 'Редактирование вопроса'
		}

		return labels
	}, [
		isDraftMode,
		isEditingExistingQuestion,
		questionDraftId,
		questionId,
		testData?.test?.title,
		testData?.test?.topicTitle,
		testSlug,
		topicSlug,
	])

	const backToTestEditor = useCallback(() => {
		router.push(`/admin/tests/${topicSlug}/${testSlug}`)
	}, [router, topicSlug, testSlug])

	const leaveDraft = useCallback(async () => {
		const pending = leaveUnsaved(pathname)
		if (handledLeaveRef.current === pending) return
		handledLeaveRef.current = pending
		try {
			const decision = await pending
			if (decision.kind === 'navigate') {
				backToTestEditor()
				return
			}
			setLeaveDescription(decision.description)
			setLeaveDialogOpen(true)
		} finally {
			if (handledLeaveRef.current === pending) handledLeaveRef.current = null
		}
	}, [leaveUnsaved, pathname, backToTestEditor])

	const handleCancel = useCallback(() => {
		if (isDraftMode) {
			void leaveDraft()
			return
		}
		if (isEditMode && isFormDirty) {
			setLeaveDescription(UNSAVED_CHANGES_TEXT.description)
			setLeaveDialogOpen(true)
			return
		}
		backToTestEditor()
	}, [isDraftMode, leaveDraft, isEditMode, isFormDirty, backToTestEditor])

	const leaveWithoutSaving = useCallback(() => {
		clearUnsaved(pathname)
		backToTestEditor()
	}, [clearUnsaved, pathname, backToTestEditor])

	const handleQuestionDraftChange = useCallback(
		(nextQuestion: Question) => {
			autosave?.change(toQuestionDraftPayload(nextQuestion, draftOrder))
		},
		[autosave, draftOrder]
	)

	const openMoveDialog = useCallback(() => {
		if (!isEditingExistingQuestion || !testData?.test?.id || !questionId) {
			toast.error('Сначала сохраните вопрос')
			return
		}

		if (availableTopics.length === 0) {
			toast.error('Нет доступных тем для переноса')
			return
		}

		const initialTopicId = availableTopics[0].id
		const initialTest = (testsData?.tests ?? []).find(
			(test) => test.topicId === initialTopicId && test.id !== testData.test.id
		)
		setTargetTopicId(initialTopicId)
		setTargetTestId(initialTest?.id || '')
		setMoveDialogOpen(true)
	}, [isEditingExistingQuestion, questionId, testData, testsData, availableTopics])

	const handleTargetTopicChange = useCallback(
		(nextTopicId: string) => {
			setTargetTopicId(nextTopicId)
			const nextTest = (testsData?.tests ?? []).find(
				(test) => test.topicId === nextTopicId && test.id !== testData?.test?.id
			)
			setTargetTestId(nextTest?.id || '')
		},
		[testsData, testData?.test?.id]
	)

	const handleMoveQuestion = useCallback(async () => {
		if (!testData?.test?.id || !questionId) return
		if (!targetTopicId) {
			toast.error('Выберите тему назначения')
			return
		}

		setMoving(true)
		try {
			const target = await moveTestQuestion(
				testData.test.id,
				questionId,
				targetTestId ? { targetTestId } : { targetTopicId }
			)

			toast.success('Вопрос перенесен')
			setMoveDialogOpen(false)
			router.push(`/admin/tests/${target.topicSlug}/${target.testSlug}/questions/${questionId}`)
		} catch (err) {
			toastActionError(err, 'Ошибка переноса вопроса')
		} finally {
			setMoving(false)
		}
	}, [testData, questionId, targetTopicId, targetTestId, router])

	const handleSaveQuestion = useCallback(
		async (nextQuestion: Question) => {
			if (!testData?.test?.id) return

			const validationError = validateQuestion(nextQuestion, questionTypesData?.questionTypes)
			if (validationError) {
				toast.error(validationError)
				return
			}

			const appendAsNew = isDraftMode || isNewQuestion
			const payloadQuestion = normalizeQuestionForSave({
				...nextQuestion,
				id: undefined,
				order: appendAsNew ? testData.questions.length : nextQuestion.order,
			})

			setIsSaving(true)
			if (isDraftMode) await autosave?.closeForSave()
			let questionStored = false
			try {
				await saveTestQuestion(testData.test.id, appendAsNew ? null : (questionId ?? null), payloadQuestion)
				questionStored = true

				if (isDraftMode && questionDraftId) {
					try {
						await deleteQuestionDraft(testData.test.id, questionDraftId)
					} catch {
						console.warn('Failed to delete question draft after save', questionDraftId)
					}
					autosave?.discardCopy()
					clearUnsaved(pathname)
				}

				await mutate()
				toast.success(appendAsNew ? 'Вопрос добавлен' : 'Вопрос сохранен')
				if (isEditMode) {
					setIsFormDirty(false)
					clearUnsaved(pathname)
				}
				backToTestEditor()
			} catch (err) {
				if (isDraftMode && !questionStored) autosave?.reopen()
				toastActionError(err, 'Ошибка сохранения вопроса')
			} finally {
				setIsSaving(false)
			}
		},
		[
			testData,
			questionTypesData,
			isDraftMode,
			autosave,
			isNewQuestion,
			isEditMode,
			questionId,
			questionDraftId,
			mutate,
			clearUnsaved,
			pathname,
			backToTestEditor,
		]
	)

	const testFailed = error !== undefined && testData === undefined
	const draftFailed = questionDraftError !== undefined && questionDraftData === undefined
	const loadFailure = testFailed ? error : draftFailed ? questionDraftError : undefined
	const loadText = loadFailure === undefined ? '' : loadFailureText(loadFailure)
	const authPending = loadFailure !== undefined && !loadText

	if (authPending || isLoading || (isDraftMode && !draftForm && !draftFailed && !testFailed)) {
		return (
			<div className="flex items-center justify-center rounded-4xl border border-border/80 bg-card/90 p-12 shadow-sm">
				<Loader2 className="size-8 animate-spin text-primary" />
			</div>
		)
	}

	if (loadFailure !== undefined || !testData) {
		return (
			<div className="rounded-4xl border border-border/80 bg-card/90 p-unit shadow-sm">
				<p className="text-sm text-red-600">{loadText || 'Не удалось загрузить данные'}</p>
				<Button variant="outline" onClick={backToTestEditor} className="rounded-full">
					Назад к тесту
				</Button>
			</div>
		)
	}

	if (!currentQuestion) {
		return (
			<div className="rounded-4xl border border-border/80 bg-card/90 p-unit shadow-sm">
				<p className="text-sm text-red-600">
					{isEditingExistingQuestion ? 'Вопрос не найден' : 'Черновик вопроса не найден'}
				</p>
				<Button variant="outline" onClick={backToTestEditor} className="rounded-full">
					Назад к тесту
				</Button>
			</div>
		)
	}

	return (
		<div className={isSaving ? 'pointer-events-none opacity-80' : undefined}>
			<SetBreadcrumbsLabels labels={breadcrumbLabels} />
			<QuestionEditor
				key={isDraftMode ? `draft-${draftForm?.version ?? 0}` : undefined}
				question={currentQuestion}
				questionTypes={questionTypesData?.questionTypes ?? []}
				onSave={handleSaveQuestion}
				onDraftChange={isDraftMode ? handleQuestionDraftChange : isEditMode ? handleEditFormChange : undefined}
				onCancel={handleCancel}
				headerActions={
					isEditingExistingQuestion && questionId ? (
						<Button variant="secondary" onClick={openMoveDialog} disabled={moving} className="rounded-full">
							<ArrowRightLeft className="mr-2 size-4" />
							Перенести
						</Button>
					) : undefined
				}
				isSaving={isSaving}
				autosaveStatus={
					isDraftMode
						? autosave && autosaveSnapshot
							? statusFor(autosaveStatusView(autosaveSnapshot), autosave.retry)
							: null
						: undefined
				}
				leaving={isDraftMode && isLeaving}
			/>

			{isEditMode || isDraftMode ? (
				<UnsavedChangesDialog
					open={leaveDialogOpen}
					onOpenChange={setLeaveDialogOpen}
					description={leaveDescription}
					onLeave={leaveWithoutSaving}
				/>
			) : null}

			<Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
				<DialogContent className="rounded-4xl">
					<DialogHeader>
						<DialogTitle>Перенести вопрос</DialogTitle>
						<DialogDescription>
							Выберите тему назначения. Если тест не выбран, он будет создан автоматически.
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-4">
						<div className="space-y-2">
							<Label>Тема</Label>
							<Select value={targetTopicId} onValueChange={handleTargetTopicChange}>
								<SelectTrigger>
									<SelectValue placeholder="Выберите тему" />
								</SelectTrigger>
								<SelectContent>
									{availableTopics.map((topic) => (
										<SelectItem key={topic.id} value={topic.id}>
											{topic.title}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="space-y-2">
							<Label>Тест</Label>
							<Select value={targetTestId} onValueChange={setTargetTestId}>
								<SelectTrigger>
									<SelectValue placeholder="Создать тест автоматически" />
								</SelectTrigger>
								<SelectContent>
									{availableTests.map((test) => (
										<SelectItem key={test.id} value={test.id}>
											{test.title}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>

					<DialogFooter>
						<Button variant="outline" onClick={() => setMoveDialogOpen(false)} disabled={moving}>
							Отмена
						</Button>
						<Button onClick={handleMoveQuestion} disabled={moving || !targetTopicId}>
							{moving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
							Перенести
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	)
}

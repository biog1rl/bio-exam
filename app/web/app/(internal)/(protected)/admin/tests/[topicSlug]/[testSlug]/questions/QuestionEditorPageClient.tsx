'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ArrowRightLeft, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import useSWR from 'swr'

import { SetBreadcrumbsLabels } from '@/components/Breadcrumbs/SetBreadcrumbsLabels'
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
import { apiFetch } from '@/lib/api-fetch'

import QuestionEditor from '../../../components/QuestionEditor'
import type {
	Question,
	QuestionDraftDetailResponse,
	QuestionTypesResponse,
	TestDetailResponse,
	TestFormData,
	TestsResponse,
	TopicsResponse,
} from '../../../types'
import {
	createDefaultQuestion,
	isValidSequenceCorrectValue,
	normalizeQuestionForSave,
	normalizeShortTextCorrectValue,
	resolveQuestionTemplate,
} from '../../../types'

const QUESTION_DRAFT_SAVE_DEBOUNCE_MS = 700

const fetcher = async (url: string) => {
	const res = await fetch(url, { credentials: 'include' })
	if (!res.ok) {
		const data = await res.json().catch(() => null)
		throw new Error(data?.error || 'Не удалось загрузить тест')
	}
	return res.json()
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

function normalizeDraftCorrect(value: unknown): Question['correct'] {
	if (typeof value === 'string') return value
	if (Array.isArray(value) && value.every((item) => typeof item === 'string')) return value
	if (!isRecord(value)) return ''
	const entries = Object.entries(value).filter(([, entryValue]) => typeof entryValue === 'string')
	return Object.fromEntries(entries) as Record<string, string>
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
		correct: normalizeDraftCorrect(candidate.correct),
	})
}

interface Props {
	topicSlug: string
	testSlug: string
	questionId?: string
	questionDraftId?: string
}

function validateQuestion(question: Question): string | null {
	const template = resolveQuestionTemplate(question)
	if (!template) {
		return 'Тип вопроса не настроен в БД'
	}

	if (!question.promptText.trim()) {
		return 'Введите текст вопроса'
	}
	if (template === 'single_choice' || template === 'multi_choice') {
		if (!question.options || question.options.length < 2) {
			return 'Добавьте минимум 2 варианта ответа'
		}
		if (question.options.some((option) => !option.text.trim())) {
			return 'Заполните все варианты ответа'
		}
		if (template === 'single_choice' && !question.correct) {
			return 'Выберите правильный ответ'
		}
		if (template === 'multi_choice' && (!Array.isArray(question.correct) || question.correct.length === 0)) {
			return 'Выберите правильные ответы'
		}
	}
	if (template === 'matching') {
		if (!question.matchingPairs || question.matchingPairs.left.length < 2 || question.matchingPairs.right.length < 2) {
			return 'Добавьте минимум 2 пары для сопоставления'
		}
		if (
			question.matchingPairs.left.some((pair) => !pair.text.trim()) ||
			question.matchingPairs.right.some((pair) => !pair.text.trim())
		) {
			return 'Заполните все элементы сопоставления'
		}
		if (
			typeof question.correct !== 'object' ||
			Array.isArray(question.correct) ||
			Object.keys(question.correct).length === 0
		) {
			return 'Укажите правильные соответствия'
		}
	}
	if (template === 'short_text') {
		const normalized = normalizeShortTextCorrectValue(question.correct)
		if (!normalized || !normalized.trim()) {
			return 'Укажите правильный краткий ответ'
		}
	}
	if (template === 'sequence_digits') {
		if (!isValidSequenceCorrectValue(question.correct)) {
			return 'Для последовательности используйте только цифры без пробелов'
		}
	}
	return null
}

export default function QuestionEditorPageClient({ topicSlug, testSlug, questionId, questionDraftId }: Props) {
	const router = useRouter()
	const [isSaving, setIsSaving] = useState(false)
	const [moving, setMoving] = useState(false)
	const [moveDialogOpen, setMoveDialogOpen] = useState(false)
	const [targetTopicId, setTargetTopicId] = useState('')
	const [targetTestId, setTargetTestId] = useState('')
	const [draftQuestion, setDraftQuestion] = useState<Question | null>(null)
	const [draftLockVersion, setDraftLockVersion] = useState(0)
	const draftAutosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const isDraftHydratedRef = useRef(false)
	const latestDraftQuestionRef = useRef<Question | null>(null)
	const lockVersionRef = useRef(0)
	const isDraftMode = Boolean(questionDraftId)
	const isNewQuestion = questionId === undefined
	const isEditingExistingQuestion = Boolean(questionId)

	const {
		data: testData,
		error,
		isLoading,
		mutate,
	} = useSWR<TestDetailResponse>(`/api/tests/by-slug/${topicSlug}/${testSlug}`, fetcher)
	const { data: questionTypesData } = useSWR<QuestionTypesResponse>(
		testData?.test?.id ? `/api/tests/question-types?testId=${testData.test.id}&includeInactive=true` : null,
		fetcher
	)
	const { data: topicsData } = useSWR<TopicsResponse>('/api/tests/topics', fetcher)
	const { data: testsData } = useSWR<TestsResponse>('/api/tests', fetcher)
	const {
		data: questionDraftData,
		error: questionDraftError,
		isLoading: questionDraftLoading,
		mutate: mutateQuestionDraft,
	} = useSWR<QuestionDraftDetailResponse>(
		isDraftMode && testData?.test?.id ? `/api/tests/${testData.test.id}/question-drafts/${questionDraftId}` : null,
		fetcher
	)

	useEffect(() => {
		lockVersionRef.current = draftLockVersion
	}, [draftLockVersion])

	useEffect(() => {
		if (!isDraftMode) return
		if (questionDraftData === undefined) return

		const order = testData?.questions.length ?? 0
		const parsed = extractQuestionFromDraftPayload(questionDraftData?.draft?.payload, order)
		if (parsed) {
			setDraftQuestion(parsed)
			latestDraftQuestionRef.current = parsed
		} else {
			setDraftQuestion(createDefaultQuestion(order))
			latestDraftQuestionRef.current = createDefaultQuestion(order)
		}

		const nextLockVersion = questionDraftData?.draft?.lockVersion ?? 0
		setDraftLockVersion(nextLockVersion)
		lockVersionRef.current = nextLockVersion
		isDraftHydratedRef.current = true
	}, [isDraftMode, questionDraftData, testData?.questions.length])

	useEffect(() => {
		return () => {
			if (draftAutosaveTimerRef.current) {
				clearTimeout(draftAutosaveTimerRef.current)
				draftAutosaveTimerRef.current = null
			}
		}
	}, [])

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
		if (isDraftMode) return draftQuestion ?? createDefaultQuestion(testData.questions.length)
		if (isNewQuestion) return createDefaultQuestion(testData.questions.length)
		const found = testData.questions.find((question) => question.id === questionId) ?? null
		return found ? normalizeQuestionForSave(found) : null
	}, [testData, isDraftMode, draftQuestion, isNewQuestion, questionId])

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
	}, [isDraftMode, isEditingExistingQuestion, questionDraftId, questionId, testData?.test?.title, testData?.test?.topicTitle, testSlug, topicSlug])

	const backToTestEditor = useCallback(() => {
		router.push(`/admin/tests/${topicSlug}/${testSlug}`)
	}, [router, topicSlug, testSlug])

	const persistDraftQuestion = useCallback(
		async (nextQuestion: Question) => {
			if (!isDraftMode || !questionDraftId || !testData?.test?.id) return

			const payloadQuestion = {
				...normalizeQuestionForSave(nextQuestion),
				id: undefined,
				order: testData.questions.length,
			}
			const res = await apiFetch(`/api/tests/${testData.test.id}/question-drafts/${questionDraftId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					payload: { question: payloadQuestion },
					lockVersion: lockVersionRef.current,
				}),
			})

			if (!res.ok) {
				const data = (await res.json().catch(() => null)) as { error?: string } | null
				if (res.status === 409) {
					toast.error(data?.error || 'Черновик изменен в другой вкладке, загружаю актуальную версию')
					await mutateQuestionDraft()
					return
				}
				throw new Error(data?.error || 'Ошибка автосохранения черновика вопроса')
			}

			const data = (await res.json().catch(() => null)) as {
				lockVersion?: number
				draft?: { lockVersion?: number }
			} | null
			const nextLockVersion = data?.draft?.lockVersion ?? data?.lockVersion
			if (typeof nextLockVersion === 'number') {
				lockVersionRef.current = nextLockVersion
				setDraftLockVersion(nextLockVersion)
			}
		},
		[isDraftMode, questionDraftId, testData?.test?.id, testData?.questions.length, mutateQuestionDraft]
	)

	const handleQuestionDraftChange = useCallback(
		(nextQuestion: Question) => {
			if (!isDraftMode) return
			latestDraftQuestionRef.current = nextQuestion
			if (!isDraftHydratedRef.current) return

			if (draftAutosaveTimerRef.current) {
				clearTimeout(draftAutosaveTimerRef.current)
			}

			draftAutosaveTimerRef.current = setTimeout(() => {
				if (!latestDraftQuestionRef.current) return
				void persistDraftQuestion(latestDraftQuestionRef.current).catch((err) => {
					console.warn('Failed to autosave question draft', err)
				})
			}, QUESTION_DRAFT_SAVE_DEBOUNCE_MS)
		},
		[isDraftMode, persistDraftQuestion]
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
			const payload = targetTestId ? { targetTestId } : { targetTopicId }
			const res = await apiFetch(`/api/tests/${testData.test.id}/questions/${questionId}/move`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
			})

			if (!res.ok) {
				const data = await res.json().catch(() => null)
				throw new Error(data?.error || 'Ошибка переноса вопроса')
			}

			const data = (await res.json()) as {
				target: { topicSlug: string; testSlug: string }
			}

			toast.success('Вопрос перенесен')
			setMoveDialogOpen(false)
			router.push(`/admin/tests/${data.target.topicSlug}/${data.target.testSlug}/questions/${questionId}`)
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Ошибка переноса вопроса')
		} finally {
			setMoving(false)
		}
	}, [testData, questionId, targetTopicId, targetTestId, router])

	const handleSaveQuestion = useCallback(
		async (nextQuestion: Question) => {
			if (!testData?.test?.id) return

			const validationError = validateQuestion(nextQuestion)
			if (validationError) {
				toast.error(validationError)
				return
			}

			const appendAsNew = isDraftMode || isNewQuestion
			const questions = appendAsNew
				? [...testData.questions, nextQuestion]
				: testData.questions.map((question) =>
						question.id === questionId ? { ...nextQuestion, id: questionId } : question
					)

			const normalizedQuestions = questions.map((question, order) => ({
				...normalizeQuestionForSave(question),
				order,
			}))
			const payload: TestFormData = {
				topicId: testData.test.topicId,
				title: testData.test.title,
				slug: testData.test.slug,
				description: testData.test.description || '',
				isPublished: testData.test.isPublished,
				showCorrectAnswer: testData.test.showCorrectAnswer ?? true,
				timeLimitMinutes: testData.test.timeLimitMinutes,
				passingScore: testData.test.passingScore,
				order: testData.test.order,
				questions: normalizedQuestions,
			}

			setIsSaving(true)
			try {
				const res = await apiFetch(`/api/tests/${testData.test.id}/save`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(payload),
				})

				if (!res.ok) {
					const data = await res.json().catch(() => null)
					throw new Error(data?.error || 'Ошибка сохранения вопроса')
				}

				if (isDraftMode && questionDraftId) {
					const deleteRes = await apiFetch(`/api/tests/${testData.test.id}/question-drafts/${questionDraftId}`, {
						method: 'DELETE',
					})
					if (!deleteRes.ok) {
						console.warn('Failed to delete question draft after save', questionDraftId)
					}
				}

				await mutate()
				toast.success(appendAsNew ? 'Вопрос добавлен' : 'Вопрос сохранен')
				backToTestEditor()
			} catch (err) {
				toast.error(err instanceof Error ? err.message : 'Ошибка сохранения вопроса')
			} finally {
				setIsSaving(false)
			}
		},
		[testData, isDraftMode, isNewQuestion, questionId, questionDraftId, mutate, backToTestEditor]
	)

	if (isLoading || (isDraftMode && questionDraftLoading && !isDraftHydratedRef.current)) {
		return (
			<div className="flex items-center justify-center p-12">
				<Loader2 className="h-8 w-8 animate-spin" />
			</div>
		)
	}

	if (error || questionDraftError || !testData) {
		return (
			<div className="space-y-4 p-6">
				<p className="text-sm text-red-600">
					{error instanceof Error
						? error.message
						: questionDraftError instanceof Error
							? questionDraftError.message
							: 'Не удалось загрузить данные'}
				</p>
				<Button variant="outline" onClick={backToTestEditor}>
					Назад к тесту
				</Button>
			</div>
		)
	}

	if (!currentQuestion) {
		return (
			<div className="space-y-4 p-6">
				<p className="text-sm text-red-600">
					{isEditingExistingQuestion ? 'Вопрос не найден' : 'Черновик вопроса не найден'}
				</p>
				<Button variant="outline" onClick={backToTestEditor}>
					Назад к тесту
				</Button>
			</div>
		)
	}

	return (
		<div className={isSaving ? 'pointer-events-none opacity-80' : undefined}>
			<SetBreadcrumbsLabels labels={breadcrumbLabels} />
			<QuestionEditor
				question={currentQuestion}
				questionTypes={questionTypesData?.questionTypes ?? []}
				onSave={handleSaveQuestion}
				onDraftChange={isDraftMode ? handleQuestionDraftChange : undefined}
				onCancel={backToTestEditor}
				headerActions={
					isEditingExistingQuestion && questionId ? (
						<Button variant="secondary" onClick={openMoveDialog} disabled={moving}>
							<ArrowRightLeft className="mr-2 h-4 w-4" />
							Перенести
						</Button>
					) : undefined
				}
				isSaving={isSaving}

			/>

			<Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
				<DialogContent>
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
							{moving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
							Перенести
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	)
}

'use client'

import { useCallback, useMemo, useState } from 'react'

import { ArrowRightLeft, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import useSWR from 'swr'

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

import QuestionEditor from '../../../components/QuestionEditor'
import type { Question, TestDetailResponse, TestFormData, TestsResponse, TopicsResponse } from '../../../types'
import { createDefaultQuestion } from '../../../types'

const fetcher = async (url: string) => {
	const res = await fetch(url, { credentials: 'include' })
	if (!res.ok) {
		const data = await res.json().catch(() => null)
		throw new Error(data?.error || 'Не удалось загрузить тест')
	}
	return res.json()
}

interface Props {
	topicSlug: string
	testSlug: string
	questionId?: string
}

function validateQuestion(question: Question): string | null {
	if (!question.promptText.trim()) {
		return 'Введите текст вопроса'
	}
	if (question.type === 'radio' || question.type === 'checkbox') {
		if (!question.options || question.options.length < 2) {
			return 'Добавьте минимум 2 варианта ответа'
		}
		if (question.options.some((option) => !option.text.trim())) {
			return 'Заполните все варианты ответа'
		}
		if (question.type === 'radio' && !question.correct) {
			return 'Выберите правильный ответ'
		}
		if (question.type === 'checkbox' && (!Array.isArray(question.correct) || question.correct.length === 0)) {
			return 'Выберите правильные ответы'
		}
	}
	if (question.type === 'matching') {
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
	return null
}

export default function QuestionEditorPageClient({ topicSlug, testSlug, questionId }: Props) {
	const router = useRouter()
	const [saving, setSaving] = useState(false)
	const [moving, setMoving] = useState(false)
	const [moveDialogOpen, setMoveDialogOpen] = useState(false)
	const [targetTopicId, setTargetTopicId] = useState('')
	const [targetTestId, setTargetTestId] = useState('')
	const isNewQuestion = questionId === undefined

	const {
		data: testData,
		error,
		isLoading,
		mutate,
	} = useSWR<TestDetailResponse>(`/api/tests/by-slug/${topicSlug}/${testSlug}`, fetcher)
	const { data: topicsData } = useSWR<TopicsResponse>('/api/tests/topics', fetcher)
	const { data: testsData } = useSWR<TestsResponse>('/api/tests', fetcher)

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
		if (isNewQuestion) return createDefaultQuestion(testData.questions.length)
		return testData.questions.find((question) => question.id === questionId) ?? null
	}, [testData, isNewQuestion, questionId])

	const backToTestEditor = useCallback(() => {
		router.push(`/admin/tests/${topicSlug}/${testSlug}`)
	}, [router, topicSlug, testSlug])

	const openMoveDialog = useCallback(() => {
		if (isNewQuestion || !testData?.test?.id || !questionId) {
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
	}, [isNewQuestion, questionId, testData, testsData, availableTopics])

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
			const res = await fetch(`/api/tests/${testData.test.id}/questions/${questionId}/move`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
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

			const questions = isNewQuestion
				? [...testData.questions, nextQuestion]
				: testData.questions.map((question) =>
						question.id === questionId ? { ...nextQuestion, id: questionId } : question
					)

			const normalizedQuestions = questions.map((question, order) => ({ ...question, order }))
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

			setSaving(true)
			try {
				const res = await fetch(`/api/tests/${testData.test.id}/save`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					credentials: 'include',
					body: JSON.stringify(payload),
				})

				if (!res.ok) {
					const data = await res.json().catch(() => null)
					throw new Error(data?.error || 'Ошибка сохранения вопроса')
				}

				await mutate()
				toast.success(isNewQuestion ? 'Вопрос добавлен' : 'Вопрос сохранен')
				backToTestEditor()
			} catch (err) {
				toast.error(err instanceof Error ? err.message : 'Ошибка сохранения вопроса')
			} finally {
				setSaving(false)
			}
		},
		[testData, isNewQuestion, questionId, mutate, backToTestEditor]
	)

	if (isLoading) {
		return (
			<div className="flex items-center justify-center p-12">
				<Loader2 className="h-8 w-8 animate-spin" />
			</div>
		)
	}

	if (error || !testData) {
		return (
			<div className="space-y-4 p-6">
				<p className="text-sm text-red-600">{error instanceof Error ? error.message : 'Не удалось загрузить тест'}</p>
				<Button variant="outline" onClick={backToTestEditor}>
					Назад к тесту
				</Button>
			</div>
		)
	}

	if (!currentQuestion) {
		return (
			<div className="space-y-4 p-6">
				<p className="text-sm text-red-600">Вопрос не найден</p>
				<Button variant="outline" onClick={backToTestEditor}>
					Назад к тесту
				</Button>
			</div>
		)
	}

	return (
		<div className={saving ? 'pointer-events-none opacity-80' : undefined}>
			<QuestionEditor
				question={currentQuestion}
				onSave={handleSaveQuestion}
				onCancel={backToTestEditor}
				headerActions={
					!isNewQuestion && questionId ? (
						<Button variant="secondary" onClick={openMoveDialog} disabled={moving}>
							<ArrowRightLeft className="mr-2 h-4 w-4" />
							Перенести
						</Button>
					) : undefined
				}
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

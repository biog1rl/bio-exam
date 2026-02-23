'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { toast } from 'sonner'
import { useDebouncedCallback } from 'use-debounce'

import MdxRenderer from '@/components/tests/MdxRenderer'
import { saveAnswer, startTestSession, submitPublicTestAnswers } from '@/lib/tests/api'
import type {
	PublicTestDetail,
	PublicTestQuestion,
	SessionInfo,
	SubmitResult,
	TestAnswerValue,
	TestAttemptSummary,
} from '@/lib/tests/types'
import { cn } from '@/lib/utils'

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '../ui/alert-dialog'
import { Button } from '../ui/button'
import { Checkbox } from '../ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { RadioGroup, RadioGroupItem } from '../ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'

type ResultByQuestion = Record<
	string,
	{
		isCorrect: boolean
		earnedPoints: number
		points: number
		correctAnswer: unknown
		explanationText: string | null
	}
>

type Props = {
	test: PublicTestDetail
	questions: PublicTestQuestion[]
	initialAttempts?: TestAttemptSummary[]
}

function resolveTemplate(question: PublicTestQuestion): NonNullable<PublicTestQuestion['questionUiTemplate']> | null {
	return question.questionUiTemplate
}

function isAnswered(question: PublicTestQuestion, value: TestAnswerValue | undefined): boolean {
	const template = resolveTemplate(question)
	if (!value) return false
	if (template === 'single_choice') return typeof value === 'string' && value.length > 0
	if (template === 'short_text' || template === 'sequence_digits') {
		return typeof value === 'string' && value.trim().length > 0
	}
	if (template === 'multi_choice') return Array.isArray(value) && value.length > 0
	if (template === 'matching') {
		if (!value || typeof value !== 'object' || Array.isArray(value) || !question.matchingPairs) return false
		const pairs = value as Record<string, string>
		return question.matchingPairs.left.every((left) => typeof pairs[left.id] === 'string' && pairs[left.id].length > 0)
	}
	return false
}

function formatDate(value: string): string {
	return new Date(value).toLocaleString('ru-RU', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	})
}

function formatCorrectAnswer(question: PublicTestQuestion, correctAnswer: unknown): string | null {
	if (correctAnswer == null) return null
	const template = resolveTemplate(question)

	if ((template === 'single_choice' || template === 'multi_choice') && Array.isArray(question.options)) {
		const optionMap = new Map(question.options.map((option) => [option.id, option.text]))

		if (typeof correctAnswer === 'string' || typeof correctAnswer === 'number') {
			const normalizedId = String(correctAnswer)
			return optionMap.get(normalizedId) || normalizedId
		}
		if (Array.isArray(correctAnswer)) {
			const labels = correctAnswer
				.filter((value): value is string | number => typeof value === 'string' || typeof value === 'number')
				.map((id) => {
					const normalizedId = String(id)
					return optionMap.get(normalizedId) || normalizedId
				})
			return labels.length > 0 ? labels.join(', ') : null
		}
	}

	if (template === 'short_text' || template === 'sequence_digits') {
		if (typeof correctAnswer === 'string') return correctAnswer
		if (typeof correctAnswer === 'number' && Number.isFinite(correctAnswer)) return String(correctAnswer)
		if (typeof correctAnswer === 'bigint') return correctAnswer.toString()
		return null
	}

	if (
		template === 'matching' &&
		question.matchingPairs &&
		typeof correctAnswer === 'object' &&
		!Array.isArray(correctAnswer)
	) {
		const map = correctAnswer as Record<string, string>
		const leftMap = new Map(question.matchingPairs.left.map((option) => [option.id, option.text]))
		const rightMap = new Map(question.matchingPairs.right.map((option) => [option.id, option.text]))

		const lines = Object.entries(map).map(([leftId, rightId]) => {
			const leftText = leftMap.get(leftId) || leftId
			const rightText = rightMap.get(rightId) || rightId
			return `${leftText} -> ${rightText}`
		})
		return lines.length > 0 ? lines.join('; ') : null
	}

	return typeof correctAnswer === 'string' ? correctAnswer : JSON.stringify(correctAnswer)
}

function tryParseJson(text: string): Record<string, unknown> | null {
	try {
		return JSON.parse(text) as Record<string, unknown>
	} catch {
		return null
	}
}

const RED_THRESHOLD_SECONDS_DEFAULT = 5 * 60 // 300 seconds = 5 minutes

function useCountdown(startedAt: string | null, limitMinutes: number | null): number | null {
	const [secondsLeft, setSecondsLeft] = useState<number | null>(null)

	useEffect(() => {
		if (!startedAt || !limitMinutes) return
		const endMs = new Date(startedAt).getTime() + limitMinutes * 60 * 1000

		const tick = () => {
			const remaining = Math.max(0, Math.floor((endMs - Date.now()) / 1000))
			setSecondsLeft(remaining)
		}
		tick()

		const id = setInterval(tick, 1000)
		return () => clearInterval(id)
	}, [startedAt, limitMinutes])

	return secondsLeft
}

function formatTime(seconds: number, showHours: boolean): string {
	const h = Math.floor(seconds / 3600)
	const m = Math.floor((seconds % 3600) / 60)
	const s = seconds % 60
	if (showHours) {
		return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
	}
	return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function TestRunner({ test, questions, initialAttempts = [] }: Props) {
	const orderedQuestions = useMemo(() => [...questions].sort((a, b) => a.order - b.order), [questions])
	const [answers, setAnswers] = useState<Record<string, TestAnswerValue>>({})
	const [submitting, setSubmitting] = useState(false)
	const [submitResult, setSubmitResult] = useState<SubmitResult | null>(null)
	const [submitError, setSubmitError] = useState<string | null>(null)
	const [attempts, setAttempts] = useState<TestAttemptSummary[]>(initialAttempts)
	const [currentQuestionId, setCurrentQuestionId] = useState<string | null>(() => orderedQuestions[0]?.id ?? null)
	const [showUnansweredDialog, setShowUnansweredDialog] = useState(false)
	const [session, setSession] = useState<SessionInfo | null>(null)
	const [frozen, setFrozen] = useState(false)
	const [showTimeUp, setShowTimeUp] = useState(false)
	const [showTimeExpiredDialog, setShowTimeExpiredDialog] = useState(false)
	const [expiredAttemptId, setExpiredAttemptId] = useState<string | null>(null)
	const [awaitingStart, setAwaitingStart] = useState(false)
	const warningFiredRef = useRef(false)
	const sessionInitRef = useRef(false)
	const frozenKey = `test-frozen-${test.id}`
	const walKey = `test-answers-wal-${test.id}`
	const sessionKey = `test-session-${test.id}`

	const secondsLeft = useCountdown(session?.startedAt ?? null, test.timeLimitMinutes ?? null)
	const redThresholdSeconds = RED_THRESHOLD_SECONDS_DEFAULT
	const showHours = (test.timeLimitMinutes ?? 0) > 60

	// Session start effect: restore frozen state and start/restore timer session
	useEffect(() => {
		// Restore frozen state from localStorage (user returned after auto-submit)
		if (localStorage.getItem(frozenKey)) {
			setFrozen(true)
		}

		// Only start a session for tests with a time limit
		if (!test.timeLimitMinutes) return

		// Guard against React StrictMode double-invoke
		if (sessionInitRef.current) return
		sessionInitRef.current = true

		const cached = localStorage.getItem(sessionKey)
		if (cached) {
			// Existing session — restore silently without confirmation
			async function restoreSession(raw: string) {
				let wasRestored = false
				try {
					const parsed = JSON.parse(raw) as SessionInfo
					setSession(parsed)
					wasRestored = true
				} catch {
					localStorage.removeItem(sessionKey)
				}
				try {
					const serverSession = await startTestSession(test.id)
					setSession(serverSession)
					localStorage.setItem(sessionKey, JSON.stringify(serverSession))
					if (wasRestored) {
						toast.info('Сессия восстановлена')
					}
				} catch {
					/* graceful degradation */
				}
			}
			void restoreSession(cached)
		} else {
			// No session yet — ask for confirmation before starting the timer
			setAwaitingStart(true)
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	// WAL restore effect: restore answers from localStorage on mount
	useEffect(() => {
		const wal = localStorage.getItem(walKey)
		if (wal) {
			try {
				const parsed = JSON.parse(wal) as Record<string, TestAnswerValue>
				if (Object.keys(parsed).length > 0) {
					setAnswers((prev) => ({ ...prev, ...parsed }))
				}
			} catch {
				/* ignore */
			}
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	const resultByQuestion = useMemo<ResultByQuestion>(() => {
		const map: ResultByQuestion = {}
		for (const item of submitResult?.results ?? []) {
			map[item.questionId] = {
				isCorrect: item.isCorrect,
				earnedPoints: item.earnedPoints,
				points: item.points,
				correctAnswer: item.correctAnswer,
				explanationText: item.explanationText,
			}
		}
		return map
	}, [submitResult])

	const answeredCount = useMemo(
		() => orderedQuestions.filter((question) => isAnswered(question, answers[question.id])).length,
		[answers, orderedQuestions]
	)

	const debouncedSaveAnswer = useDebouncedCallback(
		useCallback(
			async (questionId: string, value: TestAnswerValue) => {
				if (!session) return
				// Write to localStorage WAL before server send
				try {
					const current = JSON.parse(localStorage.getItem(walKey) ?? '{}') as Record<string, TestAnswerValue>
					current[questionId] = value
					localStorage.setItem(walKey, JSON.stringify(current))
				} catch {
					/* ignore */
				}
				try {
					await saveAnswer(test.id, session.sessionId, questionId, value)
				} catch {
					// localStorage already has value; silently ignore server errors
				}
			},
			[session, walKey, test.id]
		),
		600
	)

	const onSelectRadio = (questionId: string, optionId: string) => {
		setAnswers((prev) => ({ ...prev, [questionId]: optionId }))
		void debouncedSaveAnswer(questionId, optionId)
	}

	const onToggleCheckbox = (questionId: string, optionId: string) => {
		setAnswers((prev) => {
			const current = Array.isArray(prev[questionId]) ? [...(prev[questionId] as string[])] : []
			const next = current.includes(optionId) ? current.filter((id) => id !== optionId) : [...current, optionId]
			void debouncedSaveAnswer(questionId, next)
			return { ...prev, [questionId]: next }
		})
	}

	const onSelectMatching = (questionId: string, leftId: string, rightId: string) => {
		setAnswers((prev) => {
			const current =
				prev[questionId] && typeof prev[questionId] === 'object' && !Array.isArray(prev[questionId])
					? { ...(prev[questionId] as Record<string, string>) }
					: {}
			current[leftId] = rightId
			void debouncedSaveAnswer(questionId, current)
			return { ...prev, [questionId]: current }
		})
	}

	const onInputTextAnswer = (questionId: string, value: string) => {
		setAnswers((prev) => ({ ...prev, [questionId]: value }))
		void debouncedSaveAnswer(questionId, value)
	}

	const scrollingRef = useRef(false)
	const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	useEffect(() => {
		if (orderedQuestions.length === 0) return
		const visibleRatios = new Map<string, number>()

		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					const id = entry.target.id.replace('question-', '')
					visibleRatios.set(id, entry.intersectionRatio)
				}
				if (scrollingRef.current) return
				let bestId: string | null = null
				let bestRatio = 0
				for (const [id, ratio] of visibleRatios) {
					if (ratio > bestRatio) {
						bestRatio = ratio
						bestId = id
					}
				}
				if (bestId) setCurrentQuestionId(bestId)
			},
			{ threshold: [0, 0.25, 0.5, 0.75, 1] }
		)

		for (const question of orderedQuestions) {
			const el = document.getElementById(`question-${question.id}`)
			if (el) observer.observe(el)
		}

		return () => observer.disconnect()
	}, [orderedQuestions])

	const scrollToQuestion = (questionId: string) => {
		setCurrentQuestionId(questionId)
		scrollingRef.current = true
		if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current)
		scrollTimerRef.current = setTimeout(() => {
			scrollingRef.current = false
		}, 800)
		const el = document.getElementById(`question-${questionId}`)
		if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
	}

	const doSubmit = async ({ isAutoSubmit = false }: { isAutoSubmit?: boolean } = {}) => {
		setSubmitting(true)
		setSubmitError(null)
		try {
			const result = await submitPublicTestAnswers(test.id, answers)
			if (isAutoSubmit) {
				setShowTimeUp(true)
				// Brief delay to show "Время вышло" screen before transitioning to results
				await new Promise((resolve) => setTimeout(resolve, 1500))
				setShowTimeUp(false)
			}
			setSubmitResult(result)
			setAttempts((prev) => [
				{
					id: result.attemptId,
					earnedPoints: result.earnedPoints,
					totalPoints: result.totalPoints,
					scorePercentage: result.scorePercentage,
					passed: result.passed,
					submittedAt: result.submittedAt,
				},
				...prev,
			])
			// Clean up frozen flag and WAL on successful submit
			localStorage.removeItem(frozenKey)
			localStorage.removeItem(walKey)
			localStorage.removeItem(sessionKey)
		} catch (error) {
			// Check for TIME_EXPIRED_ALREADY_SUBMITTED
			if (error instanceof Error) {
				const body = tryParseJson(error.message)
				if (body?.error === 'TIME_EXPIRED_ALREADY_SUBMITTED') {
					setExpiredAttemptId((body as { attemptId?: string }).attemptId ?? null)
					setShowTimeExpiredDialog(true)
					return
				}
			}
			console.error('Failed to submit test answers:', error)
			setSubmitError('Не удалось сохранить ответы. Попробуйте еще раз.')
		} finally {
			setSubmitting(false)
		}
	}

	// Auto-submit effect: fires 1-minute warning toast and auto-submits at zero
	useEffect(() => {
		if (secondsLeft === null) return

		// 1-minute warning toast
		const warningThresholdSeconds = 60
		if (secondsLeft === warningThresholdSeconds && !warningFiredRef.current) {
			warningFiredRef.current = true
			toast.warning('Осталась 1 минута — тест будет сдан автоматически', { duration: 8000 })
		}

		// Auto-submit at zero
		if (secondsLeft === 0 && !frozen && !submitResult) {
			setFrozen(true)
			localStorage.setItem(frozenKey, '1')
			void doSubmit({ isAutoSubmit: true })
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [secondsLeft, frozen, submitResult])

	const handleSubmit = () => {
		if (answeredCount < orderedQuestions.length) {
			setShowUnansweredDialog(true)
		} else {
			void doSubmit()
		}
	}

	const handleConfirmStart = async () => {
		setAwaitingStart(false)
		try {
			const serverSession = await startTestSession(test.id)
			setSession(serverSession)
			localStorage.setItem(sessionKey, JSON.stringify(serverSession))
		} catch {
			toast.error('Не удалось начать тест. Попробуйте ещё раз.')
		}
	}

	const handleRetake = () => {
		setSubmitResult(null)
		setAnswers({})
		setSubmitError(null)
		const firstId = orderedQuestions[0]?.id ?? null
		setCurrentQuestionId(firstId)
		if (firstId) {
			const el = document.getElementById(`question-${firstId}`)
			if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
		}
	}

	return (
		<div className="flex gap-x-4 space-y-6">
			<div className="flex-1">
				<div className="space-y-2">
					<h1 className="text-3xl font-semibold">{test.title}</h1>
					{test.description ? <p className="text-muted-foreground whitespace-pre-wrap">{test.description}</p> : null}
					<div className="text-muted-foreground flex flex-wrap gap-4 text-sm">
						<span>Тема: {test.topicTitle}</span>
						{test.timeLimitMinutes ? <span>Лимит: {test.timeLimitMinutes} мин</span> : null}
						{test.passingScore != null ? <span>Проходной балл: {test.passingScore}%</span> : null}
					</div>
				</div>

				{submitResult ? (
					<section className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
						<h2 className="mb-2 text-lg font-semibold">Результат</h2>
						<p>
							Баллы: {submitResult.earnedPoints} / {submitResult.totalPoints}
						</p>
						<p>Процент: {submitResult.scorePercentage.toFixed(1)}%</p>
						<p>{submitResult.passed ? 'Статус: пройден' : 'Статус: не пройден'}</p>
						<Button type="button" variant="outline" className="mt-3" onClick={handleRetake}>
							Пройти ещё раз
						</Button>
					</section>
				) : null}

				{submitError ? (
					<section className="rounded-lg border border-rose-200 bg-rose-50 p-4">{submitError}</section>
				) : null}

				{showTimeUp ? (
					<section className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
						<div className="rounded-lg bg-white p-8 text-center shadow-xl">
							<p className="text-2xl font-semibold">Время вышло</p>
							<p className="text-muted-foreground mt-2 text-sm">Отправка ответов...</p>
						</div>
					</section>
				) : null}

				{orderedQuestions.map((question, index) => {
					const questionResult = resultByQuestion[question.id]
					const template = resolveTemplate(question)

					return (
						<section
							key={question.id}
							id={`question-${question.id}`}
							className="gap-unit-mob tab:gap-unit grid scroll-mt-24"
						>
							<p className="text-lg font-medium">{index + 1}.</p>
							<div className="bg-secondary flex-1 space-y-4 rounded-lg border p-4">
								<div className="space-y-2">
									<MdxRenderer source={question.promptText} className="prose max-w-none text-sm" />
								</div>

								{template === 'single_choice' && Array.isArray(question.options) ? (
									<RadioGroup
										className="w-fit space-y-2"
										value={typeof answers[question.id] === 'string' ? (answers[question.id] as string) : ''}
										onValueChange={(value) => onSelectRadio(question.id, value)}
										disabled={frozen || !!submitResult}
									>
										{question.options.map((option) => {
											const inputId = `q-${question.id}-opt-${option.id}`
											return (
												<div key={option.id} className="flex items-center gap-2">
													<RadioGroupItem id={inputId} value={option.id} />
													<Label htmlFor={inputId} className="cursor-pointer font-normal">
														{option.text}
													</Label>
												</div>
											)
										})}
									</RadioGroup>
								) : null}

								{template === 'multi_choice' && Array.isArray(question.options) ? (
									<div className="space-y-2">
										{question.options.map((option) => {
											const inputId = `q-${question.id}-opt-${option.id}`
											const selected =
												Array.isArray(answers[question.id]) && (answers[question.id] as string[]).includes(option.id)
											return (
												<div key={option.id} className="flex items-center gap-2">
													<Checkbox
														id={inputId}
														checked={selected}
														onCheckedChange={() => onToggleCheckbox(question.id, option.id)}
														disabled={frozen || !!submitResult}
													/>
													<Label htmlFor={inputId} className="cursor-pointer font-normal">
														{option.text}
													</Label>
												</div>
											)
										})}
									</div>
								) : null}

								{template === 'short_text' || template === 'sequence_digits' ? (
									<div className="max-w-xs space-y-1">
										<Input
											type="text"
											inputMode={template === 'sequence_digits' ? 'numeric' : 'text'}
											value={typeof answers[question.id] === 'string' ? (answers[question.id] as string) : ''}
											onChange={(e) => onInputTextAnswer(question.id, e.target.value)}
											placeholder={template === 'sequence_digits' ? 'Введите последовательность цифр' : 'Введите ответ'}
											disabled={frozen || !!submitResult}
										/>
										{template === 'sequence_digits' ? (
											<p className="text-muted-foreground text-xs">Последовательность вводится цифрами без пробелов.</p>
										) : null}
									</div>
								) : null}

								{template === 'matching' && question.matchingPairs ? (
									<div className="space-y-3">
										{question.matchingPairs.left.map((left) => {
											const selectedRightId =
												answers[question.id] &&
												typeof answers[question.id] === 'object' &&
												!Array.isArray(answers[question.id])
													? (answers[question.id] as Record<string, string>)[left.id] || ''
													: ''

											return (
												<div key={left.id} className="grid gap-2 sm:grid-cols-[1fr_220px] sm:items-center">
													<div>{left.text}</div>
													<Select
														value={selectedRightId || undefined}
														onValueChange={(value) => onSelectMatching(question.id, left.id, value)}
														disabled={frozen || !!submitResult}
													>
														<SelectTrigger className="sm:w-55 w-full">
															<SelectValue placeholder="Выберите вариант" />
														</SelectTrigger>
														<SelectContent>
															{question.matchingPairs?.right.map((right) => (
																<SelectItem key={right.id} value={right.id}>
																	{right.text}
																</SelectItem>
															))}
														</SelectContent>
													</Select>
												</div>
											)
										})}
									</div>
								) : null}
								{template == null ? (
									<p className="text-sm text-amber-600">Тип этого вопроса не настроен. Обратитесь к администратору.</p>
								) : null}

								{questionResult ? (
									<div
										className={
											questionResult.isCorrect
												? 'rounded border border-emerald-200 bg-emerald-50 p-3 text-sm'
												: 'rounded border border-rose-200 bg-rose-50 p-3 text-sm'
										}
									>
										<p>{questionResult.isCorrect ? 'Верно' : 'Неверно'}</p>
										<p className="text-muted-foreground mt-0.5 text-xs">
											{questionResult.earnedPoints} / {questionResult.points} баллов
										</p>
										{!questionResult.isCorrect && test.showCorrectAnswer && questionResult.correctAnswer != null ? (
											<p className="mt-1">
												Правильный ответ:{' '}
												<code>
													{formatCorrectAnswer(question, questionResult.correctAnswer) || 'Не удалось определить'}
												</code>
											</p>
										) : null}
										{questionResult.explanationText ? (
											<MdxRenderer
												source={questionResult.explanationText}
												className="prose mt-2 max-w-none whitespace-normal text-sm"
											/>
										) : null}
									</div>
								) : null}
							</div>
						</section>
					)
				})}

				{attempts.length > 0 ? (
					<Accordion type="single" collapsible className="bg-secondary mt-8 max-w-lg rounded-lg px-4">
						<AccordionItem className="border-none" value="score">
							<AccordionTrigger className="cursor-pointer">Мои попытки</AccordionTrigger>
							<AccordionContent>
								<ul className="space-y-2 text-sm">
									{attempts.map((attempt) => (
										<li key={attempt.id} className="bg-muted/30 rounded border p-2">
											{formatDate(attempt.submittedAt)} / {attempt.earnedPoints}/{attempt.totalPoints} /{' '}
											{attempt.scorePercentage.toFixed(1)}% / {attempt.passed ? 'пройден' : 'не пройден'}
										</li>
									))}
								</ul>
							</AccordionContent>
						</AccordionItem>
					</Accordion>
				) : null}
			</div>

			{/* Панель навигации по вопросам и прогресс */}
			<section className="sticky top-4 h-fit w-48 shrink-0 space-y-4 rounded-lg border bg-white p-4">
				{secondsLeft !== null && (
					<div
						className={cn(
							'text-right font-mono text-sm font-medium',
							secondsLeft < redThresholdSeconds ? 'text-red-600' : 'text-muted-foreground'
						)}
					>
						{formatTime(secondsLeft, showHours)}
					</div>
				)}
				<div className="space-y-1.5">
					<p className="text-muted-foreground text-xs">
						Отвечено: {answeredCount} / {orderedQuestions.length}
					</p>
					<div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
						<div
							className="h-full rounded-full bg-green-500 transition-all duration-300"
							style={{
								width: orderedQuestions.length > 0 ? `${(answeredCount / orderedQuestions.length) * 100}%` : '0%',
							}}
						/>
					</div>
				</div>

				<div className="grid grid-cols-5 gap-1">
					{orderedQuestions.map((question, index) => {
						const answered = isAnswered(question, answers[question.id])
						const isCurrent = question.id === currentQuestionId
						return (
							<button
								key={question.id}
								type="button"
								onClick={() => scrollToQuestion(question.id)}
								className={cn(
									'flex aspect-square items-center justify-center rounded text-xs font-medium transition-colors',
									answered
										? 'bg-green-500 text-white'
										: 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
									isCurrent && 'ring-2 ring-green-500 ring-offset-1'
								)}
							>
								{index + 1}
							</button>
						)
					})}
				</div>

				<Button type="button" onClick={handleSubmit} disabled={submitting || frozen} className="w-full">
					{submitting ? 'Отправка...' : 'Завершить'}
				</Button>
			</section>

			<AlertDialog open={awaitingStart}>
				<AlertDialogContent overlayClassName="bg-black/60 backdrop-blur-xl">
					<AlertDialogHeader>
						<AlertDialogTitle>Начать тест?</AlertDialogTitle>
						<AlertDialogDescription>
							После подтверждения запустится таймер на {test.timeLimitMinutes} мин. Таймер не останавливается при
							перезагрузке страницы.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel onClick={() => window.history.back()}>Назад</AlertDialogCancel>
						<AlertDialogAction onClick={() => void handleConfirmStart()}>Начать</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AlertDialog open={showUnansweredDialog} onOpenChange={setShowUnansweredDialog}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Есть неотвеченные вопросы</AlertDialogTitle>
						<AlertDialogDescription>
							{orderedQuestions.length - answeredCount} вопр.{' '}
							{orderedQuestions.length - answeredCount === 1 ? 'остался' : 'осталось'} без ответа. Всё равно завершить?
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Вернуться</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								setShowUnansweredDialog(false)
								void doSubmit()
							}}
						>
							Всё равно завершить
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<Dialog open={showTimeExpiredDialog} onOpenChange={setShowTimeExpiredDialog}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Время для сдачи истекло</DialogTitle>
						<DialogDescription>
							Тест уже был отправлен автоматически. Вы можете просмотреть результаты.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						{expiredAttemptId ? (
							<Button
								onClick={() => {
									setShowTimeExpiredDialog(false)
									// Navigate to results — fetch the attempt and display it
									// Reload to refetch attempt history from server (initialAttempts is a server prop)
									window.location.reload()
								}}
							>
								К результатам
							</Button>
						) : (
							<Button onClick={() => setShowTimeExpiredDialog(false)}>Закрыть</Button>
						)}
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	)
}

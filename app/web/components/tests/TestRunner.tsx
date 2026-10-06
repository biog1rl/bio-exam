'use client'

import { isAnswered } from '@bio-exam/exam-core'

import { useEffect, useMemo, useState } from 'react'

import Link from 'next/link'
import { toast } from 'sonner'

import { useAuth } from '@/components/providers/AuthProvider'
import MdxRenderer from '@/components/tests/MdxRenderer'
import { QuestionInput } from '@/components/tests/QuestionInput'
import { AttemptReviewLine } from '@/components/tests/attempt-result/AttemptReviewLine'
import { TeacherCheckedMark } from '@/components/tests/attempt-result/TeacherCheckedMark'
import { QuestionAnswerReview } from '@/components/tests/attempt-review/QuestionAnswerReview'
import { runnerResultCard } from '@/components/tests/runner-result-card'
import { prefetchSignedUrls, resolvesViaApi } from '@/lib/image-signed-url-cache'
import { attemptResultView } from '@/lib/tests/attempt-result-view'
import { formatPercent } from '@/lib/tests/format'
import type { AttemptQuestionView, PublicTestDetail, PublicTestQuestion, TestAttemptSummary } from '@/lib/tests/types'
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog'
import { type AttemptNotice, saveIndicatorView, setMatchingPair, toggleOption } from './attempt-lifecycle'
import { useAttemptLifecycle } from './attempt-lifecycle/use-attempt-lifecycle'
import { answersInvalidBanner, type AttemptBanner, bannerFor, SUBMIT_FLOW_TEXT } from './attempt-submit-flow'

type Props = {
	test: PublicTestDetail
	questions: PublicTestQuestion[]
	initialAttempts?: TestAttemptSummary[]
	attemptsLoading?: boolean
}

function resolveTemplate(question: PublicTestQuestion): NonNullable<PublicTestQuestion['questionUiTemplate']> | null {
	return question.questionUiTemplate
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

/**
 * Рекурсивно извлекает все image src из Lexical JSON документа.
 * ImageNode хранит src как ключ хранилища или URL; URL для показа выдаёт API.
 */
function extractImagePaths(lexicalJson: unknown): string[] {
	const paths: string[] = []
	function walk(node: Record<string, unknown> | null | undefined) {
		if (!node) return
		if (node.type === 'image' && typeof node.src === 'string' && resolvesViaApi(node.src)) {
			paths.push(node.src)
		}
		if (Array.isArray(node.children)) {
			for (const child of node.children as unknown[]) walk(child as Record<string, unknown>)
		}
	}
	if (typeof lexicalJson === 'object' && lexicalJson !== null) {
		walk(lexicalJson as Record<string, unknown>)
		if ('root' in (lexicalJson as Record<string, unknown>)) {
			walk((lexicalJson as Record<string, unknown>).root as Record<string, unknown>)
		}
	}
	return paths
}

const RED_THRESHOLD_SECONDS_DEFAULT = 5 * 60 // 300 seconds = 5 minutes

function formatTime(seconds: number, showHours: boolean): string {
	const h = Math.floor(seconds / 3600)
	const m = Math.floor((seconds % 3600) / 60)
	const s = seconds % 60
	if (showHours) {
		return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
	}
	return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function TestRunner(props: Props) {
	const { me } = useAuth()
	if (!me) return <div>Загрузка теста...</div>
	return <AttemptRunner key={`${props.test.id}:${me.id}`} {...props} userId={me.id} />
}

function AttemptRunner({
	test,
	questions,
	initialAttempts = [],
	attemptsLoading = false,
	userId,
}: Props & { userId: string }) {
	const orderedQuestions = useMemo(() => [...questions].sort((a, b) => a.order - b.order), [questions])
	const [attempts, setAttempts] = useState<TestAttemptSummary[]>(initialAttempts)
	useEffect(() => {
		if (initialAttempts.length === 0) return
		setAttempts((prev) => {
			const knownIds = new Set(prev.map((attempt) => attempt.id))
			const added = initialAttempts.filter((attempt) => !knownIds.has(attempt.id))
			return added.length > 0 ? [...prev, ...added] : prev
		})
	}, [initialAttempts])
	const [showUnansweredDialog, setShowUnansweredDialog] = useState(false)
	const [alreadySubmittedClosed, setAlreadySubmittedClosed] = useState(false)

	const onNotice = (notice: AttemptNotice) => {
		if (notice.kind === 'session-restored') toast.info('Сессия восстановлена')
		else if (notice.kind === 'session-replaced') toast.info(SUBMIT_FLOW_TEXT.sessionReplaced)
		else if (notice.kind === 'start-failed') toast.error('Не удалось начать тест. Попробуйте ещё раз.')
		else if (notice.kind === 'retake-start-failed') toast.error('Не удалось начать новую попытку. Попробуйте ещё раз.')
		else if (notice.kind === 'one-minute-left')
			toast.warning('Осталась 1 минута — тест будет сдан автоматически', { duration: 8000 })
		else {
			const result = notice.result
			setAttempts((prev) => [
				{
					id: result.attemptId,
					earnedPoints: result.earnedPoints,
					totalPoints: result.totalPoints,
					scorePercentage: result.scorePercentage,
					passed: result.passed,
					reviewStatus: result.reviewStatus,
					autoEarnedPoints: result.autoEarnedPoints,
					autoTotalPoints: result.autoTotalPoints,
					submittedAt: result.submittedAt,
				},
				...prev,
			])
		}
	}

	const { lifecycle, snapshot } = useAttemptLifecycle({ test, questions, userId, onNotice })
	const answers = snapshot.answers
	const currentQuestionId = snapshot.currentQuestionId
	const submitResult = snapshot.result
	const resultView = submitResult ? attemptResultView(submitResult) : null
	const secondsLeft = snapshot.secondsLeft
	const submitting = snapshot.phase === 'submitting' || snapshot.phase === 'autoSubmitting'
	const interactionDisabled = snapshot.interactionDisabled
	const redThresholdSeconds = RED_THRESHOLD_SECONDS_DEFAULT
	const showHours = (test.timeLimitMinutes ?? 0) > 60

	const resultByQuestion = useMemo<Record<string, AttemptQuestionView>>(() => {
		const map: Record<string, AttemptQuestionView> = {}
		for (const item of submitResult?.results ?? []) {
			map[item.questionId] = item
		}
		return map
	}, [submitResult])

	const answeredCount = useMemo(
		() =>
			orderedQuestions.filter((question) =>
				isAnswered({
					template: question.questionUiTemplate,
					answer: answers[question.id],
					content: { options: question.options, matchingPairs: question.matchingPairs },
				})
			).length,
		[answers, orderedQuestions]
	)

	const onSelectRadio = (questionId: string, optionId: string) => {
		lifecycle.answer(questionId, optionId)
	}

	const onToggleCheckbox = (questionId: string, optionId: string) => {
		lifecycle.answer(questionId, toggleOption(lifecycle.getSnapshot().answers[questionId], optionId))
	}

	const onSelectMatching = (questionId: string, leftId: string, rightId: string) => {
		lifecycle.answer(questionId, setMatchingPair(lifecycle.getSnapshot().answers[questionId], leftId, rightId))
	}

	const onInputTextAnswer = (questionId: string, value: string) => {
		lifecycle.answer(questionId, value)
	}

	const currentIndex = useMemo(
		() => orderedQuestions.findIndex((q) => q.id === currentQuestionId),
		[orderedQuestions, currentQuestionId]
	)

	const goToQuestion = (index: number) => {
		const q = orderedQuestions[index]
		if (!q) return
		lifecycle.navigate(q.id)
	}

	const goPrev = () => goToQuestion(currentIndex - 1)
	const goNext = () => goToQuestion(currentIndex + 1)

	// Prefetch signed URLs for all images in all questions on mount
	useEffect(() => {
		const allPaths: string[] = []
		for (const question of orderedQuestions) {
			if (question.promptText) {
				try {
					const json: unknown =
						typeof question.promptText === 'string' ? JSON.parse(question.promptText) : question.promptText
					allPaths.push(...extractImagePaths(json))
				} catch {
					// Not JSON — skip
				}
			}
		}
		if (allPaths.length > 0) {
			prefetchSignedUrls(allPaths).catch(() => {})
		}
	}, [orderedQuestions])

	const handleSubmit = () => {
		if (answeredCount < orderedQuestions.length) {
			setShowUnansweredDialog(true)
		} else {
			void lifecycle.submit()
		}
	}

	const handleRetake = () => {
		setAlreadySubmittedClosed(false)
		lifecycle.retake()
	}

	const closeAlreadySubmitted = () => {
		setAlreadySubmittedClosed(true)
	}

	const blockReason = snapshot.blockReason
	const alreadySubmittedOpen = blockReason === 'already-submitted' && !alreadySubmittedClosed
	const banner: AttemptBanner | null =
		blockReason === 'start-not-assigned' || blockReason === 'submit-not-assigned' || blockReason === 'not-found'
			? blockReason
			: blockReason === 'already-submitted'
				? alreadySubmittedClosed
					? 'already-submitted'
					: null
				: snapshot.submitFailed
					? 'retry'
					: null
	const bannerView = snapshot.submitRejection
		? answersInvalidBanner(snapshot.submitRejection)
		: banner
			? bannerFor(banner)
			: null
	const saveIndicator = snapshot.saveIndicator ? saveIndicatorView(snapshot.saveIndicator) : null

	return (
		<div className="flex min-w-0 flex-col gap-4 tab:flex-row">
			<div className="min-w-0 flex-1">
				<div className="space-y-2">
					<h1 className="font-serif text-2xl leading-tight break-words text-foreground tab-sm:text-3xl">
						{test.title}
					</h1>
					{test.description ? <p className="whitespace-pre-wrap text-muted-foreground">{test.description}</p> : null}
					<div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
						<span>Тема: {test.topicTitle}</span>
						{test.timeLimitMinutes ? <span>Лимит: {test.timeLimitMinutes} мин</span> : null}
						{test.passingScore != null ? <span>Проходной балл: {formatPercent(test.passingScore)}</span> : null}
					</div>
				</div>

				{submitResult ? (
					<section
						className={cn(
							'rounded-lg border p-4',
							resultView?.kind === 'pending' ? 'border-border bg-secondary' : 'border-emerald-200 bg-emerald-50'
						)}
					>
						<h2 className="mb-2 text-lg font-semibold">Результат</h2>
						{resultView?.kind === 'pending' ? (
							<>
								<AttemptReviewLine view={resultView} audience="student" chipClassName="bg-card" />
								<p className="mt-2 text-sm text-muted-foreground">Процент и итог появятся после проверки учителем.</p>
							</>
						) : resultView ? (
							<>
								<p>
									Баллы: {resultView.points.earned} / {resultView.points.total}
								</p>
								<p>Процент: {formatPercent(resultView.percent)}</p>
								<p>{resultView.passed ? 'Статус: пройден' : 'Статус: не пройден'}</p>
							</>
						) : null}
						<div className="mt-3 flex flex-wrap gap-2">
							<Button type="button" variant="outline" onClick={handleRetake}>
								Пройти ещё раз
							</Button>
							<Button variant="outline" asChild>
								<Link href={`/tests/${test.topicSlug}/${test.slug}`}>К тесту</Link>
							</Button>
							<Button variant="outline" asChild>
								<Link href="/tests">Ко всем тестам</Link>
							</Button>
						</div>
					</section>
				) : null}

				{bannerView ? (
					<section className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-rose-200 bg-rose-50 p-4">
						<span role="alert" className="text-sm">
							{bannerView.message}
						</span>
						{bannerView.action === 'retry' ? (
							<Button variant="outline" size="sm" onClick={() => void lifecycle.submit()}>
								{SUBMIT_FLOW_TEXT.retryAction}
							</Button>
						) : bannerView.action === 'reload' ? (
							<Button variant="outline" size="sm" onClick={() => window.location.reload()}>
								{SUBMIT_FLOW_TEXT.reloadAction}
							</Button>
						) : null}
					</section>
				) : null}

				{snapshot.showTimeUp ? (
					<section className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
						<div className="mx-4 rounded-lg bg-white p-6 text-center shadow-xl tab-sm:p-8">
							<p className="text-2xl font-semibold">Время вышло</p>
							<p className="mt-2 text-sm text-muted-foreground">Отправка ответов...</p>
						</div>
					</section>
				) : null}

				{(() => {
					const question = orderedQuestions[currentIndex]
					if (!question) return null
					const questionResult = resultByQuestion[question.id]
					const card = questionResult ? runnerResultCard(questionResult.status) : null
					const template = resolveTemplate(question)

					return (
						<section
							key={question.id}
							id={`question-${question.id}`}
							className="grid scroll-mt-24 gap-unit-mob tab:gap-unit"
						>
							<p className="text-lg font-medium">{currentIndex + 1}.</p>
							<div className="flex-1 space-y-4 rounded-lg border bg-secondary p-4">
								<div className="space-y-2">
									<MdxRenderer source={question.promptText} className="prose max-w-none text-sm select-none" />
								</div>

								{!questionResult ? (
									<QuestionInput
										question={question}
										answer={answers[question.id]}
										disabled={interactionDisabled}
										onSelectRadio={onSelectRadio}
										onToggleCheckbox={onToggleCheckbox}
										onInputTextAnswer={onInputTextAnswer}
										onSelectMatching={onSelectMatching}
									/>
								) : null}
								{template == null ? (
									<p className="text-sm text-amber-600">Тип этого вопроса не настроен. Обратитесь к администратору.</p>
								) : null}

								{questionResult && card ? (
									<div className={card.className}>
										<p>{card.label}</p>
										<p className="mt-0.5 text-xs text-muted-foreground">
											{questionResult.status === 'pending'
												? `до ${questionResult.points} балл.`
												: `${questionResult.earnedPoints} / ${questionResult.points} баллов`}
										</p>
										<QuestionAnswerReview
											question={question}
											studentAnswer={questionResult.userAnswer}
											view={questionResult}
										/>
										{questionResult.explanationText ? (
											<MdxRenderer
												source={questionResult.explanationText}
												className="prose mt-2 max-w-none text-sm whitespace-normal"
											/>
										) : null}
									</div>
								) : null}
							</div>

							{/* Navigation buttons */}
							<div className="mt-6 flex flex-wrap items-center justify-between gap-2">
								<Button variant="outline" onClick={goPrev} disabled={currentIndex <= 0 || interactionDisabled}>
									Назад
								</Button>
								{currentIndex < orderedQuestions.length - 1 ? (
									<Button variant="outline" onClick={goNext} disabled={interactionDisabled}>
										Далее
									</Button>
								) : (
									<Button onClick={handleSubmit} disabled={submitting || interactionDisabled}>
										{submitting ? 'Отправка...' : 'Завершить'}
									</Button>
								)}
							</div>
						</section>
					)
				})()}

				{attemptsLoading ? (
					<p role="status">Загрузка истории попыток...</p>
				) : attempts.length > 0 ? (
					<Accordion type="single" collapsible className="mt-8 max-w-lg rounded-lg bg-secondary px-4">
						<AccordionItem className="border-none" value="score">
							<AccordionTrigger className="cursor-pointer">Мои попытки</AccordionTrigger>
							<AccordionContent>
								<ul className="space-y-2 text-sm">
									{attempts.map((attempt) => {
										const view = attemptResultView(attempt)
										return (
											<li
												key={attempt.id}
												className="flex flex-wrap items-center gap-x-1 rounded border bg-muted/30 p-2"
											>
												{view.kind === 'pending' ? (
													<>
														{formatDate(attempt.submittedAt)} / <AttemptReviewLine view={view} audience="student" />
													</>
												) : (
													<>
														{formatDate(attempt.submittedAt)} / {view.points.earned}/{view.points.total} /{' '}
														{formatPercent(view.percent)} / {view.passed ? 'пройден' : 'не пройден'}
														{view.teacherChecked ? (
															<>
																{' / '}
																<TeacherCheckedMark />
															</>
														) : null}
													</>
												)}
											</li>
										)
									})}
								</ul>
							</AccordionContent>
						</AccordionItem>
					</Accordion>
				) : null}
			</div>

			{/* Панель навигации по вопросам и прогресс */}
			<section className="h-fit w-full shrink-0 space-y-4 rounded-lg border bg-white p-4 tab:sticky tab:top-4 tab:w-48">
				{secondsLeft !== null && !submitResult && (
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
					<p className="text-xs text-muted-foreground">
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
					{saveIndicator ? (
						<p
							aria-live="polite"
							aria-atomic="true"
							className={cn('text-xs', saveIndicator.tone === 'warning' ? 'text-amber-700' : 'text-muted-foreground')}
						>
							{saveIndicator.text}
						</p>
					) : null}
				</div>

				<div className="grid grid-cols-5 gap-1">
					{orderedQuestions.map((question, index) => {
						const answered = isAnswered({
							template: question.questionUiTemplate,
							answer: answers[question.id],
							content: { options: question.options, matchingPairs: question.matchingPairs },
						})
						const isCurrent = question.id === currentQuestionId
						return (
							<button
								key={question.id}
								type="button"
								onClick={() => goToQuestion(index)}
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

				<Button type="button" onClick={handleSubmit} disabled={submitting || interactionDisabled} className="w-full">
					{submitting ? 'Отправка...' : 'Завершить'}
				</Button>
			</section>

			<AlertDialog open={snapshot.phase === 'awaitingStart'}>
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
						<AlertDialogAction onClick={() => void lifecycle.confirmStart()}>Начать</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AlertDialog open={blockReason === 'time-expired'}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle className="font-medium">{SUBMIT_FLOW_TEXT.timeExpiredTitle}</AlertDialogTitle>
						<AlertDialogDescription>{SUBMIT_FLOW_TEXT.timeExpiredDescription}</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogAction onClick={handleRetake}>{SUBMIT_FLOW_TEXT.timeExpiredAction}</AlertDialogAction>
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
								void lifecycle.submit()
							}}
						>
							Всё равно завершить
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<Dialog
				open={alreadySubmittedOpen}
				onOpenChange={(open) => {
					if (!open) closeAlreadySubmitted()
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle className="font-medium">{SUBMIT_FLOW_TEXT.alreadySubmittedTitle}</DialogTitle>
						<DialogDescription>{SUBMIT_FLOW_TEXT.alreadySubmittedDescription}</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						{snapshot.alreadySubmittedAttemptId ? (
							<Button onClick={() => window.location.reload()}>{SUBMIT_FLOW_TEXT.alreadySubmittedOpenResults}</Button>
						) : (
							<Button onClick={closeAlreadySubmitted}>{SUBMIT_FLOW_TEXT.alreadySubmittedClose}</Button>
						)}
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	)
}

'use client'

import { useMemo, useState } from 'react'

import { Clock, Eye, RotateCcw } from 'lucide-react'

import MdxRenderer from '@/components/tests/MdxRenderer'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { AttemptReviewData, PublicTestQuestion, QuestionTelemetry } from '@/lib/tests/types'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(ms: number): string {
	const s = Math.floor(ms / 1000)
	if (s < 60) return `${s}с`
	const m = Math.floor(s / 60)
	const rem = s % 60
	return `${m}м ${rem}с`
}

function resolveTemplate(question: PublicTestQuestion) {
	return question.questionUiTemplate
}

type QuestionResult = {
	questionId: string
	isCorrect: boolean
	points: number
	earnedPoints: number
	correctAnswer?: unknown
}

type QuestionStatus = 'correct' | 'partial' | 'wrong' | null

function getQuestionStatus(questionId: string, results: QuestionResult[]): QuestionStatus {
	const result = results.find((r) => r.questionId === questionId)
	if (!result) return null
	if (result.points === 0) return null
	if (result.earnedPoints === result.points) return 'correct'
	if (result.earnedPoints > 0) return 'partial'
	return 'wrong'
}

function questionCardClass(status: QuestionStatus): string {
	if (status === 'wrong') return 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/20'
	if (status === 'partial') return 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20'
	return ''
}

function statusBadge(status: QuestionStatus) {
	if (status === 'wrong')
		return (
			<Badge variant="destructive" className="text-xs">
				Неверно
			</Badge>
		)
	if (status === 'partial')
		return <Badge className="bg-amber-500 text-xs text-white hover:bg-amber-600">Частично верно</Badge>
	if (status === 'correct') return <Badge className="bg-green-600 text-xs text-white hover:bg-green-700">Верно</Badge>
	return null
}

function sidebarDot(status: QuestionStatus): string {
	if (status === 'wrong') return 'bg-red-500'
	if (status === 'partial') return 'bg-amber-400'
	if (status === 'correct') return 'bg-green-500'
	return 'bg-muted-foreground/30'
}

function scrollToId(id: string) {
	document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// ---------------------------------------------------------------------------
// Correct answer display
// ---------------------------------------------------------------------------

const CORRECT_BLOCK_CLS =
	'rounded-md border-2 border-green-400 bg-green-100 p-3 text-sm dark:border-green-600 dark:bg-green-900/40'
const CORRECT_LABEL_CLS = 'mb-1.5 text-xs font-semibold uppercase tracking-wide text-green-700 dark:text-green-400'
const CORRECT_VALUE_CLS = 'font-medium text-green-900 dark:text-green-100'

const STUDENT_BLOCK_CLS = 'rounded-md border p-3 text-sm bg-muted/30'
const STUDENT_LABEL_CLS = 'mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground'

function CorrectAnswerBlock({ question, correctAnswer }: { question: PublicTestQuestion; correctAnswer: unknown }) {
	const template = question.questionUiTemplate

	if (template === 'single_choice' && Array.isArray(question.options)) {
		const correctId = String(correctAnswer)
		const opt = question.options.find((o) => o.id === correctId)
		return (
			<div className={CORRECT_BLOCK_CLS}>
				<p className={CORRECT_LABEL_CLS}>Правильный ответ</p>
				<span className={CORRECT_VALUE_CLS}>{opt ? opt.text : correctId}</span>
			</div>
		)
	}

	if (template === 'multi_choice' && Array.isArray(correctAnswer) && Array.isArray(question.options)) {
		const correctIds = correctAnswer as string[]
		const correctOpts = question.options.filter((o) => correctIds.includes(o.id))
		if (correctOpts.length === 0) return null
		return (
			<div className={CORRECT_BLOCK_CLS}>
				<p className={CORRECT_LABEL_CLS}>Правильные ответы</p>
				<ul className="space-y-1">
					{correctOpts.map((opt) => (
						<li key={opt.id} className={CORRECT_VALUE_CLS}>
							{opt.text}
						</li>
					))}
				</ul>
			</div>
		)
	}

	if (
		(template === 'short_text' || template === 'sequence_digits') &&
		(typeof correctAnswer === 'string' || typeof correctAnswer === 'number')
	) {
		return (
			<div className={CORRECT_BLOCK_CLS}>
				<p className={CORRECT_LABEL_CLS}>Правильный ответ</p>
				<span className={CORRECT_VALUE_CLS}>{String(correctAnswer)}</span>
			</div>
		)
	}

	if (
		template === 'matching' &&
		correctAnswer !== null &&
		typeof correctAnswer === 'object' &&
		!Array.isArray(correctAnswer) &&
		question.matchingPairs
	) {
		const correctMap = correctAnswer as Record<string, string>
		return (
			<div className={CORRECT_BLOCK_CLS}>
				<p className={CORRECT_LABEL_CLS}>Правильные соответствия</p>
				<div className="space-y-1">
					{question.matchingPairs.left.map((left) => {
						const right = question.matchingPairs?.right.find((r) => r.id === correctMap[left.id])
						return (
							<div key={left.id} className={cn(CORRECT_VALUE_CLS, 'flex gap-2')}>
								<span>{left.text}</span>
								<span className="text-green-600 dark:text-green-400">→</span>
								<span>{right?.text ?? '—'}</span>
							</div>
						)
					})}
				</div>
			</div>
		)
	}

	return null
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type Props = {
	attempt: AttemptReviewData
	questions: PublicTestQuestion[]
}

// ---------------------------------------------------------------------------
// Summary Stats Section
// ---------------------------------------------------------------------------

function SummarySection({
	attempt,
	questions,
	results,
}: {
	attempt: AttemptReviewData
	questions: PublicTestQuestion[]
	results: QuestionResult[]
}) {
	const breakdown = useMemo(() => {
		const wrong: { question: PublicTestQuestion; idx: number; result: QuestionResult }[] = []
		const partial: { question: PublicTestQuestion; idx: number; result: QuestionResult }[] = []
		const correct: { question: PublicTestQuestion; idx: number; result: QuestionResult }[] = []

		questions.forEach((q, idx) => {
			const result = results.find((r) => r.questionId === q.id)
			if (!result || result.points === 0) return
			if (result.earnedPoints === result.points) correct.push({ question: q, idx, result })
			else if (result.earnedPoints > 0) partial.push({ question: q, idx, result })
			else wrong.push({ question: q, idx, result })
		})

		return { wrong, partial, correct }
	}, [questions, results])

	const timeStats = useMemo(() => {
		const telemetry = attempt.telemetry
		if (!telemetry) return null
		const entries = questions.map((q) => telemetry[q.id]).filter((t): t is QuestionTelemetry => Boolean(t))
		if (entries.length === 0) return null
		const totalMs = entries.reduce((acc, t) => acc + t.timeSpentMs, 0)
		const avgMs = Math.round(totalMs / entries.length)
		const totalFocusLoss = entries.reduce((acc, t) => acc + t.focusLossCount, 0)
		return { totalMs, avgMs, totalFocusLoss }
	}, [attempt.telemetry, questions])

	const total = breakdown.correct.length + breakdown.partial.length + breakdown.wrong.length

	return (
		<div className="space-y-6">
			<h2 className="text-2xl font-semibold">Итоговая статистика</h2>

			{/* Score overview */}
			<div className="grid gap-4 sm:grid-cols-3">
				<Card className="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/20">
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium text-green-700 dark:text-green-400">Верно</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-2xl font-bold text-green-700 dark:text-green-400">{breakdown.correct.length}</p>
						{total > 0 && (
							<p className="text-muted-foreground text-xs">
								{Math.round((breakdown.correct.length / total) * 100)}% вопросов
							</p>
						)}
					</CardContent>
				</Card>
				<Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20">
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium text-amber-700 dark:text-amber-400">Частично верно</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-2xl font-bold text-amber-700 dark:text-amber-400">{breakdown.partial.length}</p>
						{total > 0 && (
							<p className="text-muted-foreground text-xs">
								{Math.round((breakdown.partial.length / total) * 100)}% вопросов
							</p>
						)}
					</CardContent>
				</Card>
				<Card className="border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/20">
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium text-red-700 dark:text-red-400">Неверно</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-2xl font-bold text-red-700 dark:text-red-400">{breakdown.wrong.length}</p>
						{total > 0 && (
							<p className="text-muted-foreground text-xs">
								{Math.round((breakdown.wrong.length / total) * 100)}% вопросов
							</p>
						)}
					</CardContent>
				</Card>
			</div>

			{/* Wrong questions */}
			{breakdown.wrong.length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle className="text-base text-red-700 dark:text-red-400">
							Неверные ответы ({breakdown.wrong.length})
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-1">
						{breakdown.wrong.map(({ question, idx, result }) => (
							<button
								key={question.id}
								type="button"
								onClick={() => scrollToId(`question-${idx}`)}
								className="hover:bg-muted/50 flex w-full items-center justify-between rounded px-2 py-1.5 text-sm transition-colors"
							>
								<span className="text-left">Вопрос {idx + 1}</span>
								<span className="text-muted-foreground text-xs">
									{result.earnedPoints} / {result.points} балл.
								</span>
							</button>
						))}
					</CardContent>
				</Card>
			)}

			{/* Partial credit questions */}
			{breakdown.partial.length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle className="text-base text-amber-700 dark:text-amber-400">
							Частично верные ({breakdown.partial.length})
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-1">
						{breakdown.partial.map(({ question, idx, result }) => (
							<button
								key={question.id}
								type="button"
								onClick={() => scrollToId(`question-${idx}`)}
								className="hover:bg-muted/50 flex w-full items-center justify-between rounded px-2 py-1.5 text-sm transition-colors"
							>
								<span className="text-left">Вопрос {idx + 1}</span>
								<span className="text-muted-foreground text-xs">
									{result.earnedPoints} / {result.points} балл.
								</span>
							</button>
						))}
					</CardContent>
				</Card>
			)}

			{/* Time stats (optional) */}
			{timeStats && (
				<Card>
					<CardHeader>
						<CardTitle className="text-base">Время</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="flex flex-wrap gap-6 text-sm">
							<div>
								<p className="text-muted-foreground text-xs">Общее</p>
								<p className="font-medium">{formatDuration(timeStats.totalMs)}</p>
							</div>
							<div>
								<p className="text-muted-foreground text-xs">Среднее на вопрос</p>
								<p className="font-medium">{formatDuration(timeStats.avgMs)}</p>
							</div>
							<div>
								<p className="text-muted-foreground text-xs">Потерь фокуса</p>
								<p className="font-medium">{timeStats.totalFocusLoss}</p>
							</div>
						</div>
					</CardContent>
				</Card>
			)}
		</div>
	)
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

type NavFilter = 'all' | 'correct' | 'partial' | 'wrong'

const NAV_FILTERS: { value: NavFilter; label: string; dot: string }[] = [
	{ value: 'all', label: 'Все', dot: '' },
	{ value: 'correct', label: 'Верно', dot: 'bg-green-500' },
	{ value: 'partial', label: 'Частично', dot: 'bg-amber-400' },
	{ value: 'wrong', label: 'Неверно', dot: 'bg-red-500' },
]

export default function AttemptReview({ attempt, questions }: Props) {
	const orderedQuestions = useMemo(() => [...questions].sort((a, b) => a.order - b.order), [questions])
	const results = useMemo(() => (attempt.results as QuestionResult[]) ?? [], [attempt.results])
	const [navFilter, setNavFilter] = useState<NavFilter>('all')

	return (
		<div className="flex gap-x-4">
			{/* Main content — scrollable list of all questions */}
			<div className="flex-1 space-y-6">
				{orderedQuestions.map((question, index) => {
					const template = resolveTemplate(question)
					const studentAnswer = attempt.answers[question.id]
					const status = getQuestionStatus(question.id, results)
					const result = results.find((r) => r.questionId === question.id)

					return (
						<section
							key={question.id}
							id={`question-${index}`}
							className={cn('scroll-mt-6 space-y-4 rounded-lg border p-4', questionCardClass(status))}
						>
							{/* Question header */}
							<div className="flex items-center gap-2">
								<p className="text-lg font-medium">{index + 1}.</p>
								{statusBadge(status)}
								{result && (
									<span className="text-muted-foreground ml-auto text-xs">
										{result.earnedPoints} / {result.points} балл.
									</span>
								)}
							</div>

							<div className="space-y-2">
								<MdxRenderer source={question.promptText} className="prose max-w-none text-sm" />
							</div>

							{/* Single choice */}
							{template === 'single_choice' && Array.isArray(question.options) ? (
								<div className={STUDENT_BLOCK_CLS}>
									<p className={STUDENT_LABEL_CLS}>Ваш ответ</p>
									<RadioGroup
										className="w-fit space-y-2"
										value={typeof studentAnswer === 'string' ? studentAnswer : ''}
										disabled
									>
										{question.options.map((option) => {
											const inputId = `review-${question.id}-opt-${option.id}`
											return (
												<div key={option.id} className="flex items-center gap-2">
													<RadioGroupItem id={inputId} value={option.id} />
													<Label htmlFor={inputId} className="cursor-not-allowed font-normal opacity-80">
														{option.text}
													</Label>
												</div>
											)
										})}
									</RadioGroup>
								</div>
							) : null}

							{/* Multi choice */}
							{template === 'multi_choice' && Array.isArray(question.options) ? (
								<div className={STUDENT_BLOCK_CLS}>
									<p className={STUDENT_LABEL_CLS}>Ваш ответ</p>
									<div className="space-y-2">
										{question.options.map((option) => {
											const inputId = `review-${question.id}-opt-${option.id}`
											const checked = Array.isArray(studentAnswer) && (studentAnswer as string[]).includes(option.id)
											return (
												<div key={option.id} className="flex items-center gap-2">
													<Checkbox id={inputId} checked={checked} disabled />
													<Label htmlFor={inputId} className="cursor-not-allowed font-normal opacity-80">
														{option.text}
													</Label>
												</div>
											)
										})}
									</div>
								</div>
							) : null}

							{/* Short text / sequence digits */}
							{template === 'short_text' || template === 'sequence_digits' ? (
								<div className={STUDENT_BLOCK_CLS}>
									<p className={STUDENT_LABEL_CLS}>Ваш ответ</p>
									<p className="text-sm">
										{typeof studentAnswer === 'string' && studentAnswer !== '' ? (
											studentAnswer
										) : (
											<span className="text-muted-foreground italic">Нет ответа</span>
										)}
									</p>
								</div>
							) : null}

							{/* Matching */}
							{template === 'matching' && question.matchingPairs ? (
								<div className={STUDENT_BLOCK_CLS}>
									<p className={STUDENT_LABEL_CLS}>Ваш ответ</p>
									<div className="space-y-3">
										{question.matchingPairs.left.map((left) => {
											const selectedRightId =
												studentAnswer && typeof studentAnswer === 'object' && !Array.isArray(studentAnswer)
													? (studentAnswer as Record<string, string>)[left.id] || ''
													: ''
											return (
												<div key={left.id} className="grid gap-2 sm:grid-cols-[1fr_220px] sm:items-center">
													<div>{left.text}</div>
													<Select value={selectedRightId || undefined} disabled>
														<SelectTrigger className="sm:w-55 w-full">
															<SelectValue placeholder="Нет ответа" />
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
								</div>
							) : null}

							{/* Correct answer (only for wrong / partial) */}
							{(status === 'wrong' || status === 'partial') && result?.correctAnswer !== undefined ? (
								<CorrectAnswerBlock question={question} correctAnswer={result.correctAnswer} />
							) : null}

							{/* Telemetry panel */}
							{attempt.telemetry?.[question.id] ? (
								<div className="bg-muted/40 text-muted-foreground mt-2 rounded-md border p-3 text-sm">
									<div className="flex flex-wrap gap-4">
										<span className="flex items-center gap-1">
											<Clock className="h-3.5 w-3.5" />
											{formatDuration(attempt.telemetry[question.id].timeSpentMs)}
										</span>
										<span className="flex items-center gap-1">
											<Eye className="h-3.5 w-3.5" />
											Потерь фокуса: {attempt.telemetry[question.id].focusLossCount}
										</span>
										<span className="flex items-center gap-1">
											<RotateCcw className="h-3.5 w-3.5" />
											Посещений: {attempt.telemetry[question.id].visitCount}
										</span>
									</div>
								</div>
							) : null}
						</section>
					)
				})}

				{/* Summary section at the bottom */}
				<section id="summary-section" className="scroll-mt-6 pt-4">
					<SummarySection attempt={attempt} questions={orderedQuestions} results={results} />
				</section>
			</div>

			{/* Sidebar — sticky, scrollable nav */}
			<aside className="dark:bg-card sticky top-4 h-fit w-52 shrink-0 space-y-4 rounded-lg border bg-white p-4">
				<p className="text-muted-foreground text-xs font-medium">Навигация по вопросам</p>

				{/* Filter buttons */}
				<div className="flex flex-wrap gap-1">
					{NAV_FILTERS.map((f) => (
						<button
							key={f.value}
							type="button"
							onClick={() => setNavFilter(f.value)}
							className={cn(
								'flex items-center gap-1 rounded px-1.5 py-0.5 text-xs transition-colors',
								navFilter === f.value
									? 'bg-primary text-primary-foreground'
									: 'bg-muted text-muted-foreground hover:bg-muted/70'
							)}
						>
							{f.dot && <span className={cn('h-1.5 w-1.5 rounded-full', f.dot)} />}
							{f.label}
						</button>
					))}
				</div>

				<ScrollArea className="h-56">
					<div className="space-y-1 pr-1">
						{orderedQuestions.map((q, index) => {
							const status = getQuestionStatus(q.id, results)
							if (navFilter !== 'all' && status !== navFilter) return null
							const timeMs = attempt.telemetry?.[q.id]?.timeSpentMs ?? 0
							return (
								<button
									key={q.id}
									type="button"
									onClick={() => scrollToId(`question-${index}`)}
									className="hover:bg-muted/50 flex w-full items-center justify-between rounded px-2 py-1 text-xs transition-colors"
								>
									<span className="flex items-center gap-1.5">
										<span className={cn('h-2 w-2 shrink-0 rounded-full', sidebarDot(status))} />
										{index + 1}
									</span>
									<span className="text-muted-foreground">{formatDuration(timeMs)}</span>
								</button>
							)
						})}
						{navFilter === 'all' && (
							<button
								type="button"
								onClick={() => scrollToId('summary-section')}
								className="hover:bg-muted/50 flex w-full items-center justify-between rounded px-2 py-1 text-xs transition-colors"
							>
								<span>Итоги</span>
							</button>
						)}
					</div>
				</ScrollArea>

				{/* Legend */}
				<div className="space-y-1 border-t pt-2 text-xs">
					<div className="text-muted-foreground flex items-center gap-1.5">
						<span className="h-2 w-2 rounded-full bg-green-500" />
						Верно
					</div>
					<div className="text-muted-foreground flex items-center gap-1.5">
						<span className="h-2 w-2 rounded-full bg-amber-400" />
						Частично
					</div>
					<div className="text-muted-foreground flex items-center gap-1.5">
						<span className="h-2 w-2 rounded-full bg-red-500" />
						Неверно
					</div>
				</div>

				{/* Score summary */}
				<div className="bg-muted/30 rounded-md border p-2 text-xs">
					<p className="font-medium">
						{attempt.earnedPoints} / {attempt.totalPoints} баллов
					</p>
					<p className="text-muted-foreground">{Math.round(attempt.scorePercentage)}%</p>
					<p className={attempt.passed ? 'text-green-600' : 'text-red-600'}>
						{attempt.passed ? 'Пройден' : 'Не пройден'}
					</p>
				</div>
			</aside>
		</div>
	)
}

'use client'

import { useCallback, useMemo, useState } from 'react'

import { Clock, Eye, RotateCcw } from 'lucide-react'

import MdxRenderer from '@/components/tests/MdxRenderer'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
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

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type Props = {
	attempt: AttemptReviewData
	questions: PublicTestQuestion[]
}

// ---------------------------------------------------------------------------
// Summary Stats Page
// ---------------------------------------------------------------------------

function SummaryPage({ attempt, questions }: { attempt: AttemptReviewData; questions: PublicTestQuestion[] }) {
	const telemetry = attempt.telemetry

	const stats = useMemo(() => {
		if (!telemetry) return null

		const entries = questions
			.map((q) => ({ question: q, t: telemetry[q.id] }))
			.filter((e): e is { question: PublicTestQuestion; t: QuestionTelemetry } => Boolean(e.t))

		if (entries.length === 0) return null

		const totalMs = entries.reduce((acc, e) => acc + e.t.timeSpentMs, 0)
		const avgMs = totalMs / entries.length
		const totalFocusLoss = entries.reduce((acc, e) => acc + e.t.focusLossCount, 0)

		const sorted = [...entries].sort((a, b) => b.t.timeSpentMs - a.t.timeSpentMs)
		const slowest = sorted.slice(0, 3)
		const fastest = sorted
			.filter((e) => e.t.timeSpentMs > 0)
			.slice(-3)
			.reverse()

		return { totalMs, avgMs, totalFocusLoss, entries, slowest, fastest }
	}, [telemetry, questions])

	if (!stats) {
		return (
			<div className="bg-muted/30 text-muted-foreground mt-8 rounded-lg border p-6 text-center">
				Данные телеметрии недоступны для этой попытки.
			</div>
		)
	}

	const slowestIds = new Set(stats.slowest.map((e) => e.question.id))
	const fastestIds = new Set(stats.fastest.map((e) => e.question.id))

	function getSpeedBadge(questionId: string) {
		if (slowestIds.has(questionId)) {
			return (
				<Badge variant="destructive" className="text-xs">
					медленно
				</Badge>
			)
		}
		if (fastestIds.has(questionId)) {
			return (
				<Badge variant="default" className="bg-green-600 text-xs">
					быстро
				</Badge>
			)
		}
		return (
			<Badge variant="secondary" className="text-xs">
				норма
			</Badge>
		)
	}

	return (
		<div className="space-y-6">
			<h2 className="text-2xl font-semibold">Итоговая статистика</h2>

			{/* Overview cards */}
			<div className="grid gap-4 sm:grid-cols-3">
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-muted-foreground text-sm font-medium">Общее время</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-2xl font-bold">{formatDuration(stats.totalMs)}</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-muted-foreground text-sm font-medium">Среднее на вопрос</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-2xl font-bold">{formatDuration(Math.round(stats.avgMs))}</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-muted-foreground text-sm font-medium">Потерь фокуса</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-2xl font-bold">{stats.totalFocusLoss}</p>
					</CardContent>
				</Card>
			</div>

			{/* Top slow/fast */}
			<div className="grid gap-4 sm:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle className="text-base">Медленнее всего</CardTitle>
					</CardHeader>
					<CardContent className="space-y-2">
						{stats.slowest.map((e) => {
							const idx = questions.findIndex((q) => q.id === e.question.id)
							return (
								<div key={e.question.id} className="flex items-center justify-between text-sm">
									<span className="text-muted-foreground">Вопрос {idx + 1}</span>
									<span className="font-medium text-red-600">{formatDuration(e.t.timeSpentMs)}</span>
								</div>
							)
						})}
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle className="text-base">Быстрее всего</CardTitle>
					</CardHeader>
					<CardContent className="space-y-2">
						{stats.fastest.map((e) => {
							const idx = questions.findIndex((q) => q.id === e.question.id)
							return (
								<div key={e.question.id} className="flex items-center justify-between text-sm">
									<span className="text-muted-foreground">Вопрос {idx + 1}</span>
									<span className="font-medium text-green-600">{formatDuration(e.t.timeSpentMs)}</span>
								</div>
							)
						})}
					</CardContent>
				</Card>
			</div>

			{/* Per-question table */}
			<Card>
				<CardHeader>
					<CardTitle className="text-base">По каждому вопросу</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="space-y-2">
						{stats.entries.map((e) => {
							const idx = questions.findIndex((q) => q.id === e.question.id)
							return (
								<div
									key={e.question.id}
									className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
								>
									<div className="flex items-center gap-2">
										<span className="text-muted-foreground w-24">Вопрос {idx + 1}</span>
										{getSpeedBadge(e.question.id)}
									</div>
									<div className="text-muted-foreground flex gap-4">
										<span className="flex items-center gap-1">
											<Clock className="h-3 w-3" />
											{formatDuration(e.t.timeSpentMs)}
										</span>
										<span className="flex items-center gap-1">
											<Eye className="h-3 w-3" />
											{e.t.focusLossCount} потерь
										</span>
										<span>{e.t.visitCount} посещ.</span>
									</div>
								</div>
							)
						})}
					</div>
				</CardContent>
			</Card>
		</div>
	)
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function AttemptReview({ attempt, questions }: Props) {
	const orderedQuestions = useMemo(() => [...questions].sort((a, b) => a.order - b.order), [questions])

	const [currentIndex, setCurrentIndex] = useState(0)

	const goToQuestion = useCallback(
		(index: number) => {
			if (index >= 0 && index <= orderedQuestions.length) {
				setCurrentIndex(index)
			}
		},
		[orderedQuestions.length]
	)

	const goPrev = useCallback(() => goToQuestion(currentIndex - 1), [goToQuestion, currentIndex])
	const goNext = useCallback(() => goToQuestion(currentIndex + 1), [goToQuestion, currentIndex])

	const isFinalPage = currentIndex === orderedQuestions.length

	const question = isFinalPage ? null : orderedQuestions[currentIndex]
	const template = question ? resolveTemplate(question) : null

	// Get student's answer for current question
	const studentAnswer = question ? attempt.answers[question.id] : undefined

	return (
		<div className="flex gap-x-4">
			{/* Main content */}
			<div className="flex-1 space-y-4">
				{isFinalPage ? (
					<SummaryPage attempt={attempt} questions={orderedQuestions} />
				) : question ? (
					<section key={question.id} className="gap-unit-mob tab:gap-unit grid scroll-mt-24">
						<p className="text-lg font-medium">{currentIndex + 1}.</p>

						<div className="bg-secondary flex-1 space-y-4 rounded-lg border p-4">
							<div className="space-y-2">
								<MdxRenderer source={question.promptText} className="prose max-w-none text-sm" />
							</div>

							{/* Single choice */}
							{template === 'single_choice' && Array.isArray(question.options) ? (
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
							) : null}

							{/* Multi choice */}
							{template === 'multi_choice' && Array.isArray(question.options) ? (
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
							) : null}

							{/* Short text / sequence digits */}
							{template === 'short_text' || template === 'sequence_digits' ? (
								<div className="max-w-xs space-y-1">
									<Input
										type="text"
										inputMode={template === 'sequence_digits' ? 'numeric' : 'text'}
										value={typeof studentAnswer === 'string' ? studentAnswer : ''}
										readOnly
										disabled
										placeholder="Нет ответа"
									/>
								</div>
							) : null}

							{/* Matching */}
							{template === 'matching' && question.matchingPairs ? (
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
							) : null}

							{/* Telemetry panel */}
							{attempt.telemetry?.[question.id] ? (
								<div className="bg-muted/40 text-muted-foreground mt-4 rounded-md border p-3 text-sm">
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
						</div>

						{/* Navigation */}
						<div className="mt-4 flex items-center justify-between">
							<Button variant="outline" onClick={goPrev} disabled={currentIndex <= 0}>
								Назад
							</Button>
							<Button variant="outline" onClick={goNext}>
								{currentIndex < orderedQuestions.length - 1 ? 'Далее' : 'Итоги'}
							</Button>
						</div>
					</section>
				) : null}

				{isFinalPage ? (
					<div className="mt-4 flex justify-start">
						<Button variant="outline" onClick={goPrev}>
							Назад
						</Button>
					</div>
				) : null}
			</div>

			{/* Sidebar */}
			<section className="sticky top-4 h-fit w-52 shrink-0 space-y-4 rounded-lg border bg-white p-4">
				<p className="text-muted-foreground text-xs font-medium">Навигация по вопросам</p>

				<div className="space-y-1">
					{orderedQuestions.map((q, index) => {
						const isCurrent = !isFinalPage && index === currentIndex
						const timeMs = attempt.telemetry?.[q.id]?.timeSpentMs ?? 0
						return (
							<button
								key={q.id}
								type="button"
								onClick={() => goToQuestion(index)}
								className={cn(
									'hover:bg-muted/50 flex w-full items-center justify-between rounded px-2 py-1 text-xs transition-colors',
									isCurrent && 'bg-muted font-semibold'
								)}
							>
								<span>{index + 1}</span>
								<span className="text-muted-foreground">{formatDuration(timeMs)}</span>
							</button>
						)
					})}
					<button
						type="button"
						onClick={() => goToQuestion(orderedQuestions.length)}
						className={cn(
							'hover:bg-muted/50 flex w-full items-center justify-between rounded px-2 py-1 text-xs transition-colors',
							isFinalPage && 'bg-muted font-semibold'
						)}
					>
						<span>Итоги</span>
					</button>
				</div>

				{/* Score summary */}
				<div className="bg-muted/30 rounded-md border p-2 text-xs">
					<p className="font-medium">
						{attempt.earnedPoints} / {attempt.totalPoints} баллов
					</p>
					<p className="text-muted-foreground">{attempt.scorePercentage.toFixed(1)}%</p>
					<p className={attempt.passed ? 'text-green-600' : 'text-red-600'}>
						{attempt.passed ? 'Пройден' : 'Не пройден'}
					</p>
				</div>
			</section>
		</div>
	)
}

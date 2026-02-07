'use client'

import { useMemo, useState } from 'react'

import MdxRenderer from '@/components/tests/MdxRenderer'
import { submitPublicTestAnswers } from '@/lib/tests/api'
import type {
	PublicTestDetail,
	PublicTestQuestion,
	SubmitResult,
	TestAnswerValue,
	TestAttemptSummary,
} from '@/lib/tests/types'

import { Button } from '../ui/button'
import { Checkbox } from '../ui/checkbox'
import { Label } from '../ui/label'
import { RadioGroup, RadioGroupItem } from '../ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'

type ResultByQuestion = Record<
	string,
	{
		isCorrect: boolean
		correctAnswer: unknown
		explanationText: string | null
	}
>

type Props = {
	test: PublicTestDetail
	questions: PublicTestQuestion[]
	initialAttempts?: TestAttemptSummary[]
}

function isAnswered(question: PublicTestQuestion, value: TestAnswerValue | undefined): boolean {
	if (!value) return false
	if (question.type === 'radio') return typeof value === 'string' && value.length > 0
	if (question.type === 'checkbox') return Array.isArray(value) && value.length > 0
	if (question.type === 'matching') {
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

	if ((question.type === 'radio' || question.type === 'checkbox') && Array.isArray(question.options)) {
		const optionMap = new Map(question.options.map((option) => [option.id, option.text]))

		if (typeof correctAnswer === 'string') {
			return optionMap.get(correctAnswer) || correctAnswer
		}
		if (Array.isArray(correctAnswer)) {
			const labels = correctAnswer
				.filter((value): value is string => typeof value === 'string')
				.map((id) => optionMap.get(id) || id)
			return labels.length > 0 ? labels.join(', ') : null
		}
	}

	if (
		question.type === 'matching' &&
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

export default function TestRunner({ test, questions, initialAttempts = [] }: Props) {
	const orderedQuestions = useMemo(() => [...questions].sort((a, b) => a.order - b.order), [questions])
	const [answers, setAnswers] = useState<Record<string, TestAnswerValue>>({})
	const [submitting, setSubmitting] = useState(false)
	const [submitResult, setSubmitResult] = useState<SubmitResult | null>(null)
	const [submitError, setSubmitError] = useState<string | null>(null)
	const [attempts, setAttempts] = useState<TestAttemptSummary[]>(initialAttempts)

	const resultByQuestion = useMemo<ResultByQuestion>(() => {
		const map: ResultByQuestion = {}
		for (const item of submitResult?.results ?? []) {
			map[item.questionId] = {
				isCorrect: item.isCorrect,
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

	const onSelectRadio = (questionId: string, optionId: string) => {
		setAnswers((prev) => ({ ...prev, [questionId]: optionId }))
	}

	const onToggleCheckbox = (questionId: string, optionId: string) => {
		setAnswers((prev) => {
			const current = Array.isArray(prev[questionId]) ? [...(prev[questionId] as string[])] : []
			const next = current.includes(optionId) ? current.filter((id) => id !== optionId) : [...current, optionId]
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
			return { ...prev, [questionId]: current }
		})
	}

	const handleSubmit = async () => {
		setSubmitting(true)
		setSubmitError(null)
		try {
			const result = await submitPublicTestAnswers(test.id, answers)
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
		} catch (error) {
			console.error('Failed to submit test answers:', error)
			setSubmitError('Не удалось сохранить ответы. Попробуйте еще раз.')
		} finally {
			setSubmitting(false)
		}
	}

	return (
		<div className="flex space-y-6 p-4">
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
					</section>
				) : null}

				{submitError ? (
					<section className="rounded-lg border border-rose-200 bg-rose-50 p-4">{submitError}</section>
				) : null}

				{orderedQuestions.map((question, index) => {
					const questionResult = resultByQuestion[question.id]

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

								{question.type === 'radio' && Array.isArray(question.options) ? (
									<RadioGroup
										className="w-fit space-y-2"
										value={typeof answers[question.id] === 'string' ? (answers[question.id] as string) : ''}
										onValueChange={(value) => onSelectRadio(question.id, value)}
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

								{question.type === 'checkbox' && Array.isArray(question.options) ? (
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
													/>
													<Label htmlFor={inputId} className="cursor-pointer font-normal">
														{option.text}
													</Label>
												</div>
											)
										})}
									</div>
								) : null}

								{question.type === 'matching' && question.matchingPairs ? (
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

								{questionResult ? (
									<div
										className={
											questionResult.isCorrect
												? 'rounded border border-emerald-200 bg-emerald-50 p-3 text-sm'
												: 'rounded border border-rose-200 bg-rose-50 p-3 text-sm'
										}
									>
										<p>{questionResult.isCorrect ? 'Верно' : 'Неверно'}</p>
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
					<section className="space-y-3 rounded-lg border p-4">
						<h2 className="text-lg font-semibold">Мои попытки</h2>
						<ul className="space-y-2 text-sm">
							{attempts.map((attempt) => (
								<li key={attempt.id} className="bg-muted/30 rounded border p-2">
									{formatDate(attempt.submittedAt)} / {attempt.earnedPoints}/{attempt.totalPoints} /{' '}
									{attempt.scorePercentage.toFixed(1)}% / {attempt.passed ? 'пройден' : 'не пройден'}
								</li>
							))}
						</ul>
					</section>
				) : null}
			</div>

			<section className="bg-muted/30 rounded-lg border p-4">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<p className="text-sm">
						Отвечено: {answeredCount} из {orderedQuestions.length}
					</p>
					<Button type="button" onClick={handleSubmit} disabled={submitting}>
						{submitting ? 'Отправка...' : 'Завершить и проверить'}
					</Button>
				</div>
			</section>
		</div>
	)
}

import { Clock3, Eye, RotateCcw } from 'lucide-react'

import MdxRenderer from '@/components/tests/MdxRenderer'
import type { AttemptReviewData, PublicTestQuestion } from '@/lib/tests/types'
import { cn } from '@/lib/utils/cn'

import {
	formatDuration,
	getQuestionStatus,
	getStatusClass,
	getStatusLabel,
	type QuestionResult,
} from './attempt-review-utils'

function optionText(question: PublicTestQuestion, optionId: string) {
	return question.options?.find((option) => option.id === optionId)?.text ?? optionId
}

function answerLines(question: PublicTestQuestion, value: unknown): string[] {
	const template = question.questionUiTemplate

	if (template === 'single_choice' && typeof value === 'string') return [optionText(question, value)]
	if (template === 'multi_choice' && Array.isArray(value))
		return value.map((item) => optionText(question, String(item)))
	if ((template === 'short_text' || template === 'sequence_digits') && typeof value === 'string')
		return [value || 'Нет ответа']

	if (
		template === 'matching' &&
		value &&
		typeof value === 'object' &&
		!Array.isArray(value) &&
		question.matchingPairs
	) {
		const map = value as Record<string, string>
		return question.matchingPairs.left.map((left) => {
			const right = question.matchingPairs?.right.find((item) => item.id === map[left.id])
			return `${left.text} -> ${right?.text ?? 'нет ответа'}`
		})
	}

	return ['Нет ответа']
}

function AnswerBlock({
	label,
	lines,
	variant = 'student',
}: {
	label: string
	lines: string[]
	variant?: 'student' | 'correct'
}) {
	return (
		<div
			className={cn(
				'p-unit rounded-3xl border text-sm',
				variant === 'correct' ? 'border-green-500/35 bg-green-50/80' : 'border-border/70 bg-secondary/55'
			)}
		>
			<p
				className={cn(
					'mb-3 font-mono text-[0.6875rem] uppercase tracking-[0.18em]',
					variant === 'correct' ? 'text-green-700' : 'text-muted-foreground'
				)}
			>
				{label}
			</p>
			<div className="space-y-2">
				{lines.map((line, index) => (
					<p key={`${line}-${index}`} className={variant === 'correct' ? 'text-green-900' : 'text-foreground'}>
						{line}
					</p>
				))}
			</div>
		</div>
	)
}

export function AttemptQuestionsList({
	attempt,
	questions,
	allQuestions,
	results,
}: {
	attempt: AttemptReviewData
	questions: PublicTestQuestion[]
	allQuestions: PublicTestQuestion[]
	results: QuestionResult[]
}) {
	if (questions.length === 0) {
		return (
			<section className="border-border/80 bg-card/90 rounded-4xl p-unit-mob tab-sm:p-unit border">
				<p className="text-muted-foreground">В выбранном фильтре нет вопросов.</p>
			</section>
		)
	}

	return (
		<div className="space-y-3">
			{questions.map((question) => {
				const index = allQuestions.findIndex((item) => item.id === question.id)
				const result = results.find((item) => item.questionId === question.id)
				const status = getQuestionStatus(question.id, results)
				const telemetry = attempt.telemetry?.[question.id]
				const studentAnswer = attempt.answers[question.id]

				return (
					<section
						key={question.id}
						id={`question-${index}`}
						className="rounded-4xl border-border/80 bg-card/90 p-unit-mob tab-sm:p-unit scroll-mt-6 border"
					>
						<div className="flex flex-wrap items-center justify-between gap-3">
							<div className="flex items-center gap-3">
								<span className="bg-secondary/70 inline-flex size-10 items-center justify-center rounded-full font-serif text-xl">
									{index + 1}
								</span>
								<span className={cn('rounded-full border px-3 py-1 text-sm', getStatusClass(status))}>
									{getStatusLabel(status)}
								</span>
							</div>
							{result ? (
								<span className="bg-secondary/70 text-muted-foreground rounded-full px-3 py-1 text-sm">
									{result.earnedPoints} / {result.points} балл.
								</span>
							) : null}
						</div>

						<MdxRenderer source={question.promptText} className="prose mt-6 max-w-none text-sm" />

						<div className="tab-sm:grid-cols-2 mt-6 grid gap-3">
							<AnswerBlock label="ответ студента" lines={answerLines(question, studentAnswer)} />
							{(status === 'wrong' || status === 'partial') && result?.correctAnswer !== undefined ? (
								<AnswerBlock
									label="правильный ответ"
									lines={answerLines(question, result.correctAnswer)}
									variant="correct"
								/>
							) : null}
						</div>

						{telemetry ? (
							<div className="text-muted-foreground mt-5 flex flex-wrap gap-2 text-sm">
								<span className="bg-secondary/70 inline-flex items-center gap-2 rounded-full px-3 py-1">
									<Clock3 className="size-3.5" />
									{formatDuration(telemetry.timeSpentMs)}
								</span>
								<span className="bg-secondary/70 inline-flex items-center gap-2 rounded-full px-3 py-1">
									<Eye className="size-3.5" />
									{telemetry.focusLossCount} потерь фокуса
								</span>
								<span className="bg-secondary/70 inline-flex items-center gap-2 rounded-full px-3 py-1">
									<RotateCcw className="size-3.5" />
									{telemetry.visitCount} посещений
								</span>
							</div>
						) : null}
					</section>
				)
			})}
		</div>
	)
}

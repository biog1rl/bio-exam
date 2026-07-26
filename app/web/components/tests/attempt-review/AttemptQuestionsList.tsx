import { Check, Clock3, Eye, RotateCcw, X } from 'lucide-react'

import MdxRenderer from '@/components/tests/MdxRenderer'
import type { AttemptReviewData, PublicTestQuestion } from '@/lib/tests/types'
import { cn } from '@/lib/utils/cn'

import {
	formatAnswerLines,
	formatDuration,
	getChoiceOptionReviewRows,
	getQuestionStatus,
	getStatusClass,
	getStatusLabel,
	type QuestionResult,
} from './attempt-review-utils'

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

function ChoiceOptionsReview({
	question,
	studentAnswer,
	correctAnswer,
}: {
	question: PublicTestQuestion
	studentAnswer: unknown
	correctAnswer: unknown
}) {
	const rows = getChoiceOptionReviewRows(question, studentAnswer, correctAnswer)

	return (
		<div className="mt-6">
			<p className="text-muted-foreground mb-3 font-mono text-[0.6875rem] uppercase tracking-[0.18em]">
				варианты ответа
			</p>
			<div className="space-y-2" role="list">
				{rows.map((row) => (
					<div
						key={row.id}
						role="listitem"
						className={cn(
							'flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm',
							row.status === 'correct' && 'border-green-500/40 bg-green-50/80 text-green-900',
							row.status === 'incorrect-selected' && 'border-red-500/40 bg-red-50/80 text-red-900',
							row.status === 'neutral' && 'border-border/70 bg-secondary/45 text-muted-foreground'
						)}
					>
						{row.status === 'correct' ? (
							<Check className="size-4 shrink-0 text-green-700" aria-hidden="true" />
						) : row.status === 'incorrect-selected' ? (
							<X className="size-4 shrink-0 text-red-700" aria-hidden="true" />
						) : (
							<span className="border-muted-foreground/35 size-4 shrink-0 rounded-full border" aria-hidden="true" />
						)}
						<span className="min-w-0 flex-1">{row.text}</span>
						{row.status === 'correct' ? (
							<span className="shrink-0 text-xs font-medium text-green-700">Правильный</span>
						) : row.status === 'incorrect-selected' ? (
							<span className="shrink-0 text-xs font-medium text-red-700">Выбран неверно</span>
						) : null}
					</div>
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
				const isChoiceQuestion =
					question.questionUiTemplate === 'single_choice' || question.questionUiTemplate === 'multi_choice'

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

						<div className="mt-6">
							<MdxRenderer
								source={question.promptText}
								className="prose prose-p:my-0 prose-p:text-foreground max-w-none text-base font-medium"
							/>
						</div>

						{isChoiceQuestion && result?.correctAnswer != null ? (
							<ChoiceOptionsReview
								question={question}
								studentAnswer={studentAnswer}
								correctAnswer={result.correctAnswer}
							/>
						) : (
							<div className="tab-sm:grid-cols-2 mt-6 grid gap-3">
								<AnswerBlock label="ответ студента" lines={formatAnswerLines(question, studentAnswer)} />
								{(status === 'wrong' || status === 'partial') && result?.correctAnswer !== undefined ? (
									<AnswerBlock
										label="правильный ответ"
										lines={formatAnswerLines(question, result.correctAnswer)}
										variant="correct"
									/>
								) : null}
							</div>
						)}

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

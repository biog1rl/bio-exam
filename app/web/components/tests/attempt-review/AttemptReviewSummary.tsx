import { Clock3, Eye, RotateCcw } from 'lucide-react'

import type { AttemptReviewData, PublicTestQuestion } from '@/lib/tests/types'

import {
	formatDuration,
	getAttemptTelemetryStats,
	getQuestionStatus,
	scrollToAttemptSection,
	type QuestionResult,
	type QuestionStatus,
} from './attempt-review-utils'

function SummaryColumn({
	label,
	status,
	count,
	questions,
	results,
}: {
	label: string
	status: QuestionStatus
	count: number
	questions: PublicTestQuestion[]
	results: QuestionResult[]
}) {
	return (
		<div className="border-border/70 bg-secondary/55 p-unit rounded-3xl border">
			<p className="font-serif text-3xl leading-none">{count}</p>
			<p className="text-muted-foreground mt-2 text-sm">{label}</p>
			<div className="mt-5 space-y-1">
				{questions.map((question, index) => {
					if (getQuestionStatus(question.id, results) !== status) return null
					const result = results.find((item) => item.questionId === question.id)
					return (
						<button
							key={question.id}
							type="button"
							onClick={() => scrollToAttemptSection(`question-${index}`)}
							className="text-muted-foreground hover:border-primary/40 hover:bg-card/80 focus-visible:border-primary flex w-full items-center justify-between rounded-2xl border border-transparent px-3 py-2 text-left text-sm outline-none transition-colors"
						>
							<span>Вопрос {index + 1}</span>
							<span>
								{result?.earnedPoints ?? 0}/{result?.points ?? 0}
							</span>
						</button>
					)
				})}
			</div>
		</div>
	)
}

export function AttemptReviewSummary({
	attempt,
	questions,
	results,
}: {
	attempt: AttemptReviewData
	questions: PublicTestQuestion[]
	results: QuestionResult[]
}) {
	const counts = questions.reduce(
		(acc, question) => {
			const status = getQuestionStatus(question.id, results)
			if (status === 'correct') acc.correct += 1
			if (status === 'partial') acc.partial += 1
			if (status === 'wrong') acc.wrong += 1
			return acc
		},
		{ correct: 0, partial: 0, wrong: 0 }
	)
	const telemetryStats = getAttemptTelemetryStats(attempt.telemetry, questions)

	return (
		<section id="summary-section" className="scroll-mt-6 space-y-3">
			<div>
				<p className="text-muted-foreground font-mono text-[0.6875rem] uppercase tracking-[0.22em]">итоги</p>
				<h2 className="mt-2 font-serif text-3xl">Структура результата</h2>
			</div>

			<div className="tab-sm:grid-cols-3 grid gap-3">
				<SummaryColumn label="верно" status="correct" count={counts.correct} questions={questions} results={results} />
				<SummaryColumn
					label="частично"
					status="partial"
					count={counts.partial}
					questions={questions}
					results={results}
				/>
				<SummaryColumn label="неверно" status="wrong" count={counts.wrong} questions={questions} results={results} />
			</div>

			{telemetryStats ? (
				<div className="rounded-4xl border-border/80 bg-card/90 p-unit-mob tab-sm:p-unit border">
					<div className="tab-sm:grid-cols-4 grid gap-3">
						<div className="border-border/70 bg-secondary/65 p-unit rounded-3xl border">
							<Clock3 className="text-primary mb-4 size-5" />
							<p className="font-medium">{formatDuration(telemetryStats.totalMs)}</p>
							<p className="text-muted-foreground mt-1 text-sm">общее время</p>
						</div>
						<div className="border-border/70 bg-secondary/65 p-unit rounded-3xl border">
							<Clock3 className="text-primary mb-4 size-5" />
							<p className="font-medium">{formatDuration(telemetryStats.avgMs)}</p>
							<p className="text-muted-foreground mt-1 text-sm">среднее</p>
						</div>
						<div className="border-border/70 bg-secondary/65 p-unit rounded-3xl border">
							<Eye className="text-primary mb-4 size-5" />
							<p className="font-medium">{telemetryStats.focusLossCount}</p>
							<p className="text-muted-foreground mt-1 text-sm">потерь фокуса</p>
						</div>
						<div className="border-border/70 bg-secondary/65 p-unit rounded-3xl border">
							<RotateCcw className="text-primary mb-4 size-5" />
							<p className="font-medium">{telemetryStats.visitCount}</p>
							<p className="text-muted-foreground mt-1 text-sm">посещений</p>
						</div>
					</div>
				</div>
			) : null}
		</section>
	)
}

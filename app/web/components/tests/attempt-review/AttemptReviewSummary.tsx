import { Clock3, Eye, RotateCcw } from 'lucide-react'

import type { AttemptQuestionView, AttemptReviewData, PublicTestQuestion, QuestionStatus } from '@/lib/tests/types'

import {
	formatDuration,
	getAttemptTelemetryStats,
	getQuestionView,
	scrollToAttemptSection,
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
	results: AttemptQuestionView[]
}) {
	return (
		<div className="rounded-3xl border border-border/70 bg-secondary/55 p-unit">
			<p className="font-serif text-3xl leading-none">{count}</p>
			<p className="mt-2 text-sm text-muted-foreground">{label}</p>
			<div className="mt-5 space-y-1">
				{questions.map((question, index) => {
					const result = getQuestionView(question.id, results)
					if (!result || result.status !== status) return null
					return (
						<button
							key={question.id}
							type="button"
							onClick={() => scrollToAttemptSection(`question-${index}`)}
							className="flex w-full items-center justify-between rounded-2xl border border-transparent px-3 py-2 text-left text-sm text-muted-foreground transition-colors outline-none hover:border-primary/40 hover:bg-card/80 focus-visible:border-primary"
						>
							<span>Вопрос {index + 1}</span>
							<span>
								{result.earnedPoints}/{result.points}
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
	results: AttemptQuestionView[]
}) {
	const counts = questions.reduce(
		(acc, question) => {
			const status = getQuestionView(question.id, results)?.status
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
				<p className="font-mono text-[0.6875rem] tracking-[0.22em] text-muted-foreground uppercase">итоги</p>
				<h2 className="mt-2 font-serif text-3xl">Структура результата</h2>
			</div>

			<div className="grid gap-3 tab-sm:grid-cols-3">
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
				<div className="rounded-4xl border border-border/80 bg-card/90 p-unit-mob tab-sm:p-unit">
					<div className="grid gap-3 tab-sm:grid-cols-4">
						<div className="rounded-3xl border border-border/70 bg-secondary/65 p-unit">
							<Clock3 className="mb-4 size-5 text-primary" />
							<p className="font-medium">{formatDuration(telemetryStats.totalMs)}</p>
							<p className="mt-1 text-sm text-muted-foreground">общее время</p>
						</div>
						<div className="rounded-3xl border border-border/70 bg-secondary/65 p-unit">
							<Clock3 className="mb-4 size-5 text-primary" />
							<p className="font-medium">{formatDuration(telemetryStats.avgMs)}</p>
							<p className="mt-1 text-sm text-muted-foreground">среднее</p>
						</div>
						<div className="rounded-3xl border border-border/70 bg-secondary/65 p-unit">
							<Eye className="mb-4 size-5 text-primary" />
							<p className="font-medium">{telemetryStats.focusLossCount}</p>
							<p className="mt-1 text-sm text-muted-foreground">потерь фокуса</p>
						</div>
						<div className="rounded-3xl border border-border/70 bg-secondary/65 p-unit">
							<RotateCcw className="mb-4 size-5 text-primary" />
							<p className="font-medium">{telemetryStats.visitCount}</p>
							<p className="mt-1 text-sm text-muted-foreground">посещений</p>
						</div>
					</div>
				</div>
			) : null}
		</section>
	)
}

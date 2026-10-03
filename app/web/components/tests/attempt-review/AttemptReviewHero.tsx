import { CheckCircle2, Clock3, FileText, Trophy, XCircle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import type { AttemptReviewData, PublicTestQuestion } from '@/lib/tests/types'

import {
	formatAttemptDate,
	formatDuration,
	getAttemptTelemetryStats,
	type QuestionResult,
} from './attempt-review-utils'

function MetricTile({ label, value, icon: Icon }: { label: string; value: string | number; icon: LucideIcon }) {
	return (
		<div className="rounded-3xl border border-border/70 bg-secondary/65 p-unit">
			<Icon className="mb-5 size-5 text-primary" />
			<p className="font-serif text-3xl leading-none">{value}</p>
			<p className="mt-2 text-sm text-muted-foreground">{label}</p>
		</div>
	)
}

export function AttemptReviewHero({
	attempt,
	questions,
	results,
}: {
	attempt: AttemptReviewData
	questions: PublicTestQuestion[]
	results: QuestionResult[]
}) {
	const telemetryStats = getAttemptTelemetryStats(attempt.telemetry, questions)
	const correctCount = questions.filter((question) => {
		const result = results.find((item) => item.questionId === question.id)
		return result && result.points > 0 && result.isCorrect
	}).length
	const ResultIcon = attempt.passed ? CheckCircle2 : XCircle

	return (
		<section className="rounded-4xl border border-border/80 bg-card/90 p-unit-mob tab-sm:p-unit">
			<div className="grid gap-8 tab:grid-cols-[1fr_18.125rem]">
				<div>
					<p className="font-mono text-[0.6875rem] tracking-[0.22em] text-muted-foreground uppercase">попытка</p>
					<h1 className="mt-2 max-w-3xl font-serif text-4xl leading-none text-foreground tab-sm:text-5xl">
						Разбор результата
					</h1>
					<p className="mt-5 text-sm text-muted-foreground">Сдано: {formatAttemptDate(attempt.submittedAt)}</p>
				</div>

				<div className="rounded-3xl border border-border/70 bg-secondary/55 p-unit">
					<ResultIcon className={attempt.passed ? 'size-7 text-green-600' : 'size-7 text-red-600'} />
					<p className="mt-6 font-serif text-4xl leading-none">{Math.round(attempt.scorePercentage)}%</p>
					<p className="mt-2 text-sm text-muted-foreground">{attempt.passed ? 'порог пройден' : 'порог не пройден'}</p>
				</div>
			</div>

			<div className="mt-8 grid gap-3 tab-sm:grid-cols-4">
				<MetricTile label="баллов" value={`${attempt.earnedPoints}/${attempt.totalPoints}`} icon={Trophy} />
				<MetricTile label="вопросов" value={questions.length} icon={FileText} />
				<MetricTile label="верно" value={correctCount} icon={CheckCircle2} />
				<MetricTile
					label="время"
					value={telemetryStats ? formatDuration(telemetryStats.totalMs) : 'нет'}
					icon={Clock3}
				/>
			</div>
		</section>
	)
}

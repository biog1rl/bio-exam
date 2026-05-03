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
		<div className="border-border/70 bg-secondary/65 p-unit rounded-3xl border">
			<Icon className="text-primary mb-5 size-5" />
			<p className="font-serif text-3xl leading-none">{value}</p>
			<p className="text-muted-foreground mt-2 text-sm">{label}</p>
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
		return result && result.points > 0 && result.earnedPoints === result.points
	}).length
	const ResultIcon = attempt.passed ? CheckCircle2 : XCircle

	return (
		<section className="rounded-4xl border-border/80 bg-card/90 p-unit-mob tab-sm:p-unit border">
			<div className="tab:grid-cols-[1fr_290px] grid gap-8">
				<div>
					<p className="text-muted-foreground font-mono text-[11px] uppercase tracking-[0.22em]">попытка</p>
					<h1 className="text-foreground tab-sm:text-5xl mt-2 max-w-3xl font-serif text-4xl leading-none">
						Разбор результата
					</h1>
					<p className="text-muted-foreground mt-5 text-sm">Сдано: {formatAttemptDate(attempt.submittedAt)}</p>
				</div>

				<div className="border-border/70 bg-secondary/55 p-unit rounded-3xl border">
					<ResultIcon className={attempt.passed ? 'size-7 text-green-600' : 'size-7 text-red-600'} />
					<p className="mt-6 font-serif text-4xl leading-none">{Math.round(attempt.scorePercentage)}%</p>
					<p className="text-muted-foreground mt-2 text-sm">{attempt.passed ? 'порог пройден' : 'порог не пройден'}</p>
				</div>
			</div>

			<div className="tab-sm:grid-cols-4 mt-8 grid gap-3">
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

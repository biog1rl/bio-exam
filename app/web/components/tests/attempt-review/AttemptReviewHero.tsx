import { CheckCircle2, Clock3, FileText, Timer, Trophy, XCircle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { TeacherCheckedMark } from '@/components/tests/attempt-result/TeacherCheckedMark'
import { attemptResultView } from '@/lib/tests/attempt-result-view'
import type { AttemptQuestionView, AttemptReviewData, PublicTestQuestion } from '@/lib/tests/types'

import { formatAttemptDate, formatDuration, getAttemptTelemetryStats, getQuestionView } from './attempt-review-utils'

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
	results: AttemptQuestionView[]
}) {
	const telemetryStats = getAttemptTelemetryStats(attempt.telemetry, questions)
	const correctCount = questions.filter(
		(question) => getQuestionView(question.id, results)?.status === 'correct'
	).length
	const view = attemptResultView(attempt)

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
					{view.kind === 'pending' ? (
						<>
							<Clock3 className="size-7 text-secondary-foreground" aria-hidden="true" />
							<p className="mt-6 font-serif text-4xl leading-none break-words">На проверке</p>
							{view.auto ? (
								<p className="mt-2 text-sm text-muted-foreground">
									авто {view.auto.earned} из {view.auto.total}
								</p>
							) : null}
							<p className="mt-1 text-xs text-muted-foreground">Процент и итог появятся после проверки.</p>
						</>
					) : (
						<>
							{view.passed ? (
								<CheckCircle2 className="size-7 text-green-600" />
							) : (
								<XCircle className="size-7 text-red-600" />
							)}
							<p className="mt-6 font-serif text-4xl leading-none">{Math.round(view.percent)}%</p>
							<p className="mt-2 text-sm text-muted-foreground">{view.passed ? 'порог пройден' : 'порог не пройден'}</p>
							{view.teacherChecked ? (
								<div className="mt-4">
									<TeacherCheckedMark />
								</div>
							) : null}
						</>
					)}
				</div>
			</div>

			<div className="mt-8 grid gap-3 tab-sm:grid-cols-4">
				{view.kind === 'pending' ? (
					<MetricTile
						label="баллов автопроверки"
						value={view.auto ? `${view.auto.earned}/${view.auto.total}` : '—'}
						icon={Trophy}
					/>
				) : (
					<MetricTile label="баллов" value={`${view.points.earned}/${view.points.total}`} icon={Trophy} />
				)}
				<MetricTile label="вопросов" value={questions.length} icon={FileText} />
				<MetricTile label="верно" value={correctCount} icon={CheckCircle2} />
				<MetricTile
					label="время"
					value={telemetryStats ? formatDuration(telemetryStats.totalMs) : 'нет'}
					icon={Timer}
				/>
			</div>
		</section>
	)
}

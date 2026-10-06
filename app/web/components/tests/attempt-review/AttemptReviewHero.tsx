import { CheckCircle2, XCircle } from 'lucide-react'

import { PageHeader } from '@/components/page/PageHeader'
import { ReviewStatusChip } from '@/components/tests/attempt-result/ReviewStatusChip'
import { TeacherCheckedMark } from '@/components/tests/attempt-result/TeacherCheckedMark'
import { attemptResultView } from '@/lib/tests/attempt-result-view'
import { formatPercent } from '@/lib/tests/format'
import type { AttemptQuestionView, AttemptReviewData, PublicTestQuestion } from '@/lib/tests/types'
import { formatDateTime } from '@/lib/utils/dates'

import { formatDuration, getAttemptTelemetryStats, getQuestionView } from './attempt-review-utils'

const CHIP_CLASS = 'flex items-center gap-1.5 rounded-full border border-border/80 bg-card px-3 py-1 text-sm'

function StatChip({ label, value }: { label: string; value: string | number }) {
	return (
		<li className={CHIP_CLASS}>
			<span className="text-muted-foreground">{label}</span>
			<span className="font-medium text-foreground tabular-nums">{value}</span>
		</li>
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
		<section className="space-y-3">
			<PageHeader title="Разбор результата" meta={`Сдано: ${formatDateTime(attempt.submittedAt)}`} />
			<ul aria-label="Итог попытки" className="flex flex-wrap items-center gap-2">
				{view.kind === 'pending' ? (
					<>
						<li>
							<ReviewStatusChip className="h-8 px-3 text-sm" />
						</li>
						<StatChip label="баллов автопроверки" value={view.auto ? `${view.auto.earned}/${view.auto.total}` : '—'} />
					</>
				) : (
					<>
						<li className={CHIP_CLASS}>
							{view.passed ? (
								<CheckCircle2 className="size-4 text-green-600" aria-hidden="true" />
							) : (
								<XCircle className="size-4 text-red-600" aria-hidden="true" />
							)}
							<span className="font-medium text-foreground tabular-nums">{formatPercent(view.percent)}</span>
							<span className="text-muted-foreground">{view.passed ? 'порог пройден' : 'порог не пройден'}</span>
						</li>
						{view.teacherChecked ? (
							<li>
								<TeacherCheckedMark />
							</li>
						) : null}
						<StatChip label="баллов" value={`${view.points.earned}/${view.points.total}`} />
					</>
				)}
				<StatChip label="вопросов" value={questions.length} />
				<StatChip label="верно" value={correctCount} />
				<StatChip label="время" value={telemetryStats ? formatDuration(telemetryStats.totalMs) : 'нет'} />
			</ul>
			{view.kind === 'pending' ? (
				<p className="text-sm text-muted-foreground">
					{view.auto ? `авто ${view.auto.earned} из ${view.auto.total} · ` : ''}Процент и итог появятся после проверки.
				</p>
			) : null}
		</section>
	)
}

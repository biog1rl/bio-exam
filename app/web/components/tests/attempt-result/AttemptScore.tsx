import { CircleCheck, CircleX } from 'lucide-react'

import type { AttemptResultView } from '@/lib/tests/attempt-result-view'
import { formatPercent, formatPoints } from '@/lib/tests/format'
import { cn } from '@/lib/utils/cn'

import { AttemptReviewLine, type AttemptReviewAudience } from './AttemptReviewLine'
import { TeacherCheckedMark } from './TeacherCheckedMark'

export function AttemptScore({
	view,
	audience,
	showPoints = true,
	className,
}: {
	view: AttemptResultView
	audience: AttemptReviewAudience
	showPoints?: boolean
	className?: string
}) {
	if (view.kind === 'pending') {
		return (
			<span className={cn('inline-flex justify-end', className)}>
				<AttemptReviewLine view={view} audience={audience} />
			</span>
		)
	}
	const Icon = view.passed ? CircleCheck : CircleX
	return (
		<span className={cn('inline-flex flex-col items-end gap-1', className)}>
			<span className="inline-flex items-center gap-1.5 font-medium whitespace-nowrap tabular-nums">
				<Icon className={cn('size-4', view.passed ? 'text-primary' : 'text-muted-foreground')} aria-hidden="true" />
				{formatPercent(view.percent)}
				<span className="sr-only">{view.passed ? 'Пройден' : 'Не пройден'}</span>
			</span>
			{showPoints ? (
				<span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
					{formatPoints(view.points)}
				</span>
			) : null}
			{view.teacherChecked ? <TeacherCheckedMark /> : null}
		</span>
	)
}

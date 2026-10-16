import { StatusBadge } from '@/components/table/StatusBadge'
import { attemptPointsText, attemptVerdictText, type AttemptResultView } from '@/lib/tests/attempt-result-view'
import { formatPercent } from '@/lib/tests/format'
import { cn } from '@/lib/utils/cn'

const DASH = <span className="text-muted-foreground">—</span>

export function AttemptScore({ view, className }: { view: AttemptResultView; className?: string }) {
	return (
		<span className={cn('flex w-full justify-end font-medium whitespace-nowrap tabular-nums', className)}>
			{view.kind === 'final' ? formatPercent(view.percent) : DASH}
		</span>
	)
}

export function AttemptPoints({ view, className }: { view: AttemptResultView; className?: string }) {
	const text = attemptPointsText(view)
	return (
		<span
			className={cn(
				'flex w-full justify-end whitespace-nowrap tabular-nums',
				view.kind === 'pending' && 'text-muted-foreground',
				className
			)}
		>
			{text ?? DASH}
		</span>
	)
}

export function AttemptVerdict({ view }: { view: AttemptResultView }) {
	const text = attemptVerdictText(view)
	if (view.kind === 'pending' || text === null) return DASH
	return <StatusBadge on={view.passed}>{text}</StatusBadge>
}

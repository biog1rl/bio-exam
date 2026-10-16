import { BadgeCheck, Clock3, Minus, type LucideIcon } from 'lucide-react'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { reviewMarkOf, type AttemptResultView, type ReviewMarkKind } from '@/lib/tests/attempt-result-view'
import { cn } from '@/lib/utils/cn'

const MARKS: Record<ReviewMarkKind, { Icon: LucideIcon; tone: string; text: string }> = {
	pending: { Icon: Clock3, tone: 'text-warning', text: 'На проверке, баллы предварительные' },
	graded: { Icon: BadgeCheck, tone: 'text-success', text: 'Проверено учителем' },
	none: { Icon: Minus, tone: 'text-muted-foreground', text: 'Проверка не нужна' },
}

export function AttemptReviewMark({ view }: { view: AttemptResultView }) {
	const { Icon, tone, text } = MARKS[reviewMarkOf(view)]
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span
					tabIndex={0}
					className="inline-flex size-6 items-center justify-center rounded-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
				>
					<Icon className={cn('size-4', tone)} aria-hidden="true" />
					<span className="sr-only">{text}</span>
				</span>
			</TooltipTrigger>
			<TooltipContent>{text}</TooltipContent>
		</Tooltip>
	)
}

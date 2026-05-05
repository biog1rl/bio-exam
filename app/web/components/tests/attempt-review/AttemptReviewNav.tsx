import type { AttemptReviewData, PublicTestQuestion } from '@/lib/tests/types'
import { cn } from '@/lib/utils/cn'

import {
	formatDuration,
	getQuestionStatus,
	getStatusDotClass,
	NAV_FILTERS,
	scrollToAttemptSection,
	type NavFilter,
	type QuestionResult,
} from './attempt-review-utils'

export function AttemptReviewNav({
	attempt,
	questions,
	results,
	navFilter,
	onNavFilterChange,
}: {
	attempt: AttemptReviewData
	questions: PublicTestQuestion[]
	results: QuestionResult[]
	navFilter: NavFilter
	onNavFilterChange: (filter: NavFilter) => void
}) {
	return (
		<aside className="border-border/80 bg-card/90 rounded-4xl p-unit-mob tab:sticky tab:top-4 tab:h-fit tab-sm:p-unit border">
			<p className="text-muted-foreground font-mono text-[0.6875rem] uppercase tracking-[0.22em]">навигация</p>

			<div className="mt-5 flex flex-wrap gap-2">
				{NAV_FILTERS.map((filter) => (
					<button
						key={filter.value}
						type="button"
						onClick={() => onNavFilterChange(filter.value)}
						className={cn(
							'focus-visible:border-primary inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm outline-none transition-colors',
							navFilter === filter.value
								? 'border-primary/45 bg-secondary text-foreground'
								: 'border-border/70 bg-card hover:border-primary/35 hover:bg-secondary/60'
						)}
					>
						<span className={cn('size-2 rounded-full', filter.dotClass)} />
						{filter.label}
					</button>
				))}
			</div>

			<div className="mt-6 max-h-[48dvh] space-y-1 overflow-auto pr-1">
				{questions.map((question, index) => {
					const status = getQuestionStatus(question.id, results)
					if (navFilter !== 'all' && status !== navFilter) return null
					const timeMs = attempt.telemetry?.[question.id]?.timeSpentMs ?? 0

					return (
						<button
							key={question.id}
							type="button"
							onClick={() => scrollToAttemptSection(`question-${index}`)}
							className="focus-visible:border-primary hover:border-primary/35 hover:bg-secondary/60 flex w-full items-center justify-between rounded-2xl border border-transparent px-3 py-2 text-sm outline-none transition-colors"
						>
							<span className="flex items-center gap-2">
								<span className={cn('size-2 rounded-full', getStatusDotClass(status))} />
								{index + 1}
							</span>
							<span className="text-muted-foreground">{formatDuration(timeMs)}</span>
						</button>
					)
				})}
			</div>

			<button
				type="button"
				onClick={() => scrollToAttemptSection('summary-section')}
				className="focus-visible:border-primary hover:border-primary/35 hover:bg-secondary/60 border-border/70 bg-secondary/45 mt-5 w-full rounded-2xl border px-3 py-2 text-left text-sm outline-none transition-colors"
			>
				Итоги
			</button>
		</aside>
	)
}

import type { AttemptResultView } from '@/lib/tests/attempt-result-view'

import { ReviewStatusChip } from './ReviewStatusChip'

export type AttemptReviewAudience = 'student' | 'staff'

export function AttemptReviewLine({
	view,
	audience,
}: {
	view: Extract<AttemptResultView, { kind: 'pending' }>
	audience: AttemptReviewAudience
}) {
	const { auto } = view
	return (
		<span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
			<ReviewStatusChip />
			{auto ? (
				audience === 'student' ? (
					<>
						<span aria-hidden="true">·</span>
						<span className="text-xs text-muted-foreground">
							предварительно {auto.earned} из {auto.total}
						</span>
					</>
				) : (
					<span className="text-xs text-muted-foreground">
						авто {auto.earned} из {auto.total}
					</span>
				)
			) : null}
		</span>
	)
}

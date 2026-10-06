import { useId, type ReactNode, type Ref } from 'react'

import { cn } from '@/lib/utils/cn'

export function Panel({
	title,
	meta,
	actions,
	titleRef,
	className,
	children,
}: {
	title: ReactNode
	meta?: ReactNode
	actions?: ReactNode
	titleRef?: Ref<HTMLHeadingElement>
	className?: string
	children: ReactNode
}) {
	const titleId = useId()
	return (
		<section
			aria-labelledby={titleId}
			className={cn(
				'min-w-0 space-y-4 rounded-3xl border border-border/80 bg-card p-4 shadow-sm tab-sm:p-5',
				className
			)}
		>
			<div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
				<div className="min-w-0">
					<h2
						id={titleId}
						ref={titleRef}
						tabIndex={titleRef ? -1 : undefined}
						className="text-lg font-semibold text-foreground outline-none"
					>
						{title}
					</h2>
					{meta ? <p className="text-sm text-muted-foreground">{meta}</p> : null}
				</div>
				{actions}
			</div>
			{children}
		</section>
	)
}

import type { ReactNode } from 'react'

import { cn } from '@/lib/utils/cn'

interface EmptyStateProps {
	title?: ReactNode
	description?: ReactNode
	action?: ReactNode
	className?: string
}

export function EmptyState({ title, description, action, className }: EmptyStateProps) {
	return (
		<div
			className={cn(
				'flex flex-col items-center gap-4 rounded-4xl border border-dashed border-border bg-card/70 px-6 py-14 text-center',
				className
			)}
		>
			{title ? <p className="font-medium text-foreground">{title}</p> : null}
			{description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
			{action}
		</div>
	)
}

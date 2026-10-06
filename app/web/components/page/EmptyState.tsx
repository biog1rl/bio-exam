import type { ReactNode } from 'react'

import { cn } from '@/lib/utils/cn'

interface EmptyStateProps {
	title?: ReactNode
	description?: ReactNode
	action?: ReactNode
	size?: 'default' | 'sm'
	className?: string
}

export function EmptyState({ title, description, action, size = 'default', className }: EmptyStateProps) {
	return (
		<div
			className={cn(
				'flex flex-col items-center border border-dashed border-border text-center',
				size === 'sm'
					? 'gap-3 rounded-2xl px-4 py-6 text-sm text-muted-foreground'
					: 'gap-4 rounded-4xl bg-card/70 px-6 py-14',
				className
			)}
		>
			{title ? <p className="font-medium text-foreground">{title}</p> : null}
			{description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
			{action}
		</div>
	)
}

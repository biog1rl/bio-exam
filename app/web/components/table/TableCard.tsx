import type { ReactNode } from 'react'

import { cn } from '@/lib/utils/cn'

export function TableCard({ children, className }: { children: ReactNode; className?: string }) {
	return (
		<div className={cn('overflow-hidden rounded-3xl border border-border/80 bg-card shadow-sm', className)}>
			{children}
		</div>
	)
}

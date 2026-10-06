import type { ReactNode } from 'react'

import { Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils/cn'

export function LoadMoreButton({
	onClick,
	loading = false,
	disabled = false,
	summary,
	fullWidth = false,
	className,
}: {
	onClick: () => void
	loading?: boolean
	disabled?: boolean
	summary?: ReactNode
	fullWidth?: boolean
	className?: string
}) {
	return (
		<div className={cn('flex flex-wrap items-center justify-center gap-3 pt-2', className)}>
			<Button
				type="button"
				variant="outline"
				className={cn('rounded-full bg-card', fullWidth && 'w-full')}
				onClick={onClick}
				disabled={disabled}
				aria-busy={loading || undefined}
				aria-disabled={loading || undefined}
			>
				{loading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
				Показать ещё
			</Button>
			{summary ? (
				<p className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
					{summary}
				</p>
			) : null}
		</div>
	)
}

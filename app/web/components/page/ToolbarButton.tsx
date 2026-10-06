import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils/cn'

type ToolbarButtonProps = React.ComponentPropsWithoutRef<typeof Button> & {
	label: string
	tone?: 'primary' | 'outline'
	dot?: boolean
}

export const ToolbarButton = React.forwardRef<HTMLButtonElement, ToolbarButtonProps>(
	({ label, tone = 'outline', dot = false, className, children, asChild, ...props }, ref) => (
		<Button
			ref={ref}
			size="icon"
			variant={tone === 'primary' ? 'default' : 'outline'}
			aria-label={label}
			asChild={asChild}
			className={cn('relative size-10 shrink-0 rounded-full', tone === 'outline' && 'bg-card', className)}
			{...props}
		>
			{asChild ? (
				children
			) : (
				<>
					{children}
					{dot ? (
						<span
							className="absolute top-1.5 right-1.5 size-2 rounded-full bg-primary ring-2 ring-card"
							aria-hidden="true"
						/>
					) : null}
				</>
			)}
		</Button>
	)
)
ToolbarButton.displayName = 'ToolbarButton'

export function ToolbarTooltip({ label, children }: { label: string; children: React.ReactElement }) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>{children}</TooltipTrigger>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	)
}

import type { ReactNode, Ref } from 'react'

import { cn } from '@/lib/utils/cn'

interface PageHeaderProps {
	title: ReactNode
	titleRef?: Ref<HTMLHeadingElement>
	meta?: ReactNode
	children?: ReactNode
	className?: string
}

export function PageHeader({ title, titleRef, meta, children, className }: PageHeaderProps) {
	return (
		<div
			className={cn(
				'flex flex-col gap-3 tab-sm:flex-row tab-sm:items-center tab-sm:justify-between tab-sm:gap-4',
				className
			)}
		>
			<div className="min-w-0">
				<h1
					ref={titleRef}
					tabIndex={titleRef ? -1 : undefined}
					className="min-w-0 font-serif text-2xl leading-tight break-words text-foreground outline-none tab-sm:text-3xl"
				>
					{title}
				</h1>
				{meta ? <div className="mt-1 text-sm text-muted-foreground">{meta}</div> : null}
			</div>
			{children ? <div className="flex min-w-0 flex-wrap items-center gap-2 tab-sm:flex-nowrap">{children}</div> : null}
		</div>
	)
}

import type { ReactNode } from 'react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils/cn'

interface AdminTestsSectionCardProps {
	title: ReactNode
	children: ReactNode
	actions?: ReactNode
	className?: string
	contentClassName?: string
	headerClassName?: string
}

export function AdminTestsSectionCard({
	title,
	children,
	actions,
	className,
	contentClassName,
	headerClassName,
}: AdminTestsSectionCardProps) {
	return (
		<Card className={cn('rounded-4xl border-border/80 bg-card/90 shadow-sm', className)}>
			<CardHeader className={cn(actions ? 'flex flex-row items-center justify-between' : undefined, headerClassName)}>
				<CardTitle className="font-serif text-2xl">{title}</CardTitle>
				{actions}
			</CardHeader>
			<CardContent className={contentClassName}>{children}</CardContent>
		</Card>
	)
}

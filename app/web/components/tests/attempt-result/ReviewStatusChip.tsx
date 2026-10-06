import { Clock3 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils/cn'

export function ReviewStatusChip({ className }: { className?: string }) {
	return (
		<Badge
			variant="secondary"
			className={cn(
				'gap-1 rounded-full border-dashed border-secondary-foreground/40 px-2 py-1 font-medium whitespace-nowrap hover:bg-secondary',
				className
			)}
		>
			<Clock3 className="size-3.5" aria-hidden="true" />
			На проверке
		</Badge>
	)
}

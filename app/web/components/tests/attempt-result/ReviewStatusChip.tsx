import { Clock3 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'

export function ReviewStatusChip() {
	return (
		<Badge
			variant="secondary"
			className="gap-1 rounded-full border-dashed border-secondary-foreground/40 px-2 py-1 font-medium whitespace-nowrap hover:bg-secondary"
		>
			<Clock3 className="size-3.5" aria-hidden="true" />
			На проверке
		</Badge>
	)
}

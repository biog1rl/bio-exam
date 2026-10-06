import type { ReactNode } from 'react'

import { Badge } from '@/components/ui/badge'

export function StatusBadge({ on, children }: { on: boolean; children: ReactNode }) {
	return (
		<Badge variant={on ? 'default' : 'secondary'} className="rounded-full">
			{children}
		</Badge>
	)
}

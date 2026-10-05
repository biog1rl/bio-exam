import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'

import { TableHead } from '@/components/ui/table'
import { cn } from '@/lib/utils/cn'
import type { SortDirection } from '@/lib/utils/table-sort'

interface SortableHeadProps {
	label: string
	direction: SortDirection | null
	onSort: () => void
	align?: 'left' | 'right'
	className?: string
}

export function SortableHead({ label, direction, onSort, align = 'left', className }: SortableHeadProps) {
	const Icon = direction === null ? ArrowUpDown : direction === 'asc' ? ArrowUp : ArrowDown
	return (
		<TableHead
			aria-sort={direction === null ? undefined : direction === 'asc' ? 'ascending' : 'descending'}
			className={cn(align === 'right' && 'text-right', className)}
		>
			<button
				type="button"
				onClick={onSort}
				className={cn(
					'-mx-2 inline-flex h-8 items-center gap-1.5 rounded-lg px-2 transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
					align === 'right' && 'flex-row-reverse'
				)}
			>
				{label}
				<Icon
					className={cn('size-3.5', direction === null ? 'text-muted-foreground' : 'text-foreground')}
					aria-hidden="true"
				/>
			</button>
		</TableHead>
	)
}

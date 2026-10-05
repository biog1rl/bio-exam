import { Check, ListFilter } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils/cn'
import { toggleFilterValue } from '@/lib/utils/column-filter'

export type ColumnFilterOption<V extends string> = { value: V; label: string; count?: number }

interface ColumnFilterMenuProps<V extends string> {
	label: string
	options: readonly ColumnFilterOption<V>[]
	selected: readonly V[]
	onChange: (selected: V[]) => void
	className?: string
}

export function ColumnFilterMenu<V extends string>({
	label,
	options,
	selected,
	onChange,
	className,
}: ColumnFilterMenuProps<V>) {
	const active = selected.length > 0
	const order = options.map((option) => option.value)
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					size="icon"
					variant="ghost"
					aria-label={label}
					className={cn(
						'relative size-8 shrink-0 rounded-full text-muted-foreground hover:text-foreground',
						active && 'bg-secondary text-foreground',
						className
					)}
				>
					<ListFilter className="size-4" aria-hidden="true" />
					{active ? (
						<span className="absolute top-1 right-1 size-2 rounded-full bg-primary" aria-hidden="true" />
					) : null}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="min-w-48">
				{options.map((option) => {
					const checked = selected.includes(option.value)
					return (
						<DropdownMenuCheckboxItem
							key={option.value}
							checked={checked}
							onCheckedChange={(next) => onChange(toggleFilterValue(selected, option.value, next === true, order))}
							onSelect={(event) => event.preventDefault()}
							className="gap-2 pl-2 [&>span:first-child]:hidden"
						>
							<span
								aria-hidden="true"
								className={cn(
									'flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-primary transition-colors',
									checked ? 'bg-primary text-primary-foreground' : 'bg-card'
								)}
							>
								{checked ? <Check className="size-3" /> : null}
							</span>
							<span className="flex-1">{option.label}</span>
							{option.count === undefined ? null : (
								<span className="pl-4 text-xs text-muted-foreground tabular-nums">{option.count}</span>
							)}
						</DropdownMenuCheckboxItem>
					)
				})}
				{active ? (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuItem onSelect={() => onChange([])}>Сбросить</DropdownMenuItem>
					</>
				) : null}
			</DropdownMenuContent>
		</DropdownMenu>
	)
}

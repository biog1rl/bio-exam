import { useState } from 'react'

import { Check, ListFilter } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils/cn'
import { toggleFilterValue } from '@/lib/utils/column-filter'

export type ColumnFilterOption<V extends string> = { value: V; label: string; count?: number; hint?: string }

export type ColumnFilterGroup<V extends string> = {
	label?: string
	options: readonly ColumnFilterOption<V>[]
	selected: readonly V[]
	onChange: (selected: V[]) => void
}

type SingleGroupProps<V extends string> = {
	options: readonly ColumnFilterOption<V>[]
	selected: readonly V[]
	onChange: (selected: V[]) => void
	groups?: never
	onReset?: () => void
}

type ManyGroupsProps<V extends string> = {
	groups: readonly ColumnFilterGroup<V>[]
	onReset: () => void
	options?: never
	selected?: never
	onChange?: never
}

type ColumnFilterMenuProps<V extends string> = (SingleGroupProps<V> | ManyGroupsProps<V>) & {
	label: string
	searchPlaceholder?: string
	align?: 'start' | 'end'
	className?: string
}

function CheckMark({ checked }: { checked: boolean }) {
	return (
		<span
			aria-hidden="true"
			className={cn(
				'flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-primary transition-colors',
				checked ? 'bg-primary text-primary-foreground' : 'bg-card'
			)}
		>
			{checked ? <Check className="size-3" /> : null}
		</span>
	)
}

function OptionText<V extends string>({ option }: { option: ColumnFilterOption<V> }) {
	return (
		<>
			<span className="min-w-0 flex-1 truncate">{option.label}</span>
			{option.hint ? <span className="text-xs text-muted-foreground">{option.hint}</span> : null}
			{option.count === undefined ? null : (
				<span className="pl-4 text-xs text-muted-foreground tabular-nums">{option.count}</span>
			)}
		</>
	)
}

function toggle<V extends string>(group: ColumnFilterGroup<V>, value: V, checked: boolean) {
	group.onChange(
		toggleFilterValue(
			group.selected,
			value,
			checked,
			group.options.map((option) => option.value)
		)
	)
}

export function ColumnFilterMenu<V extends string>(props: ColumnFilterMenuProps<V>) {
	const { label, searchPlaceholder, onReset, align = 'start', className } = props
	const [open, setOpen] = useState(false)
	const groups: readonly ColumnFilterGroup<V>[] = props.groups ?? [
		{ options: props.options, selected: props.selected, onChange: props.onChange },
	]
	const active = groups.some((group) => group.selected.length > 0)
	const reset = onReset ?? (() => props.onChange?.([]))

	const trigger = (
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
			{active ? <span className="absolute top-1 right-1 size-2 rounded-full bg-primary" aria-hidden="true" /> : null}
		</Button>
	)

	if (searchPlaceholder) {
		return (
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>{trigger}</PopoverTrigger>
				<PopoverContent align={align} className="w-72 max-w-[calc(100vw-2rem)] p-0">
					<Command>
						<CommandInput placeholder={searchPlaceholder} aria-label={searchPlaceholder} />
						<CommandList>
							<CommandEmpty>Ничего не нашли</CommandEmpty>
							{groups.map((group, index) => (
								<CommandGroup key={group.label ?? index} heading={group.label}>
									{group.options.map((option) => {
										const checked = group.selected.includes(option.value)
										return (
											<CommandItem
												key={option.value}
												value={`${option.label} ${option.value}`}
												onSelect={() => toggle(group, option.value, !checked)}
											>
												<CheckMark checked={checked} />
												<OptionText option={option} />
												{checked ? <span className="sr-only">выбрано</span> : null}
											</CommandItem>
										)
									})}
								</CommandGroup>
							))}
						</CommandList>
						{active ? (
							<div className="border-t p-1">
								<button
									type="button"
									onClick={reset}
									className="w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
								>
									Сбросить
								</button>
							</div>
						) : null}
					</Command>
				</PopoverContent>
			</Popover>
		)
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
			<DropdownMenuContent align={align} className="min-w-48">
				{groups.map((group, index) => (
					<div key={group.label ?? index}>
						{index > 0 ? <DropdownMenuSeparator /> : null}
						{group.label ? (
							<DropdownMenuLabel className="text-xs font-medium text-muted-foreground">{group.label}</DropdownMenuLabel>
						) : null}
						{group.options.map((option) => {
							const checked = group.selected.includes(option.value)
							return (
								<DropdownMenuCheckboxItem
									key={option.value}
									checked={checked}
									onCheckedChange={(next) => toggle(group, option.value, next === true)}
									onSelect={(event) => event.preventDefault()}
									className="gap-2 pl-2 [&>span:first-child]:hidden"
								>
									<CheckMark checked={checked} />
									<OptionText option={option} />
								</DropdownMenuCheckboxItem>
							)
						})}
					</div>
				))}
				{active ? (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuItem onSelect={reset}>Сбросить</DropdownMenuItem>
					</>
				) : null}
			</DropdownMenuContent>
		</DropdownMenu>
	)
}

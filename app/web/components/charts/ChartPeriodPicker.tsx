'use client'

import { useState, type ReactNode } from 'react'
import type { DateRange } from 'react-day-picker'

import { ru } from 'date-fns/locale'
import { CalendarRange } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { PERIOD_PRESETS, type PeriodValue } from '@/lib/progress/attempt-chart'
import { cn } from '@/lib/utils/cn'
import { formatPeriod } from '@/lib/utils/dates'

export function ChartPeriodPicker({
	period,
	from,
	to,
	onPreset,
	onRange,
	inactive = false,
	align = 'end',
	children,
}: {
	period: PeriodValue
	from: Date | null
	to: Date | null
	onPreset: (value: PeriodValue) => void
	onRange: (from: Date, to: Date) => void
	inactive?: boolean
	align?: 'start' | 'end'
	children?: ReactNode
}) {
	const [open, setOpen] = useState(false)
	const [selection, setSelection] = useState<DateRange>({ from: undefined, to: undefined })
	const customActive = !inactive && period === 'custom'

	const select = (selected: DateRange | undefined) => {
		if (!selected) return
		setSelection(selected)
		if (selected.from && selected.to && selected.from.getTime() !== selected.to.getTime()) {
			onRange(selected.from, selected.to)
			setOpen(false)
		}
	}

	return (
		<div className="flex flex-wrap items-center gap-2">
			<ToggleGroup
				type="single"
				value={!inactive && period !== 'custom' ? period : ''}
				onValueChange={(value) => {
					if (value) onPreset(value as PeriodValue)
				}}
				aria-label="Период графика"
				className="flex-wrap justify-start gap-1 rounded-full border border-border/80 bg-card p-1"
			>
				{PERIOD_PRESETS.map((preset) => (
					<ToggleGroupItem
						key={preset.value}
						value={preset.value}
						className="h-8 rounded-full px-3 text-sm data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
					>
						{preset.label}
					</ToggleGroupItem>
				))}
			</ToggleGroup>
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<Button
						variant={customActive ? 'default' : 'outline'}
						className={cn('h-10 rounded-full', !customActive && 'bg-card')}
					>
						<CalendarRange className="size-4" aria-hidden="true" />
						{customActive && from && to ? formatPeriod(from, to) : 'Свой период'}
					</Button>
				</PopoverTrigger>
				<PopoverContent className="w-auto p-0" align={align}>
					<Calendar mode="range" selected={selection} onSelect={select} locale={ru} numberOfMonths={2} />
				</PopoverContent>
			</Popover>
			{children}
		</div>
	)
}

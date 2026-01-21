'use client'

import * as React from 'react'

import { addDays, format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { Calendar as CalendarIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils/cn'

interface DatePickerProps {
	date?: Date
	onSelect?: (date: Date | undefined) => void
	placeholder?: string
	disabled?: boolean
	showWeekRange?: boolean
}

export function DatePicker({
	date,
	onSelect,
	placeholder = 'Выберите дату',
	disabled = false,
	showWeekRange = false,
}: DatePickerProps) {
	const getDisplayText = () => {
		if (!date) return <span>{placeholder}</span>

		if (showWeekRange) {
			const weekEnd = addDays(date, 6)
			return `${format(date, 'd MMM', { locale: ru })} — ${format(weekEnd, 'd MMM', { locale: ru })}`
		}

		return format(date, 'PPP', { locale: ru })
	}

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					variant={'outline'}
					className={cn('justify-start text-left font-normal', !date && 'text-muted-foreground')}
					disabled={disabled}
				>
					<CalendarIcon className="mr-2 h-4 w-4" />
					{getDisplayText()}
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-auto overflow-hidden p-0" align="start">
				<Calendar
					mode="single"
					selected={date}
					onSelect={onSelect}
					captionLayout="dropdown"
					locale={ru}
					fromYear={2020}
					toYear={2030}
				/>
			</PopoverContent>
		</Popover>
	)
}

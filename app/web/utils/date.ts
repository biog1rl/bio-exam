import { CalendarDate } from '@internationalized/date'

export function getMonday(date: Date): Date {
	const d = new Date(date)
	const day = d.getDay() === 0 ? 6 : d.getDay() - 1
	d.setDate(d.getDate() - day)
	d.setHours(0, 0, 0, 0)
	return d
}

export function getWeekDatesFromMonday(monday: Date): Date[] {
	return Array.from({ length: 5 }, (_, i) => {
		const date = new Date(monday)
		date.setDate(date.getDate() + i)
		return date
	})
}

export function toCalendarDate(date: Date): CalendarDate {
	return new CalendarDate(date.getFullYear(), date.getMonth() + 1, date.getDate())
}

export function getCalendarWeekRange(monday: Date): {
	start: CalendarDate
	end: CalendarDate
} {
	const week = getWeekDatesFromMonday(monday)
	return {
		start: toCalendarDate(week[0]),
		end: toCalendarDate(week[4]),
	}
}

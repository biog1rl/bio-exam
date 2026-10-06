import { format, isValid, parseISO } from 'date-fns'
import { ru } from 'date-fns/locale'

export const NO_DATE = '—'

type DateInput = string | Date | null | undefined

function toDate(value: DateInput): Date | null {
	if (!value) return null
	const date = typeof value === 'string' ? parseISO(value) : value
	return isValid(date) ? date : null
}

function formatOr(value: DateInput, pattern: string): string {
	const date = toDate(value)
	return date ? format(date, pattern, { locale: ru }) : NO_DATE
}

export function formatDay(value: DateInput): string {
	return formatOr(value, 'dd.MM.yyyy')
}

export function formatDateTime(value: DateInput): string {
	return formatOr(value, 'dd.MM.yyyy, HH:mm')
}

export function formatShortDay(value: DateInput): string {
	return formatOr(value, 'd MMM')
}

export function formatPeriod(from: DateInput, to: DateInput): string {
	const start = toDate(from)
	if (!start) return ''
	const end = toDate(to) ?? start
	const first = format(start, 'dd.MM.yy')
	const last = format(end, 'dd.MM.yy')
	return first === last ? first : `${first} — ${last}`
}

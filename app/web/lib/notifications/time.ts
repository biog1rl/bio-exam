import { differenceInCalendarDays, format, isSameYear } from 'date-fns'
import { ru } from 'date-fns/locale'

const MINUTE = 60_000
const HOUR = 60 * MINUTE

export function formatNotificationTime(iso: string, now: Date): string {
	const date = new Date(iso)
	const elapsed = now.getTime() - date.getTime()
	if (elapsed < MINUTE) return 'только что'
	if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} мин назад`
	const days = differenceInCalendarDays(now, date)
	if (days <= 0) return `${Math.floor(elapsed / HOUR)} ч назад`
	if (days === 1) return `вчера в ${format(date, 'HH:mm')}`
	if (days < 7) return `${days} дн. назад`
	return format(date, isSameYear(now, date) ? 'd MMM' : 'd MMM yyyy', { locale: ru })
}

export function formatNotificationFullDate(iso: string): string {
	return format(new Date(iso), 'd MMMM yyyy, HH:mm', { locale: ru })
}

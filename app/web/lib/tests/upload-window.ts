import { format, isSameDay } from 'date-fns'
import { ru } from 'date-fns/locale'

export type UploadWindowState = 'none' | 'open' | 'closing' | 'last-minute' | 'closed'

export type UploadWindowView = {
	state: UploadWindowState
	until: string | null
	countdown: string | null
	closedText: string | null
	srText: string | null
	liveText: string | null
	nextUpdateInMs: number | null
}

export const UPLOAD_WINDOW_SOON_MS = 5 * 60_000

const MINUTE_MS = 60_000

const NO_WINDOW: UploadWindowView = {
	state: 'none',
	until: null,
	countdown: null,
	closedText: null,
	srText: null,
	liveText: null,
	nextUpdateInMs: null,
}

function countdownOf(state: 'open' | 'closing' | 'last-minute', minutes: number): string {
	if (state === 'open') return `осталось ${minutes} мин`
	if (state === 'closing') return `закроется через ${minutes} мин`
	return 'закроется меньше чем через минуту'
}

export function uploadWindowView(uploadClosesAt: string | null, nowMs: number): UploadWindowView {
	if (uploadClosesAt === null) return NO_WINDOW
	const closesMs = Date.parse(uploadClosesAt)
	if (Number.isNaN(closesMs)) return NO_WINDOW
	const closes = new Date(closesMs)
	const sameDay = isSameDay(closes, new Date(nowMs))
	const time = format(closes, 'HH:mm')
	const remaining = closesMs - nowMs
	if (remaining <= 0) {
		return {
			...NO_WINDOW,
			state: 'closed',
			closedText: sameDay
				? `Время для добавления фото закончилось в ${time}`
				: `Время для добавления фото закончилось ${format(closes, 'd MMM', { locale: ru })} в ${time}`,
			liveText: 'Время для добавления фото закончилось.',
		}
	}
	const until = sameDay ? time : format(closes, 'd MMM, HH:mm', { locale: ru })
	const minutes = Math.ceil(remaining / MINUTE_MS)
	const state = remaining > UPLOAD_WINDOW_SOON_MS ? 'open' : remaining >= MINUTE_MS ? 'closing' : 'last-minute'
	return {
		state,
		until: `Фото можно добавить до ${until}`,
		countdown: countdownOf(state, minutes),
		closedText: null,
		srText: `Фото можно добавить до ${until}.`,
		liveText: state === 'closing' ? 'Окно для фото закроется через 5 минут.' : null,
		nextUpdateInMs: remaining - (minutes - 1) * MINUTE_MS,
	}
}

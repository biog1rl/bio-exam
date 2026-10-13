import { PHOTO_UPLOAD_WINDOW_MAX_MINUTES } from '@bio-exam/exam-core'

export const PHOTO_WINDOW_REQUIRED = 'Укажите число минут от 0 до 120'

export const PHOTO_WINDOW_INVALID = 'Введите целое число минут от 0 до 120'

export const PHOTO_WINDOW_SAVE_TOAST = 'Окно для фото: введите целое число минут от 0 до 120'

const HINT_WITH_LIMIT = 'Отсчёт — от сдачи или конца таймера, что раньше. 0 — фото только до сдачи.'

const HINT_WITHOUT_LIMIT = 'Отсчёт — от сдачи теста. 0 — фото только до сдачи.'

export function hasOpenQuestion(questions: readonly { questionUiTemplate?: string | null }[]): boolean {
	return questions.some((question) => question.questionUiTemplate === 'open')
}

export function photoWindowError(value: number | null): string | null {
	if (value === null) return PHOTO_WINDOW_REQUIRED
	if (!Number.isInteger(value) || value < 0 || value > PHOTO_UPLOAD_WINDOW_MAX_MINUTES) return PHOTO_WINDOW_INVALID
	return null
}

export function photoWindowSaveError(value: number | null, visible: boolean): string | null {
	return visible ? photoWindowError(value) : null
}

export function photoWindowHint(timeLimitMinutes: number | null): string {
	return timeLimitMinutes ? HINT_WITH_LIMIT : HINT_WITHOUT_LIMIT
}

import {
	OPEN_QUESTION_MAX_POINTS,
	OPEN_REVIEW_COMMENT_MAX_LENGTH,
	OPEN_REVIEW_NO_ANSWER_COMMENT,
	type OpenReview,
} from '@bio-exam/exam-core'

import { format, isSameDay, isValid, parseISO } from 'date-fns'

import { failureMessage } from '@/lib/http/errors'
import type { RequestFailure } from '@/lib/http/request'

export const OPEN_REVIEW_SCORES: readonly number[] = Array.from({ length: OPEN_QUESTION_MAX_POINTS + 1 }, (_, i) => i)

export { OPEN_REVIEW_COMMENT_MAX_LENGTH }

export type OpenReviewForm = { score: number | null; comment: string }

export function initialReviewForm(review: Pick<OpenReview, 'score' | 'comment'> | null): OpenReviewForm {
	return { score: review?.score ?? null, comment: review?.comment ?? '' }
}

export function canSaveReview(input: {
	form: OpenReviewForm
	saved: OpenReviewForm
	ready: boolean
	saving: boolean
}): boolean {
	const { form, saved, ready, saving } = input
	if (!ready || saving || form.score === null) return false
	if (form.comment.length > OPEN_REVIEW_COMMENT_MAX_LENGTH) return false
	return form.score !== saved.score || form.comment.trim() !== saved.comment.trim()
}

export function isNoAnswerReview(review: Pick<OpenReview, 'comment' | 'reviewerName'>): boolean {
	return review.reviewerName === null && review.comment === OPEN_REVIEW_NO_ANSWER_COMMENT
}

export function reviewWindowHint(uploadClosesAt: string | null | undefined, nowMs: number): string | null {
	if (!uploadClosesAt) return null
	const closes = parseISO(uploadClosesAt)
	if (!isValid(closes)) return null
	const time = format(closes, 'HH:mm')
	if (isSameDay(closes, new Date(nowMs))) return `Окно загрузки фото ещё открыто до ${time}`
	return `Окно загрузки фото ещё открыто до ${format(closes, 'dd.MM.yyyy')} ${time}`
}

export const REVIEW_ERROR_TEXT = {
	ownAttempt: 'Свою попытку проверять нельзя.',
	notReady: 'Окно загрузки фото ещё открыто. Оценку можно поставить после его закрытия.',
	forbidden: 'Нет прав на проверку этой попытки.',
	notFound: 'Попытка или вопрос не найдены. Обновите страницу.',
} as const

function errorCode(body: unknown): string | null {
	if (!body || typeof body !== 'object') return null
	const error = (body as Record<string, unknown>).error
	return typeof error === 'string' ? error : null
}

export function reviewErrorText(failure: RequestFailure): string {
	if (failure.kind === 'http') {
		const code = errorCode(failure.body)
		if (failure.status === 403)
			return code === 'OWN_ATTEMPT' ? REVIEW_ERROR_TEXT.ownAttempt : REVIEW_ERROR_TEXT.forbidden
		if (failure.status === 409 && code === 'REVIEW_NOT_READY') return REVIEW_ERROR_TEXT.notReady
		if (failure.status === 404) return REVIEW_ERROR_TEXT.notFound
	}
	return failureMessage(failure, 'Не удалось сохранить оценку. Повторите попытку.')
}

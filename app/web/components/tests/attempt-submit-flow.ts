import {
	ANSWER_VIOLATION_REASONS,
	OPEN_TEXT_MAX_LENGTH,
	SHORT_TEXT_MAX_LENGTH,
	SUBMIT_ERROR_CODES,
	type AnswerViolationReason,
} from '@bio-exam/exam-core'

import { AttemptRequestError } from '@/lib/tests/api'

export type SubmitFailure =
	| { kind: 'already-submitted'; attemptId: string | null }
	| { kind: 'time-expired' }
	| { kind: 'not-assigned' }
	| { kind: 'not-found' }
	| { kind: 'answers-invalid'; reason: AnswerViolationReason; limit: number | null }
	| { kind: 'retry' }

export type SubmitRejection = { reason: AnswerViolationReason; limit: number | null }

export type StartFailure = 'not-assigned' | 'failed'

export type AttemptBanner = 'start-not-assigned' | 'submit-not-assigned' | 'already-submitted' | 'not-found' | 'retry'

export type AttemptBannerView = { message: string; action: 'retry' | 'reload' | null }

export type AttemptStorageKey = 'session' | 'wal' | 'frozen' | 'clientAttemptId'

export type AttemptStorageEvent =
	| 'success'
	| 'already-submitted'
	| 'time-expired'
	| 'not-found'
	| 'start-not-assigned'
	| 'submit-not-assigned'
	| 'session-replaced'

export const SUBMIT_FLOW_TEXT = {
	alreadySubmittedTitle: 'Попытка уже сдана',
	alreadySubmittedDescription:
		'Эта попытка уже отправлена, например из другой вкладки. Результат появится в списке «Мои попытки» после обновления страницы.',
	alreadySubmittedOpenResults: 'К результатам',
	alreadySubmittedClose: 'Закрыть',
	timeExpiredTitle: 'Время вышло, ответы не засчитаны',
	timeExpiredDescription:
		'Лимит времени этой попытки истёк, поэтому ответы не приняты. Новая попытка начнётся с пустыми ответами и полным временем.',
	timeExpiredAction: 'Начать заново',
	sessionReplaced: 'Предыдущая попытка закрыта, начата новая.',
	retryAction: 'Повторить',
	reloadAction: 'Обновить страницу',
} as const

const BANNERS: Record<AttemptBanner, AttemptBannerView> = {
	'start-not-assigned': { message: 'Тест вам не назначен. Обратитесь к администратору.', action: null },
	'submit-not-assigned': {
		message: 'Тест вам больше не назначен, ответы не отправлены. Обратитесь к администратору.',
		action: null,
	},
	'already-submitted': {
		message: 'Эта попытка уже сдана. Обновите страницу, чтобы увидеть результат.',
		action: 'reload',
	},
	'not-found': { message: 'Попытка не найдена или тест больше недоступен. Обновите страницу.', action: 'reload' },
	retry: { message: 'Не удалось сохранить ответы. Попробуйте еще раз.', action: 'retry' },
}

const THOUSANDS = new Intl.NumberFormat('ru-RU')

const ANSWERS_INVALID_BANNERS: Record<AnswerViolationReason, AttemptBannerView> = {
	short_text_too_long: {
		message: `Краткий ответ не может быть длиннее ${THOUSANDS.format(SHORT_TEXT_MAX_LENGTH)} знаков. Сократите ответ и отправьте снова.`,
		action: null,
	},
	open_text_too_long: {
		message: `Текст ответа не может быть длиннее ${THOUSANDS.format(OPEN_TEXT_MAX_LENGTH)} знаков. Сократите ответ и отправьте снова.`,
		action: null,
	},
	foreign_question: {
		message: 'В ответах есть вопрос, которого нет в этом тесте. Обновите страницу: тест мог измениться.',
		action: 'reload',
	},
	unknown_question_type: {
		message: 'Один из вопросов больше не поддерживается в этой версии страницы. Обновите страницу.',
		action: 'reload',
	},
	answer_shape_invalid: {
		message: 'Один из ответов сохранён в неверном виде. Обновите страницу, проверьте ответы и отправьте снова.',
		action: 'reload',
	},
}

const ALL_ATTEMPT_KEYS: readonly AttemptStorageKey[] = ['session', 'wal', 'frozen', 'clientAttemptId']

const STORAGE_KEYS_BY_EVENT: Record<AttemptStorageEvent, readonly AttemptStorageKey[]> = {
	success: ALL_ATTEMPT_KEYS,
	'already-submitted': ALL_ATTEMPT_KEYS,
	'time-expired': ALL_ATTEMPT_KEYS,
	'not-found': ['session', 'clientAttemptId'],
	'start-not-assigned': ['session', 'clientAttemptId'],
	'submit-not-assigned': [],
	'session-replaced': ['wal', 'frozen', 'clientAttemptId'],
}

export function classifySubmitFailure(error: unknown): SubmitFailure {
	if (!(error instanceof AttemptRequestError)) return { kind: 'retry' }
	if (error.status === 409 && error.code === SUBMIT_ERROR_CODES.alreadySubmitted) {
		return { kind: 'already-submitted', attemptId: error.attemptId }
	}
	if (error.status === 422 && error.code === SUBMIT_ERROR_CODES.timeExpired) return { kind: 'time-expired' }
	if (error.status === 403) return { kind: 'not-assigned' }
	if (error.status === 404) return { kind: 'not-found' }
	if (error.status === 422 && error.code === SUBMIT_ERROR_CODES.answersInvalid) {
		const reason = ANSWER_VIOLATION_REASONS.find((known) => known === error.reason)
		if (reason) return { kind: 'answers-invalid', reason, limit: error.limit }
	}
	return { kind: 'retry' }
}

export function classifyStartFailure(error: unknown): StartFailure {
	if (error instanceof AttemptRequestError && error.status === 403) return 'not-assigned'
	return 'failed'
}

export function bannerFor(banner: AttemptBanner): AttemptBannerView {
	return BANNERS[banner]
}

export function answersInvalidBanner(rejection: SubmitRejection): AttemptBannerView {
	return ANSWERS_INVALID_BANNERS[rejection.reason]
}

export function storageKeysToClear(event: AttemptStorageEvent): readonly AttemptStorageKey[] {
	return STORAGE_KEYS_BY_EVENT[event]
}

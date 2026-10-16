import { describe, expect, test } from 'vitest'

import type { RequestFailure } from '@/lib/http/request'

import {
	REVIEW_ERROR_TEXT,
	canSaveReview,
	initialReviewForm,
	isNoAnswerReview,
	reviewErrorText,
	reviewWindowHint,
} from './open-review'

const EMPTY = { score: null, comment: '' }

describe('canSaveReview', () => {
	test.each([
		['оценка не выбрана', { form: EMPTY, saved: EMPTY, ready: true, saving: false }, false],
		['окно открыто', { form: { score: 2, comment: '' }, saved: EMPTY, ready: false, saving: false }, false],
		['идёт сохранение', { form: { score: 2, comment: '' }, saved: EMPTY, ready: true, saving: true }, false],
		['новая оценка', { form: { score: 2, comment: '' }, saved: EMPTY, ready: true, saving: false }, true],
		[
			'без изменений',
			{ form: { score: 2, comment: 'ок' }, saved: { score: 2, comment: 'ок' }, ready: true, saving: false },
			false,
		],
		[
			'изменён только пробел в конце',
			{ form: { score: 2, comment: 'ок ' }, saved: { score: 2, comment: 'ок' }, ready: true, saving: false },
			false,
		],
		[
			'исправлен комментарий',
			{ form: { score: 2, comment: 'иначе' }, saved: { score: 2, comment: 'ок' }, ready: true, saving: false },
			true,
		],
		[
			'комментарий длиннее предела',
			{ form: { score: 2, comment: 'а'.repeat(2001) }, saved: EMPTY, ready: true, saving: false },
			false,
		],
	])('%s', (_name, input, expected) => {
		expect(canSaveReview(input)).toBe(expected)
	})
})

test('initialReviewForm: без оценки пусто, с оценкой берёт её значения', () => {
	expect(initialReviewForm(null)).toEqual(EMPTY)
	expect(initialReviewForm({ score: 1, comment: null })).toEqual({ score: 1, comment: '' })
})

test('isNoAnswerReview: только оценка без проверяющего с комментарием «нет ответа»', () => {
	expect(isNoAnswerReview({ comment: 'нет ответа', reviewerName: null })).toBe(true)
	expect(isNoAnswerReview({ comment: 'нет ответа', reviewerName: 'Анна' })).toBe(false)
	expect(isNoAnswerReview({ comment: null, reviewerName: null })).toBe(false)
})

describe('reviewWindowHint', () => {
	const now = new Date(2026, 9, 16, 12, 0).getTime()

	test('сегодня: только время', () => {
		expect(reviewWindowHint(new Date(2026, 9, 16, 14, 5).toISOString(), now)).toBe(
			'Окно загрузки фото ещё открыто до 14:05'
		)
	})

	test('другой день: с датой', () => {
		expect(reviewWindowHint(new Date(2026, 9, 17, 9, 30).toISOString(), now)).toBe(
			'Окно загрузки фото ещё открыто до 17.10.2026 09:30'
		)
	})

	test('окна нет или значение не дата', () => {
		expect(reviewWindowHint(null, now)).toBeNull()
		expect(reviewWindowHint('не дата', now)).toBeNull()
	})
})

describe('reviewErrorText', () => {
	const http = (status: number, body: unknown): RequestFailure => ({
		ok: false,
		kind: 'http',
		status,
		body,
		message: '',
	})

	test.each([
		['403 OWN_ATTEMPT', http(403, { error: 'OWN_ATTEMPT' }), REVIEW_ERROR_TEXT.ownAttempt],
		['403 Forbidden', http(403, { error: 'Forbidden' }), REVIEW_ERROR_TEXT.forbidden],
		['409 REVIEW_NOT_READY', http(409, { error: 'REVIEW_NOT_READY' }), REVIEW_ERROR_TEXT.notReady],
		['404', http(404, { error: 'Attempt not found' }), REVIEW_ERROR_TEXT.notFound],
	])('%s', (_name, failure, text) => {
		expect(reviewErrorText(failure)).toBe(text)
	})

	test('прочие отказы: общий текст', () => {
		expect(reviewErrorText(http(500, null))).toBe('Не удалось сохранить оценку. Повторите попытку.')
	})
})

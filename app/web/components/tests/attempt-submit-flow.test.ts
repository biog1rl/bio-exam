import { ANSWER_VIOLATION_REASONS, OPEN_TEXT_MAX_LENGTH, SHORT_TEXT_MAX_LENGTH } from '@bio-exam/exam-core'

import { describe, expect, test } from 'vitest'

import { AttemptRequestError } from '@/lib/tests/api'

import { answersInvalidBanner, classifyStartFailure, classifySubmitFailure } from './attempt-submit-flow'

const THOUSANDS = new Intl.NumberFormat('ru-RU')

describe('classifySubmitFailure', () => {
	test('409 ATTEMPT_ALREADY_SUBMITTED с attemptId даёт already-submitted с этим id', () => {
		expect(classifySubmitFailure(new AttemptRequestError(409, 'ATTEMPT_ALREADY_SUBMITTED', 'id'))).toEqual({
			kind: 'already-submitted',
			attemptId: 'id',
		})
	})

	test('409 ATTEMPT_ALREADY_SUBMITTED без attemptId даёт already-submitted с null', () => {
		expect(classifySubmitFailure(new AttemptRequestError(409, 'ATTEMPT_ALREADY_SUBMITTED', null))).toEqual({
			kind: 'already-submitted',
			attemptId: null,
		})
	})

	test.each([
		['409 с другим кодом', new AttemptRequestError(409, 'OTHER', null), 'retry'],
		['409 без кода', new AttemptRequestError(409, null, null), 'retry'],
		['422 TIME_EXPIRED', new AttemptRequestError(422, 'TIME_EXPIRED', null), 'time-expired'],
		['422 с другим кодом', new AttemptRequestError(422, 'OTHER', null), 'retry'],
		['422 ANSWERS_INVALID без причины', new AttemptRequestError(422, 'ANSWERS_INVALID', null), 'retry'],
		[
			'422 ANSWERS_INVALID с неизвестной причиной',
			new AttemptRequestError(422, 'ANSWERS_INVALID', null, 'too_many'),
			'retry',
		],
		[
			'400 ANSWERS_INVALID с причиной',
			new AttemptRequestError(400, 'ANSWERS_INVALID', null, 'foreign_question'),
			'retry',
		],
		['403', new AttemptRequestError(403, 'Тест не назначен', null), 'not-assigned'],
		['404', new AttemptRequestError(404, 'Session not found', null), 'not-found'],
		['400', new AttemptRequestError(400, 'Bad request', null), 'retry'],
		['500', new AttemptRequestError(500, null, null), 'retry'],
		['503', new AttemptRequestError(503, null, null), 'retry'],
		['сбой сети', new TypeError('Failed to fetch'), 'retry'],
		['не Error', 'boom', 'retry'],
	])('%s даёт %s', (_title, error, kind) => {
		expect(classifySubmitFailure(error).kind).toBe(kind)
	})
})

describe('answers-invalid', () => {
	test.each(ANSWER_VIOLATION_REASONS.map((reason): [string] => [reason]))(
		'422 ANSWERS_INVALID, причина %s',
		(reason) => {
			expect(classifySubmitFailure(new AttemptRequestError(422, 'ANSWERS_INVALID', null, reason, 200))).toEqual({
				kind: 'answers-invalid',
				reason,
				limit: 200,
			})
		}
	)

	test('предел отсутствует в теле: limit null', () => {
		expect(classifySubmitFailure(new AttemptRequestError(422, 'ANSWERS_INVALID', null, 'foreign_question'))).toEqual({
			kind: 'answers-invalid',
			reason: 'foreign_question',
			limit: null,
		})
	})

	test.each(
		[
			{
				name: 'краткий ответ',
				reason: 'short_text_too_long' as const,
				message: `Ответ не может быть длиннее ${THOUSANDS.format(SHORT_TEXT_MAX_LENGTH)} знаков. Сократите ответ и отправьте снова.`,
				action: null,
			},
			{
				name: 'открытый ответ',
				reason: 'open_text_too_long' as const,
				message: `Текст ответа не может быть длиннее ${THOUSANDS.format(OPEN_TEXT_MAX_LENGTH)} знаков. Сократите ответ и отправьте снова.`,
				action: null,
			},
			{
				name: 'чужой вопрос',
				reason: 'foreign_question' as const,
				message: 'В ответах есть вопрос, которого нет в этом тесте. Обновите страницу: тест мог измениться.',
				action: 'reload',
			},
			{
				name: 'неизвестный тип',
				reason: 'unknown_question_type' as const,
				message: 'Один из вопросов больше не поддерживается в этой версии страницы. Обновите страницу.',
				action: 'reload',
			},
		].map((row): [string, typeof row] => [row.name, row])
	)('баннер: %s', (_name, { reason, message, action }) => {
		expect(answersInvalidBanner({ reason, limit: null })).toEqual({ message, action })
	})

	test('число 5 000 с неразрывным пробелом тысяч', () => {
		expect(answersInvalidBanner({ reason: 'open_text_too_long', limit: 5000 }).message).toContain('5\u00a0000')
	})
})

describe('classifyStartFailure', () => {
	test.each([
		['403', new AttemptRequestError(403, 'Тест не назначен', null), 'not-assigned'],
		['404', new AttemptRequestError(404, 'Test not found', null), 'failed'],
		['409', new AttemptRequestError(409, 'ATTEMPT_ALREADY_SUBMITTED', 'id'), 'failed'],
		['422', new AttemptRequestError(422, 'TIME_EXPIRED', null), 'failed'],
		['500', new AttemptRequestError(500, null, null), 'failed'],
		['сбой сети', new TypeError('Failed to fetch'), 'failed'],
	])('%s даёт %s', (_title, error, kind) => {
		expect(classifyStartFailure(error)).toBe(kind)
	})
})

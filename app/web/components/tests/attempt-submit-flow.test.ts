import {
	ANSWER_VIOLATION_REASONS,
	OPEN_TEXT_MAX_LENGTH,
	SHORT_TEXT_MAX_LENGTH,
	type AttemptView,
} from '@bio-exam/exam-core'

import { describe, expect, test } from 'vitest'

import { AttemptRequestError } from '@/lib/tests/api'

import { answersInvalidBanner, classifyStartFailure, classifySubmitFailure } from './attempt-submit-flow'

const THOUSANDS = new Intl.NumberFormat('ru-RU')

const ATTEMPT = '44444444-4444-4444-8444-444444444444'
const CLOSES_AT = '2026-10-04T10:20:00.000Z'
const SERVER_NOW = '2026-10-04T10:05:00.000Z'
const VIEW: AttemptView = {
	attemptId: ATTEMPT,
	submittedAt: SERVER_NOW,
	earnedPoints: 1,
	totalPoints: 3,
	scorePercentage: 33,
	passed: false,
	reviewStatus: 'none',
	autoEarnedPoints: 1,
	autoTotalPoints: 3,
	results: [],
	uploadClosesAt: CLOSES_AT,
	submitSource: 'deadline',
}

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
		{
			name: '409 deadline с видом попытки',
			details: { submitSource: 'deadline' as const, uploadClosesAt: CLOSES_AT, serverNow: SERVER_NOW, attempt: VIEW },
			expected: {
				kind: 'finalized',
				attemptId: ATTEMPT,
				attempt: VIEW,
				uploadClosesAt: CLOSES_AT,
				serverNow: SERVER_NOW,
			},
		},
		{
			name: '409 deadline без вида попытки',
			details: { submitSource: 'deadline' as const, serverNow: SERVER_NOW },
			expected: { kind: 'finalized', attemptId: ATTEMPT, attempt: null, uploadClosesAt: null, serverNow: SERVER_NOW },
		},
		{
			name: '409 deadline, испорченный вид разобран в null',
			details: { submitSource: 'deadline' as const, uploadClosesAt: CLOSES_AT, attempt: null },
			expected: { kind: 'finalized', attemptId: ATTEMPT, attempt: null, uploadClosesAt: CLOSES_AT, serverNow: null },
		},
		{
			name: '409 client',
			details: { submitSource: 'client' as const, attempt: VIEW },
			expected: { kind: 'already-submitted', attemptId: ATTEMPT },
		},
		{
			name: '409 без источника',
			details: {},
			expected: { kind: 'already-submitted', attemptId: ATTEMPT },
		},
	])('$name', ({ details, expected }) => {
		expect(
			classifySubmitFailure(new AttemptRequestError(409, 'ATTEMPT_ALREADY_SUBMITTED', ATTEMPT, null, null, details))
		).toEqual(expected)
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

	test('422 OPEN_ANSWER_EMPTY: вид отказа с id вопросов', () => {
		const ids = ['11111111-1111-4111-8111-111111111111']
		expect(
			classifySubmitFailure(new AttemptRequestError(422, 'OPEN_ANSWER_EMPTY', null, null, null, { questionIds: ids }))
		).toEqual({ kind: 'open-answer-empty', questionIds: ids })
	})

	test('422 OPEN_ANSWER_EMPTY без questionIds: пустой список', () => {
		expect(classifySubmitFailure(new AttemptRequestError(422, 'OPEN_ANSWER_EMPTY', null))).toEqual({
			kind: 'open-answer-empty',
			questionIds: [],
		})
	})

	test.each([
		[[], 'Добавьте текст или фото к ответу на открытый вопрос.'],
		[[3], 'Добавьте текст или фото к ответу на открытый вопрос 3.'],
		[[2, 5], 'Добавьте текст или фото к ответу на открытый вопрос: 2, 5.'],
	] as const)('баннер OPEN_ANSWER_EMPTY %j', (positions, message) => {
		expect(answersInvalidBanner({ reason: 'open_answer_empty', positions })).toEqual({ message, action: null })
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

import { describe, expect, test } from 'vitest'

import { AttemptRequestError } from '@/lib/tests/api'

import {
	blocksInteraction,
	bannerFor,
	classifyStartFailure,
	classifySubmitFailure,
	isClientExpired,
	storageKeysToClear,
	SUBMIT_FLOW_TEXT,
	type AttemptBanner,
} from './attempt-submit-flow'

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

describe('bannerFor', () => {
	test.each<[AttemptBanner, string, 'retry' | 'reload' | null]>([
		['start-not-assigned', 'Тест вам не назначен. Обратитесь к администратору.', null],
		['submit-not-assigned', 'Тест вам больше не назначен, ответы не отправлены. Обратитесь к администратору.', null],
		['already-submitted', 'Эта попытка уже сдана. Обновите страницу, чтобы увидеть результат.', 'reload'],
		['not-found', 'Попытка не найдена или тест больше недоступен. Обновите страницу.', 'reload'],
		['retry', 'Не удалось сохранить ответы. Попробуйте еще раз.', 'retry'],
	])('%s', (banner, message, action) => {
		expect(bannerFor(banner)).toEqual({ message, action })
	})

	test('строки сервера в плашки не попадают', () => {
		const banners: AttemptBanner[] = [
			'start-not-assigned',
			'submit-not-assigned',
			'already-submitted',
			'not-found',
			'retry',
		]
		for (const banner of banners) {
			const { message } = bannerFor(banner)
			for (const serverText of ['Тест не назначен', 'Test not found', 'Bad request', 'Session not found']) {
				expect(message).not.toBe(serverText)
			}
		}
	})
})

describe('SUBMIT_FLOW_TEXT', () => {
	test('тексты диалогов 409 и 422 и тоста по UI-SPEC', () => {
		expect(SUBMIT_FLOW_TEXT).toMatchObject({
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
		})
	})
})

describe('storageKeysToClear', () => {
	test.each([
		['success', ['session', 'wal', 'frozen', 'clientAttemptId']],
		['already-submitted', ['session', 'wal', 'frozen', 'clientAttemptId']],
		['time-expired', ['session', 'wal', 'frozen', 'clientAttemptId']],
		['not-found', ['session', 'clientAttemptId']],
		['start-not-assigned', ['session', 'clientAttemptId']],
		['submit-not-assigned', []],
		['retry', []],
		['session-replaced', ['wal', 'frozen', 'clientAttemptId']],
	] as const)('%s', (event, keys) => {
		expect([...storageKeysToClear(event)].sort()).toEqual([...keys].sort())
	})
})

describe('blocksInteraction', () => {
	test.each<[AttemptBanner, boolean]>([
		['start-not-assigned', true],
		['submit-not-assigned', true],
		['already-submitted', true],
		['not-found', true],
		['retry', false],
	])('%s даёт %s', (banner, blocked) => {
		expect(blocksInteraction(banner)).toBe(blocked)
	})
})

describe('isClientExpired', () => {
	const startedAt = '2026-10-04T10:00:00.000Z'
	const startMs = Date.parse(startedAt)
	const twelveMinutes = 12 * 60 * 1000

	test('лимит 10 минут и льгота 2 минуты: за 1 мс до конца ещё не просрочено', () => {
		expect(isClientExpired({ startedAt, timeLimitMinutes: 10, nowMs: startMs + twelveMinutes - 1 })).toBe(false)
	})

	test('лимит 10 минут и льгота 2 минуты: через 1 мс после конца просрочено', () => {
		expect(isClientExpired({ startedAt, timeLimitMinutes: 10, nowMs: startMs + twelveMinutes + 1 })).toBe(true)
	})

	test('без лимита не просрочено', () => {
		expect(isClientExpired({ startedAt, timeLimitMinutes: null, nowMs: startMs + 10 * twelveMinutes })).toBe(false)
	})

	test('нечитаемый startedAt не считается просроченным', () => {
		expect(
			isClientExpired({ startedAt: 'not-a-date', timeLimitMinutes: 10, nowMs: startMs + 10 * twelveMinutes })
		).toBe(false)
	})
})

import { describe, expect, test } from 'vitest'

import { AttemptRequestError } from '@/lib/tests/api'

import { classifyStartFailure, classifySubmitFailure } from './attempt-submit-flow'

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

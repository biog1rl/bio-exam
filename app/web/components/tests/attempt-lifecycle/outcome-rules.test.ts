import { SUBMIT_ERROR_CODES } from '@bio-exam/exam-core'

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test, vi } from 'vitest'

import type { SaveOutcome } from '@/lib/drafts/save-queue'
import type { AttemptDraftSaveResult } from '@/lib/tests/api'

import { answersInvalidBanner, bannerFor, type SubmitRejection } from '../attempt-submit-flow'
import { attemptDisplay, saveOutcomeOf, type AttemptDisplay, type AttemptDisplayInput } from './outcome-rules'
import {
	ATTEMPT_ID,
	attemptViewOf,
	NETWORK,
	Q1,
	requestError,
	response,
	sessionOf,
	settle,
	setupLifecycle,
	START,
} from './testing'

const ACTIVE: AttemptDisplayInput = {
	phase: 'active',
	blockReason: null,
	submitFailed: false,
	submitRejection: null,
	deadlinePassed: false,
	hasResult: false,
	acceptedAutomatically: false,
	alreadySubmittedDismissed: false,
	timed: true,
}

const NOTHING: AttemptDisplay = { outcome: null, deadlinePanel: null, banner: null, dialog: null, timer: true }

const REJECTION: SubmitRejection = { reason: 'short_text_too_long', limit: 1000 }

describe('attemptDisplay: что показать ученику', () => {
	test.each<[string, Partial<AttemptDisplayInput>, Partial<AttemptDisplay>]>([
		['активная попытка с лимитом', {}, {}],
		['активная попытка без лимита', { timed: false }, { timer: false }],
		['awaitingStart', { phase: 'awaitingStart' }, { dialog: 'start' }],
		['сбой отправки до дедлайна', { submitFailed: true }, { banner: bannerFor('retry') }],
		['отказ ответа', { submitRejection: REJECTION }, { banner: answersInvalidBanner(REJECTION) }],
		[
			'отказ ответа важнее причины блока',
			{ phase: 'blocked', blockReason: 'submit-not-assigned', submitRejection: REJECTION },
			{ banner: answersInvalidBanner(REJECTION) },
		],
		['дедлайн прошёл, автосдача идёт', { phase: 'autoSubmitting', deadlinePassed: true }, { deadlinePanel: 'sending' }],
		[
			'дедлайн прошёл, автосдача упала',
			{ phase: 'active', deadlinePassed: true, submitFailed: true },
			{ deadlinePanel: 'failed' },
		],
		[
			'дедлайн прошёл, сбой не в active',
			{ phase: 'starting', deadlinePassed: true, submitFailed: true },
			{ deadlinePanel: 'sending' },
		],
		[
			'время вышло',
			{ phase: 'blocked', blockReason: 'time-expired', deadlinePassed: true },
			{ dialog: 'time-expired' },
		],
		[
			'время вышло после сбоя ручной сдачи до дедлайна',
			{ phase: 'blocked', blockReason: 'time-expired', submitFailed: true },
			{ dialog: 'time-expired', banner: bannerFor('retry') },
		],
		[
			'уже сдана, диалог открыт',
			{ phase: 'blocked', blockReason: 'already-submitted' },
			{ dialog: 'already-submitted' },
		],
		[
			'уже сдана, диалог закрыт',
			{ phase: 'blocked', blockReason: 'already-submitted', alreadySubmittedDismissed: true },
			{ banner: bannerFor('already-submitted') },
		],
		[
			'уже сдана, диалог открыт, сбой отправки',
			{ phase: 'blocked', blockReason: 'already-submitted', submitFailed: true },
			{ dialog: 'already-submitted' },
		],
		[
			'тест не назначен на старте',
			{ phase: 'blocked', blockReason: 'start-not-assigned' },
			{ banner: bannerFor('start-not-assigned') },
		],
		[
			'тест не назначен на сдаче',
			{ phase: 'blocked', blockReason: 'submit-not-assigned' },
			{ banner: bannerFor('submit-not-assigned') },
		],
		['попытка не найдена', { phase: 'blocked', blockReason: 'not-found' }, { banner: bannerFor('not-found') }],
		[
			'результат ручной сдачи',
			{ phase: 'submitted', hasResult: true },
			{ outcome: { kind: 'result', accepted: false }, timer: false },
		],
		[
			'результат автосдачи',
			{ phase: 'submitted', hasResult: true, acceptedAutomatically: true, deadlinePassed: true },
			{ outcome: { kind: 'result', accepted: true }, timer: false },
		],
		[
			'ответ принят без результата',
			{ phase: 'submitted', acceptedAutomatically: true, deadlinePassed: true },
			{ outcome: { kind: 'accepted-without-result' }, timer: false },
		],
		['submitted без результата и без принятия', { phase: 'submitted' }, {}],
	])('%s', (_name, input, expected) => {
		assert.deepEqual(attemptDisplay({ ...ACTIVE, ...input }), { ...NOTHING, ...expected })
	})
})

describe('saveOutcomeOf: ответ PATCH → исход очереди', () => {
	test.each<[string, AttemptDraftSaveResult, SaveOutcome]>([
		['сеть', NETWORK, { kind: 'retry' }],
		['200', response(200), { kind: 'ok' }],
		['204', response(204), { kind: 'ok' }],
		['400', response(400), { kind: 'reject', status: 400 }],
		['403', response(403), { kind: 'stop', status: 403 }],
		['404', response(404), { kind: 'stop', status: 404 }],
		['409', response(409), { kind: 'retry' }],
		['422', response(422), { kind: 'retry' }],
		['500', response(500), { kind: 'retry' }],
		['503', response(503), { kind: 'retry' }],
	])('%s', (_name, result, expected) => {
		assert.deepEqual(saveOutcomeOf(result), expected)
	})
})

describe('модуль попытки: признак закрытого диалога «Попытка уже сдана»', () => {
	beforeEach(() => {
		vi.useFakeTimers()
		vi.setSystemTime(START)
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	test('dismissAlreadySubmitted после 409 client меняет диалог на баннер, retake возвращает признак', async () => {
		const { lifecycle, fakeApi } = setupLifecycle()
		lifecycle.init()
		await settle()
		lifecycle.answer(Q1, 'a')
		fakeApi.queueSubmit(requestError(409, SUBMIT_ERROR_CODES.alreadySubmitted, ATTEMPT_ID))
		await lifecycle.submit()
		assert.equal(lifecycle.getSnapshot().display.dialog, 'already-submitted')
		assert.equal(lifecycle.getSnapshot().display.banner, null)
		lifecycle.dismissAlreadySubmitted()
		assert.equal(lifecycle.getSnapshot().display.dialog, null)
		assert.deepEqual(lifecycle.getSnapshot().display.banner, bannerFor('already-submitted'))
		fakeApi.queueStart(sessionOf('s2'))
		lifecycle.retake()
		await settle()
		assert.equal(lifecycle.getSnapshot().phase, 'active')
		fakeApi.queueSubmit(requestError(409, SUBMIT_ERROR_CODES.alreadySubmitted, ATTEMPT_ID))
		await lifecycle.submit()
		assert.equal(lifecycle.getSnapshot().display.dialog, 'already-submitted')
		assert.equal(lifecycle.getSnapshot().display.banner, null)
	})

	test('снимок несёт display: результат ручной сдачи без таймера и панели', async () => {
		const { lifecycle, fakeApi } = setupLifecycle({ timeLimitMinutes: 10 })
		lifecycle.init()
		assert.equal(lifecycle.getSnapshot().display.dialog, 'start')
		await lifecycle.confirmStart()
		assert.deepEqual(lifecycle.getSnapshot().display, NOTHING)
		fakeApi.queueSubmit(attemptViewOf())
		await lifecycle.submit()
		assert.deepEqual(lifecycle.getSnapshot().display, {
			...NOTHING,
			outcome: { kind: 'result', accepted: false },
			timer: false,
		})
	})
})

import assert from 'node:assert/strict'
import { test } from 'vitest'

import { AttemptSessionSchema, SaveAttemptDraftRequestSchema, SessionFateSchema } from './attempt-session'
import { UploadWindowRefusalSchema } from './upload-window'

const Q1 = '22222222-2222-4222-8222-222222222222'
const SESSION = '33333333-3333-4333-8333-333333333333'
const DRAFT_MESSAGE = 'Provide questionId with value, telemetry, or both'

const telemetry = { [Q1]: { timeSpentMs: 1200, focusLossCount: 0, visitCount: 1 } }

function issueMessages(body: unknown): string[] {
	const parsed = SaveAttemptDraftRequestSchema.safeParse(body)
	assert.equal(parsed.success, false)
	return parsed.success ? [] : parsed.error.issues.map((issue) => issue.message)
}

test('SaveAttemptDraftRequestSchema принимает ответ, телеметрию и ответ с телеметрией', () => {
	assert.deepEqual(SaveAttemptDraftRequestSchema.parse({ questionId: Q1, value: 'a' }), { questionId: Q1, value: 'a' })
	assert.deepEqual(SaveAttemptDraftRequestSchema.parse({ telemetry: {} }), { telemetry: {} })
	assert.deepEqual(SaveAttemptDraftRequestSchema.parse({ questionId: Q1, value: ['a', 'b'], telemetry }), {
		questionId: Q1,
		value: ['a', 'b'],
		telemetry,
	})
	assert.equal(SaveAttemptDraftRequestSchema.safeParse({ questionId: Q1, value: { l1: 'r1' } }).success, true)
})

test('SaveAttemptDraftRequestSchema отклоняет пустое тело и половину пары с прежним текстом', () => {
	assert.deepEqual(issueMessages({}), [DRAFT_MESSAGE])
	assert.deepEqual(issueMessages({ questionId: Q1 }), [DRAFT_MESSAGE])
	assert.deepEqual(issueMessages({ value: 'a' }), [DRAFT_MESSAGE])
	assert.deepEqual(issueMessages({ questionId: Q1, telemetry }), [DRAFT_MESSAGE])
})

test('SaveAttemptDraftRequestSchema отклоняет questionId не uuid', () => {
	assert.equal(SaveAttemptDraftRequestSchema.safeParse({ questionId: 'q1', value: 'a' }).success, false)
})

test('AttemptSessionSchema принимает форму toSessionInfo без черновика', () => {
	const session = {
		sessionId: SESSION,
		startedAt: '2026-10-04T10:00:00.000Z',
		draftAnswers: null,
		draftLastQuestionId: null,
		draftTelemetry: null,
	}
	assert.deepEqual(AttemptSessionSchema.parse(session), session)
})

test('AttemptSessionSchema принимает черновик с произвольными значениями ответов', () => {
	const session = {
		sessionId: SESSION,
		startedAt: '2026-10-04T10:00:00.000Z',
		draftAnswers: { [Q1]: 'a', other: ['x'], legacy: { l1: 'r1' }, broken: 42 },
		draftLastQuestionId: Q1,
		draftTelemetry: telemetry,
	}
	assert.deepEqual(AttemptSessionSchema.parse(session), session)
})

test('AttemptSessionSchema отклоняет объект без sessionId', () => {
	const parsed = AttemptSessionSchema.safeParse({
		startedAt: '2026-10-04T10:00:00.000Z',
		draftAnswers: null,
		draftLastQuestionId: null,
		draftTelemetry: null,
	})
	assert.equal(parsed.success, false)
})

const ISO = '2026-10-06T10:00:00.000Z'
const ATTEMPT = '11111111-1111-4111-8111-111111111111'

const fateAttempt = {
	attemptId: ATTEMPT,
	submittedAt: ISO,
	earnedPoints: 1,
	totalPoints: 1,
	scorePercentage: 100,
	passed: true,
	reviewStatus: 'none',
	autoEarnedPoints: 1,
	autoTotalPoints: 1,
	results: [],
}

test.each([
	{ name: 'open', body: { state: 'open', sessionId: SESSION, startedAt: ISO, serverNow: ISO }, ok: true },
	{
		name: 'submitted',
		body: {
			state: 'submitted',
			attemptId: ATTEMPT,
			submitSource: 'deadline',
			uploadClosesAt: null,
			serverNow: ISO,
			attempt: fateAttempt,
		},
		ok: true,
	},
	{ name: 'expired', body: { state: 'expired', serverNow: ISO }, ok: true },
	{ name: 'неизвестное состояние', body: { state: 'closed', serverNow: ISO }, ok: false },
	{
		name: 'submitted без attempt',
		body: { state: 'submitted', attemptId: ATTEMPT, submitSource: 'client', uploadClosesAt: null, serverNow: ISO },
		ok: false,
	},
])('SessionFateSchema: $name', ({ body, ok }) => {
	assert.equal(SessionFateSchema.safeParse(body).success, ok)
})

test.each([
	{ name: 'окно закрыто', body: { error: 'UPLOAD_WINDOW_CLOSED', uploadClosesAt: ISO }, ok: true },
	{ name: 'окна нет', body: { error: 'UPLOAD_WINDOW_NONE', uploadClosesAt: null }, ok: true },
	{ name: 'неизвестный код', body: { error: 'UPLOAD_WINDOW_OPEN', uploadClosesAt: null }, ok: false },
])('UploadWindowRefusalSchema: $name', ({ body, ok }) => {
	assert.equal(UploadWindowRefusalSchema.safeParse(body).success, ok)
})

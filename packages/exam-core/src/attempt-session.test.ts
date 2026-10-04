import assert from 'node:assert/strict'
import { test } from 'vitest'

import { AttemptSessionSchema, SaveAttemptDraftRequestSchema } from './attempt-session'

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

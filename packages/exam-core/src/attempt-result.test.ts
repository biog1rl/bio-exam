import assert from 'node:assert/strict'
import { test } from 'vitest'

import {
	AdminAttemptViewSchema,
	AnswerValueSchema,
	ATTEMPT_GRACE_PERIOD_MINUTES,
	AttemptFactsSchema,
	AttemptQuestionViewSchema,
	AttemptViewSchema,
	LegacyAttemptResultItemSchema,
	LegacyAttemptResultsSchema,
	QuestionStatusSchema,
	questionStatus,
	QuestionVerdictsSchema,
	ScoredQuestionFactSchema,
	SUBMIT_ERROR_CODES,
	SubmitAttemptErrorSchema,
	SubmitAttemptRequestSchema,
	SubmitResultItemSchema,
	SubmitResultSchema,
} from './attempt-result'

const ATTEMPT = '11111111-1111-4111-8111-111111111111'
const Q1 = '22222222-2222-4222-8222-222222222222'

const validItem = {
	questionId: Q1,
	isCorrect: true,
	points: 2,
	earnedPoints: 2,
	userAnswer: 'a',
	correctAnswer: 'a',
	explanationText: null,
}

const validResult = {
	attemptId: ATTEMPT,
	submittedAt: '2026-01-01T00:00:00.000Z',
	earnedPoints: 2,
	totalPoints: 2,
	scorePercentage: 100,
	passed: true,
	results: [validItem],
}

const acceptedAnswers: Array<{ name: string; value: unknown }> = [
	{ name: 'строка', value: 'a' },
	{ name: 'пустая строка', value: '' },
	{ name: 'массив строк', value: ['a', 'b'] },
	{ name: 'пустой массив', value: [] },
	{ name: 'объект строка в строку', value: { l1: 'r1' } },
]

for (const row of acceptedAnswers) {
	test(`AnswerValueSchema: принимает — ${row.name}`, () => {
		assert.deepEqual(AnswerValueSchema.parse(row.value), row.value)
	})
}

const rejectedAnswers: Array<{ name: string; value: unknown }> = [
	{ name: 'число', value: 1 },
	{ name: 'null', value: null },
	{ name: 'массив с числом', value: ['a', 1] },
	{ name: 'объект с числовым значением', value: { l1: 1 } },
	{ name: 'undefined', value: undefined },
]

for (const row of rejectedAnswers) {
	test(`AnswerValueSchema: отклоняет — ${row.name}`, () => {
		assert.equal(AnswerValueSchema.safeParse(row.value).success, false)
	})
}

test('SubmitResultSchema: принимает текущий ответ submit', () => {
	assert.deepEqual(SubmitResultSchema.parse(validResult), validResult)
})

test('SubmitResultSchema: принимает пустой список results', () => {
	assert.equal(SubmitResultSchema.safeParse({ ...validResult, results: [] }).success, true)
})

test('SubmitResultSchema: лишние поля не требуются и не ломают разбор', () => {
	assert.equal(SubmitResultSchema.safeParse({ ...validResult, extra: 1 }).success, true)
})

test('SubmitResultItemSchema: принимает произвольные userAnswer и correctAnswer и текст пояснения', () => {
	const item = {
		...validItem,
		userAnswer: { l1: 'r1' },
		correctAnswer: ['a', 'b'],
		explanationText: 'Пояснение',
	}
	assert.deepEqual(SubmitResultItemSchema.parse(item), item)
})

const rejectedResults: Array<{ name: string; value: unknown }> = [
	{
		name: 'элемент results без questionId',
		value: { ...validResult, results: [{ ...validItem, questionId: undefined }] },
	},
	{ name: 'questionId не uuid', value: { ...validResult, results: [{ ...validItem, questionId: 'q1' }] } },
	{ name: 'attemptId не uuid', value: { ...validResult, attemptId: 'x' } },
	{ name: 'нет passed', value: { ...validResult, passed: undefined } },
	{
		name: 'explanationText не nullable-строка',
		value: { ...validResult, results: [{ ...validItem, explanationText: 1 }] },
	},
	{ name: 'нет explanationText', value: { ...validResult, results: [{ ...validItem, explanationText: undefined }] } },
	{ name: 'scorePercentage строкой', value: { ...validResult, scorePercentage: '100' } },
]

for (const row of rejectedResults) {
	test(`SubmitResultSchema: отклоняет — ${row.name}`, () => {
		assert.equal(SubmitResultSchema.safeParse(row.value).success, false)
	})
}

const SESSION = '33333333-3333-4333-8333-333333333333'
const CLIENT_ATTEMPT = '44444444-4444-4444-8444-444444444444'

const validEnvelope = {
	sessionId: SESSION,
	clientAttemptId: CLIENT_ATTEMPT,
	answers: { [Q1]: 'a' },
	telemetry: { [Q1]: { timeSpentMs: 1000, focusLossCount: 0, visitCount: 1 } },
}

test('SubmitAttemptRequestSchema: принимает полный конверт', () => {
	assert.deepEqual(SubmitAttemptRequestSchema.parse(validEnvelope), validEnvelope)
})

test('SubmitAttemptRequestSchema: telemetry необязательна', () => {
	const withoutTelemetry = {
		sessionId: validEnvelope.sessionId,
		clientAttemptId: validEnvelope.clientAttemptId,
		answers: validEnvelope.answers,
	}
	assert.deepEqual(SubmitAttemptRequestSchema.parse(withoutTelemetry), withoutTelemetry)
})

test('SubmitAttemptRequestSchema: лишние поля отбрасываются', () => {
	assert.deepEqual(SubmitAttemptRequestSchema.parse({ ...validEnvelope, extra: 1 }), validEnvelope)
})

const rejectedEnvelopes: Array<{ name: string; value: unknown }> = [
	{ name: 'нет sessionId', value: { ...validEnvelope, sessionId: undefined } },
	{ name: 'нет clientAttemptId', value: { ...validEnvelope, clientAttemptId: undefined } },
	{ name: 'sessionId не uuid', value: { ...validEnvelope, sessionId: 'session-1' } },
	{ name: 'clientAttemptId не uuid', value: { ...validEnvelope, clientAttemptId: 'attempt-1' } },
	{ name: 'ключ answers не uuid', value: { ...validEnvelope, answers: { q1: 'a' } } },
	{ name: 'нет answers', value: { ...validEnvelope, answers: undefined } },
]

for (const row of rejectedEnvelopes) {
	test(`SubmitAttemptRequestSchema: отклоняет — ${row.name}`, () => {
		assert.equal(SubmitAttemptRequestSchema.safeParse(row.value).success, false)
	})
}

test('SubmitAttemptErrorSchema: принимает оба кода и attemptId null', () => {
	const conflict = { error: SUBMIT_ERROR_CODES.alreadySubmitted, attemptId: ATTEMPT }
	const unknownAttempt = { error: SUBMIT_ERROR_CODES.alreadySubmitted, attemptId: null }
	const expired = { error: SUBMIT_ERROR_CODES.timeExpired }
	assert.deepEqual(SubmitAttemptErrorSchema.parse(conflict), conflict)
	assert.deepEqual(SubmitAttemptErrorSchema.parse(unknownAttempt), unknownAttempt)
	assert.deepEqual(SubmitAttemptErrorSchema.parse(expired), expired)
})

test('SubmitAttemptErrorSchema: отклоняет прежний код конфликта и чужие коды', () => {
	assert.equal(SubmitAttemptErrorSchema.safeParse({ error: 'TIME_EXPIRED_ALREADY_SUBMITTED' }).success, false)
	assert.equal(SubmitAttemptErrorSchema.safeParse({ error: 'Session not found' }).success, false)
})

test('коды ошибок submit и льгота лимита', () => {
	assert.deepEqual(SUBMIT_ERROR_CODES, { alreadySubmitted: 'ATTEMPT_ALREADY_SUBMITTED', timeExpired: 'TIME_EXPIRED' })
	assert.equal(ATTEMPT_GRACE_PERIOD_MINUTES, 2)
})

const sequenceVerdicts = {
	template: 'sequence_digits',
	mistakes: 1,
	parts: [
		{ position: 1, kind: 'correct', given: '2', expected: '2' },
		{ position: 4, kind: 'wrong', given: '5', expected: '4' },
	],
}

const acceptedVerdicts: Array<{ name: string; value: unknown }> = [
	{
		name: 'single_choice',
		value: { template: 'single_choice', mistakes: 0, parts: [{ optionId: 'a', kind: 'selected_correct' }] },
	},
	{
		name: 'multi_choice',
		value: {
			template: 'multi_choice',
			mistakes: 1,
			parts: [
				{ optionId: 'a', kind: 'selected_correct' },
				{ optionId: 'c', kind: 'missed' },
				{ optionId: 'b', kind: 'neutral' },
			],
		},
	},
	{
		name: 'matching',
		value: {
			template: 'matching',
			mistakes: 1,
			parts: [{ leftId: 'l1', kind: 'wrong', given: null, expected: 'r1' }],
		},
	},
	{ name: 'short_text', value: { template: 'short_text', mistakes: 0, parts: [{ kind: 'correct' }] } },
	{ name: 'sequence_digits', value: sequenceVerdicts },
	{ name: 'пустые части', value: { template: 'sequence_digits', mistakes: 0, parts: [] } },
]

for (const row of acceptedVerdicts) {
	test(`QuestionVerdictsSchema: принимает — ${row.name}`, () => {
		assert.deepEqual(QuestionVerdictsSchema.parse(row.value), row.value)
	})
}

const rejectedVerdicts: Array<{ name: string; value: unknown }> = [
	{ name: 'неизвестный шаблон', value: { template: 'essay', mistakes: 0, parts: [] } },
	{ name: 'отрицательные ошибки', value: { ...sequenceVerdicts, mistakes: -1 } },
	{ name: 'дробные ошибки', value: { ...sequenceVerdicts, mistakes: 0.5 } },
	{
		name: 'часть другого шаблона',
		value: { template: 'single_choice', mistakes: 0, parts: [{ kind: 'correct' }] },
	},
	{
		name: 'неизвестный вид части',
		value: { template: 'short_text', mistakes: 0, parts: [{ kind: 'partial' }] },
	},
	{ name: 'нет parts', value: { template: 'short_text', mistakes: 0 } },
]

for (const row of rejectedVerdicts) {
	test(`QuestionVerdictsSchema: отклоняет — ${row.name}`, () => {
		assert.equal(QuestionVerdictsSchema.safeParse(row.value).success, false)
	})
}

test('QuestionStatusSchema: четыре статуса', () => {
	assert.deepEqual(QuestionStatusSchema.options, ['ungraded', 'correct', 'partial', 'wrong'])
	assert.equal(QuestionStatusSchema.safeParse('skipped').success, false)
})

const statusRows: Array<{ input: { points: number; isCorrect: boolean; earnedPoints: number }; expected: string }> = [
	{ input: { points: 0, isCorrect: true, earnedPoints: 0 }, expected: 'ungraded' },
	{ input: { points: 0, isCorrect: false, earnedPoints: 0 }, expected: 'ungraded' },
	{ input: { points: 2, isCorrect: true, earnedPoints: 2 }, expected: 'correct' },
	{ input: { points: 2, isCorrect: false, earnedPoints: 1 }, expected: 'partial' },
	{ input: { points: 2, isCorrect: false, earnedPoints: 0 }, expected: 'wrong' },
]

for (const row of statusRows) {
	test(`questionStatus: ${JSON.stringify(row.input)} → ${row.expected}`, () => {
		assert.equal(questionStatus(row.input), row.expected)
	})
}

const validFact = {
	questionId: Q1,
	template: 'sequence_digits',
	metric: 'hamming_digits',
	points: 2,
	earnedPoints: 1,
	isCorrect: false,
	mistakes: 1,
	key: '2314',
	keyVersion: 1,
	verdicts: sequenceVerdicts,
	userAnswer: '2315',
	explanationText: null,
}

const acceptedFacts: Array<{ name: string; value: unknown }> = [
	{ name: 'полный факт', value: validFact },
	{
		name: 'факт без ключа',
		value: { ...validFact, key: null, keyVersion: null, verdicts: null, mistakes: null },
	},
	{ name: 'без ответа и с пояснением', value: { ...validFact, userAnswer: null, explanationText: 'Пояснение' } },
	{ name: 'ключ-объект', value: { ...validFact, key: { l1: 'r1' } } },
]

for (const row of acceptedFacts) {
	test(`ScoredQuestionFactSchema: принимает — ${row.name}`, () => {
		assert.deepEqual(ScoredQuestionFactSchema.parse(row.value), row.value)
	})
}

const rejectedFacts: Array<{ name: string; value: unknown }> = [
	{ name: 'questionId не uuid', value: { ...validFact, questionId: 'q1' } },
	{ name: 'неизвестный шаблон', value: { ...validFact, template: 'essay' } },
	{ name: 'неизвестная метрика', value: { ...validFact, metric: 'levenshtein' } },
	{ name: 'keyVersion 0', value: { ...validFact, keyVersion: 0 } },
	{ name: 'ключ с числом', value: { ...validFact, key: { l1: 1 } } },
	{ name: 'вердикты не по схеме', value: { ...validFact, verdicts: { ...sequenceVerdicts, mistakes: -1 } } },
	{ name: 'нет isCorrect', value: { ...validFact, isCorrect: undefined } },
	{ name: 'отрицательные ошибки', value: { ...validFact, mistakes: -1 } },
]

for (const row of rejectedFacts) {
	test(`ScoredQuestionFactSchema: отклоняет — ${row.name}`, () => {
		assert.equal(ScoredQuestionFactSchema.safeParse(row.value).success, false)
	})
}

test('AttemptFactsSchema: массив фактов', () => {
	assert.deepEqual(AttemptFactsSchema.parse([validFact]), [validFact])
	assert.equal(AttemptFactsSchema.safeParse([{ ...validFact, template: 'essay' }]).success, false)
	assert.equal(AttemptFactsSchema.safeParse({}).success, false)
})

test('LegacyAttemptResultItemSchema: принимает прежний элемент и сохраняет лишние поля', () => {
	const legacy = { ...validItem, questionId: 'q1', extra: 1 }
	assert.deepEqual(LegacyAttemptResultItemSchema.parse(legacy), legacy)
})

test('LegacyAttemptResultItemSchema: userAnswer, correctAnswer и explanationText необязательны', () => {
	const minimal = { questionId: Q1, isCorrect: false, points: 1, earnedPoints: 0 }
	assert.deepEqual(LegacyAttemptResultItemSchema.parse(minimal), minimal)
})

test('LegacyAttemptResultsSchema: отклоняет элемент без баллов и не-массив', () => {
	assert.equal(LegacyAttemptResultsSchema.safeParse([{ ...validItem, points: undefined }]).success, false)
	assert.equal(LegacyAttemptResultsSchema.safeParse({ results: [] }).success, false)
	assert.equal(LegacyAttemptResultsSchema.safeParse([]).success, true)
})

const validQuestionView = {
	...validItem,
	isCorrect: false,
	earnedPoints: 1,
	correctAnswer: '2314',
	status: 'partial',
	keyVisible: true,
	mistakes: 1,
	verdicts: sequenceVerdicts,
}

test('AttemptQuestionViewSchema: принимает вид с ключом и без ключа', () => {
	assert.deepEqual(AttemptQuestionViewSchema.parse(validQuestionView), validQuestionView)
	const hidden = { ...validQuestionView, correctAnswer: null, keyVisible: false, mistakes: null, verdicts: null }
	assert.deepEqual(AttemptQuestionViewSchema.parse(hidden), hidden)
})

test('AttemptQuestionViewSchema: отклоняет вид без status и с неизвестным статусом', () => {
	assert.equal(AttemptQuestionViewSchema.safeParse({ ...validQuestionView, status: undefined }).success, false)
	assert.equal(AttemptQuestionViewSchema.safeParse({ ...validQuestionView, status: 'skipped' }).success, false)
	assert.equal(AttemptQuestionViewSchema.safeParse({ ...validQuestionView, keyVisible: undefined }).success, false)
})

test('AttemptViewSchema: прежние поля submit плюс поля вида', () => {
	const view = { ...validResult, results: [validQuestionView] }
	assert.deepEqual(AttemptViewSchema.parse(view), view)
	assert.equal(SubmitResultSchema.safeParse(view).success, true)
	assert.equal(AttemptViewSchema.safeParse({ ...view, attemptId: 'x' }).success, false)
	assert.equal(AttemptViewSchema.safeParse({ ...view, results: [validItem] }).success, false)
})

test('AdminAttemptViewSchema: вид попытки плюс testId, userId, answers и telemetry', () => {
	const view = {
		...validResult,
		results: [validQuestionView],
		testId: ATTEMPT,
		userId: Q1,
		answers: { [Q1]: '2315' },
		telemetry: { [Q1]: { timeSpentMs: 1200, focusLossCount: 0, visitCount: 1 } },
	}
	assert.deepEqual(AdminAttemptViewSchema.parse(view), view)
	assert.deepEqual(AdminAttemptViewSchema.parse({ ...view, telemetry: null }).telemetry, null)
	assert.equal(AttemptViewSchema.safeParse(view).success, true)
	assert.equal(AdminAttemptViewSchema.safeParse({ ...view, testId: 'x' }).success, false)
	assert.equal(AdminAttemptViewSchema.safeParse({ ...view, userId: undefined }).success, false)
	assert.equal(AdminAttemptViewSchema.safeParse({ ...view, telemetry: undefined }).success, false)
	assert.equal(AdminAttemptViewSchema.safeParse({ ...view, answers: [] }).success, false)
})

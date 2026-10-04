import {
	allPartsCorrect,
	BUILTIN_QUESTION_TYPES,
	questionStatus,
	ScoredQuestionFactSchema,
	scoreQuestionFacts,
	type QuestionContent,
	type RuntimeQuestionTypeConfig,
} from '@bio-exam/exam-core'

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { describe, test } from 'vitest'

import { toStorableFact, type StorableFactWarning } from './storable-fact.js'
import { buildAttemptView, type AttemptViewer, type ReadableFact } from './view.js'

const TYPES: Record<string, RuntimeQuestionTypeConfig> = Object.fromEntries(
	BUILTIN_QUESTION_TYPES.map((item) => [
		item.key,
		{ key: item.key, uiTemplate: item.uiTemplate, scoringRule: item.scoringRule },
	])
)

const OPTIONS: QuestionContent = {
	options: [
		{ id: 'a', text: 'Митоз' },
		{ id: 'b', text: 'Мейоз' },
		{ id: 'c', text: 'Амитоз' },
		{ id: 'd', text: 'Эндомитоз' },
	],
}

const PAIRS: QuestionContent = {
	matchingPairs: {
		left: [
			{ id: 'l1', text: 'Хлоропласт' },
			{ id: 'l2', text: 'Митохондрия' },
			{ id: 'l3', text: 'Рибосома' },
		],
		right: [
			{ id: 'r1', text: 'Фотосинтез' },
			{ id: 'r2', text: 'Дыхание' },
			{ id: 'r3', text: 'Синтез белка' },
		],
	},
}

const MATCHING_KEY = { l1: 'r1', l2: 'r2', l3: 'r3' }

type Outcome = 'correct' | 'partial' | 'wrong'

type Row = { typeKey: string; outcome: Outcome; key: unknown; answer: unknown; content: QuestionContent }

const ROWS: Row[] = [
	{ typeKey: 'radio', outcome: 'correct', key: 'b', answer: 'b', content: OPTIONS },
	{ typeKey: 'radio', outcome: 'partial', key: 'b', answer: null, content: OPTIONS },
	{ typeKey: 'radio', outcome: 'wrong', key: 'b', answer: 'a', content: OPTIONS },
	{ typeKey: 'checkbox', outcome: 'correct', key: ['a', 'c'], answer: ['a', 'c'], content: OPTIONS },
	{ typeKey: 'checkbox', outcome: 'partial', key: ['a', 'c'], answer: ['a'], content: OPTIONS },
	{ typeKey: 'checkbox', outcome: 'wrong', key: ['a', 'c'], answer: ['b', 'd'], content: OPTIONS },
	{ typeKey: 'matching', outcome: 'correct', key: MATCHING_KEY, answer: MATCHING_KEY, content: PAIRS },
	{
		typeKey: 'matching',
		outcome: 'partial',
		key: MATCHING_KEY,
		answer: { l1: 'r1', l2: 'r2', l3: 'r1' },
		content: PAIRS,
	},
	{
		typeKey: 'matching',
		outcome: 'wrong',
		key: MATCHING_KEY,
		answer: { l1: 'r2', l2: 'r3', l3: 'r1' },
		content: PAIRS,
	},
	{ typeKey: 'short_answer', outcome: 'correct', key: 'Митоз', answer: 'Митоз', content: {} },
	{ typeKey: 'short_answer', outcome: 'partial', key: 'Митоз', answer: null, content: {} },
	{ typeKey: 'short_answer', outcome: 'wrong', key: 'Митоз', answer: 'Мейоз', content: {} },
	{ typeKey: 'sequence', outcome: 'correct', key: '2314', answer: '2314', content: {} },
	{ typeKey: 'sequence', outcome: 'partial', key: '2314', answer: '2315', content: {} },
	{ typeKey: 'sequence', outcome: 'wrong', key: '2314', answer: '4132', content: {} },
]

const VIEWERS: Record<'admin' | 'student_with_key' | 'student_without_key', AttemptViewer> = {
	admin: { kind: 'admin' },
	student_with_key: { kind: 'student', showCorrectAnswer: true },
	student_without_key: { kind: 'student', showCorrectAnswer: false },
}

const ATTEMPT = {
	id: crypto.randomUUID(),
	submittedAt: '2026-10-04T10:00:00.000Z',
	earnedPoints: 1,
	totalPoints: 2,
	scorePercentage: 50,
	passed: false,
}

function factOf(row: Row): ReadableFact {
	const scored = scoreQuestionFacts({
		typeConfig: TYPES[row.typeKey]!,
		rawKey: row.key,
		userAnswer: row.answer,
		fallbackMaxPoints: 1,
		content: row.content,
	})
	return {
		questionId: crypto.randomUUID(),
		points: scored.points,
		earnedPoints: scored.earnedPoints,
		isCorrect: scored.isCorrect,
		userAnswer: row.answer,
		explanationText: null,
		key: scored.key,
		verdicts: scored.verdicts,
		mistakes: scored.mistakes,
	}
}

function viewOf(fact: ReadableFact, viewer: AttemptViewer) {
	const view = buildAttemptView({ attempt: ATTEMPT, facts: [fact], viewer })
	const [question] = view.results
	assert.ok(question)
	return question
}

const TABLE = Object.keys(VIEWERS).flatMap((viewerName) =>
	ROWS.map((row) => ({ viewerName: viewerName as keyof typeof VIEWERS, ...row }))
)

describe('buildAttemptView: 3 зрителя × 5 шаблонов × 3 исхода', () => {
	test('в таблице 45 строк, исходы соответствуют фактам', () => {
		assert.equal(TABLE.length, 45)
		for (const row of ROWS) {
			const fact = factOf(row)
			assert.equal(fact.isCorrect, row.outcome === 'correct', `${row.typeKey} ${row.outcome}`)
			if (row.outcome === 'wrong') assert.equal(fact.earnedPoints, 0, `${row.typeKey} wrong`)
		}
	})

	test.each(TABLE)('$viewerName, $typeKey, $outcome', (row) => {
		const fact = factOf(row)
		const question = viewOf(fact, VIEWERS[row.viewerName])
		assert.equal(question.status, questionStatus(fact))
		assert.equal(question.isCorrect, fact.isCorrect)
		assert.equal(question.points, fact.points)
		assert.equal(question.earnedPoints, fact.earnedPoints)
		assert.deepEqual(question.userAnswer, fact.userAnswer)
		assert.ok(fact.key !== null && fact.verdicts !== null)

		if (row.viewerName === 'admin') {
			assert.equal(question.keyVisible, true)
			assert.deepEqual(question.correctAnswer, fact.key)
			assert.deepEqual(question.verdicts, fact.verdicts)
			assert.equal(question.mistakes, fact.mistakes)
			return
		}

		if (row.viewerName === 'student_with_key') {
			assert.equal(question.keyVisible, true)
			assert.deepEqual(question.correctAnswer, row.outcome === 'correct' ? null : fact.key)
			assert.deepEqual(question.verdicts, fact.verdicts)
			assert.equal(question.mistakes, fact.mistakes)
			return
		}

		assert.equal(question.keyVisible, false)
		assert.equal(question.correctAnswer, null)
		if (row.outcome === 'correct') {
			assert.equal(question.mistakes, 0)
			assert.ok(question.verdicts)
			assert.equal(allPartsCorrect(question.verdicts), true)
			assert.deepEqual(question.verdicts, fact.verdicts)
		} else {
			assert.equal(question.verdicts, null)
			assert.equal(question.mistakes, null)
		}
	})

	test('статус у всех зрителей одинаков', () => {
		for (const row of ROWS) {
			const fact = factOf(row)
			const statuses = Object.values(VIEWERS).map((viewer) => viewOf(fact, viewer).status)
			assert.deepEqual(new Set(statuses), new Set([questionStatus(fact)]), `${row.typeKey} ${row.outcome}`)
		}
	})

	test('факт с points 0 даёт ungraded при isCorrect true у всех зрителей', () => {
		const fact = { ...factOf(ROWS[0]!), points: 0, earnedPoints: 0 }
		assert.equal(fact.isCorrect, true)
		for (const viewer of Object.values(VIEWERS)) assert.equal(viewOf(fact, viewer).status, 'ungraded')
	})

	test('студент без ключа при верном ответе без вердиктов получает verdicts null и mistakes 0', () => {
		const fact = { ...factOf(ROWS[12]!), verdicts: null, mistakes: null }
		const question = viewOf(fact, VIEWERS.student_without_key)
		assert.equal(question.verdicts, null)
		assert.equal(question.mistakes, 0)
		assert.equal(question.keyVisible, false)
	})

	test('ключ неизвестен: keyVisible false у администратора и студента с ключом', () => {
		const fact = { ...factOf(ROWS[14]!), key: null, verdicts: null, mistakes: null }
		for (const viewer of [VIEWERS.admin, VIEWERS.student_with_key]) {
			const question = viewOf(fact, viewer)
			assert.equal(question.keyVisible, false)
			assert.equal(question.correctAnswer, null)
		}
	})
})

function sequenceCandidate(): Record<string, unknown> {
	const row = ROWS[13]!
	const scored = scoreQuestionFacts({
		typeConfig: TYPES[row.typeKey]!,
		rawKey: row.key,
		userAnswer: row.answer,
		fallbackMaxPoints: 1,
		content: row.content,
	})
	return {
		questionId: '11111111-1111-4111-8111-111111111111',
		template: scored.template,
		metric: scored.metric,
		points: scored.points,
		earnedPoints: scored.earnedPoints,
		isCorrect: scored.isCorrect,
		mistakes: scored.mistakes,
		key: scored.key,
		keyVersion: 1,
		verdicts: scored.verdicts,
		userAnswer: row.answer,
		explanationText: null,
	}
}

function collect() {
	const calls: StorableFactWarning[] = []
	return { calls, warn: (info: StorableFactWarning) => calls.push(info) }
}

describe('toStorableFact', () => {
	test('факт по схеме возвращается без изменений, warn не вызван', () => {
		const candidate = sequenceCandidate()
		const { calls, warn } = collect()
		assert.deepEqual(toStorableFact(candidate, warn), candidate)
		assert.equal(calls.length, 0)
	})

	test('вердикты не по схеме: verdicts и mistakes null, ключ и баллы сохранены, одно предупреждение', () => {
		const candidate = sequenceCandidate()
		const verdicts = candidate.verdicts as Record<string, unknown>
		const broken = { ...candidate, verdicts: { ...verdicts, mistakes: -1 } }
		const { calls, warn } = collect()
		const stored = toStorableFact(broken, warn)
		assert.equal(stored.verdicts, null)
		assert.equal(stored.mistakes, null)
		assert.equal(stored.key, '2314')
		assert.equal(stored.keyVersion, 1)
		assert.equal(stored.points, candidate.points)
		assert.equal(stored.earnedPoints, candidate.earnedPoints)
		assert.equal(stored.isCorrect, candidate.isCorrect)
		assert.equal(calls.length, 1)
		assert.deepEqual(calls[0]?.dropped, ['verdicts', 'mistakes'])
		assert.equal(calls[0]?.questionId, candidate.questionId)
		assert.equal(calls[0]?.template, 'sequence_digits')
		assert.ok(calls[0]?.issues.includes('verdicts.mistakes'))
		assert.equal(JSON.stringify(calls).includes('2315'), false)
		assert.equal(JSON.stringify(calls).includes('2314'), false)
		assert.deepEqual(ScoredQuestionFactSchema.parse(stored), stored)
	})

	test('ключ не по схеме: ещё и key, keyVersion null, одно предупреждение без содержимого', () => {
		const candidate = sequenceCandidate()
		const verdicts = candidate.verdicts as Record<string, unknown>
		const broken = { ...candidate, verdicts: { ...verdicts, mistakes: -1 }, key: { value: 2314 } }
		const { calls, warn } = collect()
		const stored = toStorableFact(broken, warn)
		assert.equal(stored.verdicts, null)
		assert.equal(stored.mistakes, null)
		assert.equal(stored.key, null)
		assert.equal(stored.keyVersion, null)
		assert.equal(stored.earnedPoints, candidate.earnedPoints)
		assert.equal(calls.length, 1)
		assert.deepEqual(calls[0]?.dropped, ['verdicts', 'mistakes', 'key', 'keyVersion'])
		assert.equal(JSON.stringify(calls).includes('2315'), false)
		assert.equal(JSON.stringify(calls).includes('2314'), false)
		assert.deepEqual(ScoredQuestionFactSchema.parse(stored), stored)
	})

	test('базовые поля не по схеме: бросок без данных факта', () => {
		const candidate = { ...sequenceCandidate(), earnedPoints: 'два' }
		const { calls, warn } = collect()
		assert.throws(
			() => toStorableFact(candidate, warn),
			(error: unknown) => error instanceof Error && !error.message.includes('2315') && !error.message.includes('два')
		)
		assert.equal(calls.length, 0)
	})
})

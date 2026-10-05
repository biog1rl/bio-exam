import assert from 'node:assert/strict'
import { describe, test } from 'vitest'

import {
	computeAttemptOutcome,
	projectionOf,
	REVIEW_STATUSES,
	type AttemptOutcome,
	type OutcomeFact,
	type OutcomeProjection,
} from './outcome'

function auto(questionId: string, points: number, earnedPoints: number): OutcomeFact {
	return { questionId, points, earnedPoints }
}

function open(questionId: string, points = 3): OutcomeFact {
	return { questionId, template: 'open', points, earnedPoints: 0 }
}

function scores(entries: Array<[string, number]> = []): ReadonlyMap<string, number> {
	return new Map(entries)
}

function factsFormula(earned: number, total: number, passingScore: number | null) {
	const scorePercentage = total > 0 ? (earned / total) * 100 : 0
	const passed = passingScore == null ? true : scorePercentage >= Number(passingScore)
	return { scorePercentage, passed }
}

type NoneRow = {
	name: string
	facts: OutcomeFact[]
	passingScore: number | null
	earned: number
	total: number
}

const noneRows: NoneRow[] = [
	{ name: '2 из 2, порог 60', facts: [auto('a', 1, 1), auto('b', 1, 1)], passingScore: 60, earned: 2, total: 2 },
	{ name: '1 из 2, порог 60', facts: [auto('a', 1, 1), auto('b', 1, 0)], passingScore: 60, earned: 1, total: 2 },
	{ name: '0 из 1, без порога', facts: [auto('a', 1, 0)], passingScore: null, earned: 0, total: 1 },
	{ name: 'вес 0, без порога', facts: [auto('a', 0, 0)], passingScore: null, earned: 0, total: 0 },
	{ name: 'вес 0, порог 50', facts: [auto('a', 0, 0)], passingScore: 50, earned: 0, total: 0 },
	{ name: 'нет фактов, порог 50', facts: [], passingScore: 50, earned: 0, total: 0 },
	{ name: 'дробные 1.5 из 4', facts: [auto('a', 2, 1.5), auto('b', 2, 0)], passingScore: 30, earned: 1.5, total: 4 },
	{ name: 'порог ровно на границе', facts: [auto('a', 2, 1), auto('b', 2, 1)], passingScore: 50, earned: 2, total: 4 },
]

describe('computeAttemptOutcome: none', () => {
	test.each(noneRows)('$name', (row) => {
		const outcome = computeAttemptOutcome({ facts: row.facts, finalScores: scores(), passingScore: row.passingScore })
		const expected = factsFormula(row.earned, row.total, row.passingScore)

		assert.equal(outcome.reviewStatus, 'none')
		assert.deepEqual(outcome.submitted, {
			earnedPoints: row.earned,
			totalPoints: row.total,
			scorePercentage: expected.scorePercentage,
			passed: expected.passed,
		})
		assert.equal(outcome.autoEarnedPoints, row.earned)
		assert.equal(outcome.autoTotalPoints, row.total)
		assert.deepEqual(outcome.final, {
			earnedPoints: row.earned,
			scorePercentage: expected.scorePercentage,
			passed: expected.passed,
		})
	})

	test('вес 0 даёт 0 %, порог null даёт passed = true, порог 50 даёт false', () => {
		const facts = [auto('a', 0, 0)]
		const withoutThreshold = computeAttemptOutcome({ facts, finalScores: scores(), passingScore: null })
		const withThreshold = computeAttemptOutcome({ facts, finalScores: scores(), passingScore: 50 })

		assert.equal(withoutThreshold.submitted.scorePercentage, 0)
		assert.equal(withoutThreshold.submitted.passed, true)
		assert.equal(withThreshold.submitted.passed, false)
	})

	test('суммирование идёт в порядке фактов', () => {
		const facts = [auto('a', 0.1, 0.1), auto('b', 0.2, 0.2), auto('c', 0.3, 0.3)]
		const outcome = computeAttemptOutcome({ facts, finalScores: scores(), passingScore: null })

		assert.equal(outcome.submitted.totalPoints, 0.1 + 0.2 + 0.3)
		assert.equal(outcome.submitted.earnedPoints, 0.1 + 0.2 + 0.3)
	})

	test('оценки без открытых фактов игнорируются', () => {
		const outcome = computeAttemptOutcome({
			facts: [auto('a', 1, 1)],
			finalScores: scores([['a', 99]]),
			passingScore: null,
		})

		assert.equal(outcome.reviewStatus, 'none')
		assert.equal(outcome.final?.earnedPoints, 1)
	})
})

type OpenRow = {
	name: string
	facts: OutcomeFact[]
	finalScores: Array<[string, number]>
	passingScore: number | null
	expected: AttemptOutcome
}

const openRows: OpenRow[] = [
	{
		name: 'открытый без оценки: pending',
		facts: [auto('a', 1, 1), auto('b', 1, 0), open('o')],
		finalScores: [],
		passingScore: 60,
		expected: {
			reviewStatus: 'pending',
			submitted: { earnedPoints: 1, totalPoints: 5, scorePercentage: 20, passed: false },
			autoEarnedPoints: 1,
			autoTotalPoints: 2,
			final: null,
		},
	},
	{
		name: 'открытый оценён в 2: graded',
		facts: [auto('a', 1, 1), auto('b', 1, 0), open('o')],
		finalScores: [['o', 2]],
		passingScore: 60,
		expected: {
			reviewStatus: 'graded',
			submitted: { earnedPoints: 1, totalPoints: 5, scorePercentage: 20, passed: false },
			autoEarnedPoints: 1,
			autoTotalPoints: 2,
			final: { earnedPoints: 3, scorePercentage: 60, passed: true },
		},
	},
	{
		name: 'системный 0: graded',
		facts: [auto('a', 1, 1), open('o')],
		finalScores: [['o', 0]],
		passingScore: 50,
		expected: {
			reviewStatus: 'graded',
			submitted: { earnedPoints: 1, totalPoints: 4, scorePercentage: 25, passed: false },
			autoEarnedPoints: 1,
			autoTotalPoints: 1,
			final: { earnedPoints: 1, scorePercentage: 25, passed: false },
		},
	},
	{
		name: 'два открытых, оценён один: pending',
		facts: [auto('a', 1, 1), open('o1'), open('o2')],
		finalScores: [['o1', 3]],
		passingScore: null,
		expected: {
			reviewStatus: 'pending',
			submitted: { earnedPoints: 1, totalPoints: 7, scorePercentage: (1 / 7) * 100, passed: true },
			autoEarnedPoints: 1,
			autoTotalPoints: 1,
			final: null,
		},
	},
	{
		name: 'два открытых оценены: graded',
		facts: [auto('a', 1, 1), open('o1'), open('o2')],
		finalScores: [
			['o1', 3],
			['o2', 1.5],
		],
		passingScore: 50,
		expected: {
			reviewStatus: 'graded',
			submitted: { earnedPoints: 1, totalPoints: 7, scorePercentage: (1 / 7) * 100, passed: false },
			autoEarnedPoints: 1,
			autoTotalPoints: 1,
			final: { earnedPoints: 1 + (3 + 1.5), scorePercentage: ((1 + 4.5) / 7) * 100, passed: true },
		},
	},
	{
		name: 'только открытые без оценки: pending',
		facts: [open('o')],
		finalScores: [],
		passingScore: 50,
		expected: {
			reviewStatus: 'pending',
			submitted: { earnedPoints: 0, totalPoints: 3, scorePercentage: 0, passed: false },
			autoEarnedPoints: 0,
			autoTotalPoints: 0,
			final: null,
		},
	},
	{
		name: 'только открытые оценены: graded',
		facts: [open('o')],
		finalScores: [['o', 3]],
		passingScore: 50,
		expected: {
			reviewStatus: 'graded',
			submitted: { earnedPoints: 0, totalPoints: 3, scorePercentage: 0, passed: false },
			autoEarnedPoints: 0,
			autoTotalPoints: 0,
			final: { earnedPoints: 3, scorePercentage: 100, passed: true },
		},
	},
	{
		name: 'порог null: graded сдан при 0 из 3',
		facts: [open('o')],
		finalScores: [['o', 0]],
		passingScore: null,
		expected: {
			reviewStatus: 'graded',
			submitted: { earnedPoints: 0, totalPoints: 3, scorePercentage: 0, passed: true },
			autoEarnedPoints: 0,
			autoTotalPoints: 0,
			final: { earnedPoints: 0, scorePercentage: 0, passed: true },
		},
	},
	{
		name: 'вес 0 у открытого: 0 %',
		facts: [auto('a', 0, 0), open('o', 0)],
		finalScores: [['o', 0]],
		passingScore: 50,
		expected: {
			reviewStatus: 'graded',
			submitted: { earnedPoints: 0, totalPoints: 0, scorePercentage: 0, passed: false },
			autoEarnedPoints: 0,
			autoTotalPoints: 0,
			final: { earnedPoints: 0, scorePercentage: 0, passed: false },
		},
	},
	{
		name: 'оценка чужого id игнорируется',
		facts: [auto('a', 1, 1), open('o')],
		finalScores: [
			['a', 3],
			['stranger', 3],
		],
		passingScore: null,
		expected: {
			reviewStatus: 'pending',
			submitted: { earnedPoints: 1, totalPoints: 4, scorePercentage: 25, passed: true },
			autoEarnedPoints: 1,
			autoTotalPoints: 1,
			final: null,
		},
	},
]

describe('computeAttemptOutcome: открытые вопросы', () => {
	test.each(openRows)('$name', (row) => {
		const outcome = computeAttemptOutcome({
			facts: row.facts,
			finalScores: scores(row.finalScores),
			passingScore: row.passingScore,
		})

		assert.deepEqual(outcome, row.expected)
	})
})

describe('computeAttemptOutcome: оценка вне диапазона', () => {
	test.each([
		{ name: 'минус 1', score: -1 },
		{ name: 'больше максимума', score: 4 },
		{ name: 'NaN', score: Number.NaN },
		{ name: 'Infinity', score: Number.POSITIVE_INFINITY },
	])('$name: RangeError', ({ score }) => {
		assert.throws(
			() => computeAttemptOutcome({ facts: [open('o')], finalScores: scores([['o', score]]), passingScore: null }),
			(error: unknown) => error instanceof RangeError && error.message.includes('o')
		)
	})

	test('граничные 0 и points проходят', () => {
		for (const score of [0, 3]) {
			const outcome = computeAttemptOutcome({
				facts: [open('o')],
				finalScores: scores([['o', score]]),
				passingScore: null,
			})
			assert.equal(outcome.reviewStatus, 'graded')
		}
	})

	test('недопустимая оценка чужого id не бросает', () => {
		const outcome = computeAttemptOutcome({
			facts: [auto('a', 1, 1)],
			finalScores: scores([['stranger', -5]]),
			passingScore: null,
		})
		assert.equal(outcome.reviewStatus, 'none')
	})
})

type ProjectionRow = {
	name: string
	facts: OutcomeFact[]
	finalScores: Array<[string, number]>
	passingScore: number | null
	expected: OutcomeProjection
}

const projectionRows: ProjectionRow[] = [
	{
		name: 'none',
		facts: [auto('a', 1, 1), auto('b', 1, 0)],
		finalScores: [],
		passingScore: 40,
		expected: {
			reviewStatus: 'none',
			finalEarnedPoints: 1,
			finalScorePercentage: 50,
			finalPassed: true,
			autoTotalPoints: 2,
		},
	},
	{
		name: 'pending',
		facts: [auto('a', 1, 1), open('o')],
		finalScores: [],
		passingScore: 40,
		expected: {
			reviewStatus: 'pending',
			finalEarnedPoints: null,
			finalScorePercentage: null,
			finalPassed: null,
			autoTotalPoints: 1,
		},
	},
	{
		name: 'graded',
		facts: [auto('a', 1, 1), open('o')],
		finalScores: [['o', 2]],
		passingScore: 70,
		expected: {
			reviewStatus: 'graded',
			finalEarnedPoints: 3,
			finalScorePercentage: 75,
			finalPassed: true,
			autoTotalPoints: 1,
		},
	},
	{
		name: 'graded с системным 0',
		facts: [auto('a', 1, 1), open('o')],
		finalScores: [['o', 0]],
		passingScore: 70,
		expected: {
			reviewStatus: 'graded',
			finalEarnedPoints: 1,
			finalScorePercentage: 25,
			finalPassed: false,
			autoTotalPoints: 1,
		},
	},
	{
		name: 'pending, только открытые',
		facts: [open('o')],
		finalScores: [],
		passingScore: null,
		expected: {
			reviewStatus: 'pending',
			finalEarnedPoints: null,
			finalScorePercentage: null,
			finalPassed: null,
			autoTotalPoints: 0,
		},
	},
]

describe('projectionOf равна пересчёту', () => {
	test.each(projectionRows)('$name', (row) => {
		const outcome = computeAttemptOutcome({
			facts: row.facts,
			finalScores: scores(row.finalScores),
			passingScore: row.passingScore,
		})

		assert.deepEqual(projectionOf(outcome), row.expected)
		assert.ok(REVIEW_STATUSES.includes(projectionOf(outcome).reviewStatus))
	})

	test('null в проекции ровно при pending', () => {
		const pending = projectionOf(
			computeAttemptOutcome({ facts: [open('o')], finalScores: scores(), passingScore: null })
		)
		const graded = projectionOf(
			computeAttemptOutcome({ facts: [open('o')], finalScores: scores([['o', 1]]), passingScore: null })
		)

		assert.equal(pending.finalEarnedPoints, null)
		assert.notEqual(graded.finalEarnedPoints, null)
	})
})

import { computeAttemptOutcome, projectionOf, type OutcomeFact } from '@bio-exam/exam-core'

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { afterAll, afterEach, beforeAll, describe, test } from 'vitest'

import { insertAttemptFixture, type AttemptFixtureFact } from '../../test-support/attempt-fixture.js'
import {
	addQuestion,
	assignTest,
	createAttemptTest,
	seedAttemptWorld,
	seedStudent,
	startSession,
	submitAttempt,
	type AttemptWorld,
} from '../../test-support/attempt-world.js'
import { startAuthApp, type AuthApp } from '../../test-support/auth-app.js'

type OutcomeModule = typeof import('./outcome.js')
type ReadModule = typeof import('./read.js')

type StoredRow = {
	review_status: string
	final_earned_points: number | null
	final_score_percentage: number | null
	final_passed: boolean | null
	auto_total_points: number
	graded_at: Date | null
	earned_points: number
	total_points: number
	score_percentage: number
	passed: boolean
	facts: unknown
}

const PASSING_SCORE = 60

let ctx: AuthApp
let world: AttemptWorld
let student: { id: string; cookie: string }
let testId = ''
let outcomeModule: OutcomeModule
let readModule: ReadModule

const noScores = async () => new Map<string, Map<string, number>>()

function fact(template: AttemptFixtureFact['template'], points: number, earnedPoints: number): AttemptFixtureFact {
	return { questionId: crypto.randomUUID(), template, points, earnedPoints }
}

async function rowOf(attemptId: string): Promise<StoredRow> {
	const result = await ctx.pgPool.query<StoredRow>(
		`SELECT review_status, final_earned_points, final_score_percentage, final_passed, auto_total_points, graded_at,
			earned_points, total_points, score_percentage, passed,
			jsonb_build_array(answers, results, results_version) AS facts
		FROM test_attempts WHERE id = $1`,
		[attemptId]
	)
	const row = result.rows[0]
	assert.ok(row, `attempt ${attemptId} not found`)
	return row
}

function insert(facts: AttemptFixtureFact[], finalScores?: Map<string, number>): Promise<string> {
	return insertAttemptFixture(ctx.pgPool, {
		testId,
		userId: student.id,
		outcomeFacts: facts,
		finalScores,
		passingScore: PASSING_SCORE,
	})
}

function loaderOf(scores: Record<string, Map<string, number>>) {
	return async () => new Map(Object.entries(scores))
}

function assertSameNumber(actual: number | null, expected: number | null, label: string): void {
	if (actual === null || expected === null) return assert.equal(actual, expected, label)
	assert.equal(Math.fround(actual), Math.fround(expected), label)
}

function assertProjectionEqualsRecompute(
	row: StoredRow,
	facts: OutcomeFact[],
	finalScores: Map<string, number>,
	label: string
): void {
	const expected = projectionOf(computeAttemptOutcome({ facts, finalScores, passingScore: PASSING_SCORE }))
	assert.equal(row.review_status, expected.reviewStatus, `${label}: review_status`)
	assertSameNumber(row.final_earned_points, expected.finalEarnedPoints, `${label}: final_earned_points`)
	assertSameNumber(row.final_score_percentage, expected.finalScorePercentage, `${label}: final_score_percentage`)
	assert.equal(row.final_passed, expected.finalPassed, `${label}: final_passed`)
	assertSameNumber(row.auto_total_points, expected.autoTotalPoints, `${label}: auto_total_points`)
}

beforeAll(async () => {
	ctx = await startAuthApp('test_scored_outcome')
	world = await seedAttemptWorld(ctx, 'sco')
	student = await seedStudent(world, 'sco_student')
	testId = await createAttemptTest(world, { slug: 'sco-test' })
	await ctx.db
		.update(ctx.schema.tests)
		.set({ passingScore: PASSING_SCORE })
		.where((await import('drizzle-orm')).eq(ctx.schema.tests.id, testId))
	outcomeModule = await import('./outcome.js')
	readModule = await import('./read.js')
})

afterEach(async () => {
	await ctx.pgPool.query('DELETE FROM test_attempts')
})

afterAll(async () => {
	await ctx.stop()
})

describe('проекция равна пересчёту и фактам', () => {
	test('новая сдача: none, итог равен фактам, сверка пуста', async () => {
		const questionId = await addQuestion(world, testId, 'radio')
		await assignTest(world, testId, student.id)
		const started = await startSession(world, student.cookie, testId)
		assert.equal(started.status, 200)
		const reply = await submitAttempt(world, student.cookie, testId, {
			sessionId: started.body.sessionId,
			clientAttemptId: crypto.randomUUID(),
			answers: { [questionId]: 'b' },
		})
		assert.equal(reply.status, 200)
		assert.equal(reply.body.reviewStatus, 'none')
		const attemptId = reply.body.attemptId as string
		const row = await rowOf(attemptId)
		assert.equal(row.review_status, 'none')
		assertSameNumber(row.final_earned_points, row.earned_points, 'final_earned_points')
		assertSameNumber(row.final_score_percentage, row.score_percentage, 'final_score_percentage')
		assert.equal(row.final_passed, row.passed)
		assertSameNumber(row.auto_total_points, row.total_points, 'auto_total_points')
		const facts = await readModule.readFacts({
			attemptId,
			testId,
			results: (row.facts as unknown[])[1],
			resultsVersion: (row.facts as unknown[])[2] as number,
		})
		assertProjectionEqualsRecompute(row, facts, new Map(), 'сдача')
	})

	test.each([
		{
			name: 'три radio 1, 1, 0 из 1 (66,666…%)',
			facts: () => [fact('single_choice', 1, 1), fact('single_choice', 1, 1), fact('single_choice', 1, 0)],
			scores: (_facts: AttemptFixtureFact[]) => new Map<string, number>(),
			status: 'none',
		},
		{
			name: 'открытый вопрос с оценкой 1 из 3 (33,333…%)',
			facts: () => [fact('open', 3, 0)],
			scores: (facts: AttemptFixtureFact[]) => new Map([[facts[0]!.questionId, 1]]),
			status: 'graded',
		},
		{
			name: 'один радио и один открытый без оценки',
			facts: () => [fact('single_choice', 1, 1), fact('open', 3, 0)],
			scores: (_facts: AttemptFixtureFact[]) => new Map<string, number>(),
			status: 'pending',
		},
	])('строка режима outcomeFacts: $name', async ({ facts: makeFacts, scores, status }) => {
		const facts = makeFacts()
		const finalScores = scores(facts)
		const attemptId = await insert(facts, finalScores)
		const row = await rowOf(attemptId)
		assert.equal(row.review_status, status)
		assertProjectionEqualsRecompute(row, facts, finalScores, status)
		const readable = await readModule.readFacts({
			attemptId,
			testId,
			results: (row.facts as unknown[])[1],
			resultsVersion: (row.facts as unknown[])[2] as number,
		})
		assert.deepEqual(
			readable.map((item) => item.template),
			facts.map((item) => item.template)
		)
		const report = await outcomeModule.reconcileOutcomes({
			loadLatestScores: loaderOf({ [attemptId]: finalScores }),
		})
		assert.deepEqual(
			report.mismatched.filter((item) => item.attemptId === attemptId),
			[]
		)
	})

	test('засеянная попытка с открытым ответом: pending, итог NULL, автобаллы без открытого', async () => {
		const attemptId = await insert([fact('single_choice', 1, 1), fact('open', 3, 0)])
		const row = await rowOf(attemptId)
		assert.equal(row.review_status, 'pending')
		assert.equal(row.final_earned_points, null)
		assert.equal(row.final_score_percentage, null)
		assert.equal(row.final_passed, null)
		assert.equal(row.graded_at, null)
		assert.equal(row.auto_total_points, 1)
		assert.equal(row.total_points, 4)
	})
})

describe('materializeAttemptOutcome', () => {
	test.each([
		{ grade: 2, percentage: 75, passed: true },
		{ grade: 0, percentage: 25, passed: false },
	])('оценка $grade: graded, итог по формуле, факты не изменились', async ({ grade, percentage, passed }) => {
		const open = fact('open', 3, 0)
		const attemptId = await insert([fact('single_choice', 1, 1), open])
		const before = await rowOf(attemptId)
		const outcome = await ctx.db.transaction((tx) =>
			outcomeModule.materializeAttemptOutcome(tx, {
				attemptId,
				latestScores: new Map([[open.questionId, grade]]),
			})
		)
		assert.equal(outcome.reviewStatus, 'graded')
		const after = await rowOf(attemptId)
		assert.equal(after.review_status, 'graded')
		assert.equal(after.final_earned_points, 1 + grade)
		assert.equal(after.final_score_percentage, percentage)
		assert.equal(after.final_passed, passed)
		assert.ok(after.graded_at instanceof Date)
		assert.deepEqual(after.facts, before.facts)
		assert.equal(after.earned_points, before.earned_points)
		assert.equal(after.total_points, before.total_points)
		assert.equal(after.score_percentage, before.score_percentage)
		assert.equal(after.passed, before.passed)
	})

	test('оценка вне диапазона отвергается, проекция не меняется', async () => {
		const open = fact('open', 3, 0)
		const attemptId = await insert([open])
		await assert.rejects(
			ctx.db.transaction((tx) =>
				outcomeModule.materializeAttemptOutcome(tx, { attemptId, latestScores: new Map([[open.questionId, 4]]) })
			),
			RangeError
		)
		assert.equal((await rowOf(attemptId)).review_status, 'pending')
	})

	test('несуществующая попытка', async () => {
		await assert.rejects(
			ctx.db.transaction((tx) =>
				outcomeModule.materializeAttemptOutcome(tx, { attemptId: crypto.randomUUID(), latestScores: new Map() })
			),
			/not found/
		)
	})
})

describe('reconcileOutcomes', () => {
	test('порча final_score_percentage находится и чинится, порциями по 2', async () => {
		const open = fact('open', 3, 0)
		const gradedId = await insert([fact('single_choice', 1, 1), open])
		await ctx.db.transaction((tx) =>
			outcomeModule.materializeAttemptOutcome(tx, {
				attemptId: gradedId,
				latestScores: new Map([[open.questionId, 2]]),
			})
		)
		await insert([fact('single_choice', 1, 1)])
		await insert([fact('single_choice', 1, 0)])
		const loadLatestScores = loaderOf({ [gradedId]: new Map([[open.questionId, 2]]) })

		const clean = await outcomeModule.reconcileOutcomes({ loadLatestScores, batchSize: 2 })
		assert.ok(clean.checked >= 3)
		assert.deepEqual(clean.mismatched, [])

		await ctx.pgPool.query('UPDATE test_attempts SET final_score_percentage = 10 WHERE id = $1', [gradedId])
		const found = await outcomeModule.reconcileOutcomes({ loadLatestScores, batchSize: 2 })
		assert.deepEqual(
			found.mismatched.map((item) => item.attemptId),
			[gradedId]
		)
		assert.equal(found.repaired, 0)

		const repaired = await outcomeModule.reconcileOutcomes({ loadLatestScores, repair: true, batchSize: 2 })
		assert.equal(repaired.repaired, 1)
		assert.equal((await rowOf(gradedId)).final_score_percentage, 75)
		assert.deepEqual((await outcomeModule.reconcileOutcomes({ loadLatestScores })).mismatched, [])
	})

	test('none: порча final_passed чинится фактами, смена tests.passing_score расхождения не даёт', async () => {
		const attemptId = await insertAttemptFixture(ctx.pgPool, {
			testId,
			userId: student.id,
			earnedPoints: 1,
			totalPoints: 2,
			scorePercentage: 50,
			passed: false,
			passingScore: PASSING_SCORE,
		})
		await ctx.pgPool.query('UPDATE tests SET passing_score = 10 WHERE id = $1', [testId])
		assert.deepEqual((await outcomeModule.reconcileOutcomes({ loadLatestScores: noScores })).mismatched, [])

		await ctx.pgPool.query('UPDATE test_attempts SET final_passed = true WHERE id = $1', [attemptId])
		const repaired = await outcomeModule.reconcileOutcomes({ loadLatestScores: noScores, repair: true })
		assert.deepEqual(
			repaired.mismatched.map((item) => item.attemptId),
			[attemptId]
		)
		assert.equal(repaired.repaired, 1)
		assert.equal((await rowOf(attemptId)).final_passed, false)
		assert.deepEqual((await outcomeModule.reconcileOutcomes({ loadLatestScores: noScores })).mismatched, [])
	})
})

describe('CHECK проекции', () => {
	test('pending при непустом итоге отвергается кодом 23514', async () => {
		const attemptId = await insert([fact('single_choice', 1, 1)])
		await assert.rejects(
			ctx.pgPool.query(`UPDATE test_attempts SET review_status = 'pending' WHERE id = $1`, [attemptId]),
			{
				code: '23514',
			}
		)
	})
})

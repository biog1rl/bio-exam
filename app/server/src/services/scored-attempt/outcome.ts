import { computeAttemptOutcome, projectionOf, type AttemptOutcome } from '@bio-exam/exam-core'

import { asc, eq, gt, sql } from 'drizzle-orm'

import { db, type DB } from '../../db/index.js'
import { testAttempts } from '../../db/schema.js'
import { readOutcomeFacts } from './read.js'

export type DbTransaction = Parameters<Parameters<DB['transaction']>[0]>[0]

export type LatestScores = ReadonlyMap<string, number>

export type LoadLatestScores = (attemptIds: readonly string[]) => Promise<ReadonlyMap<string, LatestScores>>

export type OutcomeMismatch = { attemptId: string; stored: unknown; expected: unknown }

export type ReconcileResult = { checked: number; mismatched: OutcomeMismatch[]; repaired: number }

const DEFAULT_BATCH_SIZE = 500

const NO_SCORES: LatestScores = new Map()

type ProjectionValues = {
	reviewStatus: string
	finalEarnedPoints: number | null
	finalScorePercentage: number | null
	finalPassed: boolean | null
	autoTotalPoints: number
}

type OutcomeRow = {
	id: string
	results: unknown
	resultsVersion: number
	passingScore: number | null
}

function factsOfRow(row: OutcomeRow) {
	return readOutcomeFacts({ attemptId: row.id, results: row.results, resultsVersion: row.resultsVersion })
}

function outcomeOfRow(row: OutcomeRow, latestScores: LatestScores): AttemptOutcome {
	return computeAttemptOutcome({
		facts: factsOfRow(row),
		finalScores: latestScores,
		passingScore: row.passingScore,
	})
}

export async function materializeAttemptOutcome(
	tx: DbTransaction,
	input: { attemptId: string; latestScores: LatestScores }
): Promise<AttemptOutcome> {
	const [row] = await tx
		.select({
			id: testAttempts.id,
			results: testAttempts.results,
			resultsVersion: testAttempts.resultsVersion,
			passingScore: testAttempts.passingScore,
		})
		.from(testAttempts)
		.where(eq(testAttempts.id, input.attemptId))
		.for('update')
	if (!row) throw new Error(`materializeAttemptOutcome: attempt ${input.attemptId} not found`)

	const outcome = outcomeOfRow(row, input.latestScores)
	await tx
		.update(testAttempts)
		.set({
			...projectionOf(outcome),
			gradedAt: outcome.reviewStatus === 'graded' ? sql`now()` : null,
		})
		.where(eq(testAttempts.id, input.attemptId))
	return outcome
}

function sameNumber(stored: number | null, expected: number | null): boolean {
	if (stored === null || expected === null) return stored === expected
	return Math.fround(stored) === Math.fround(expected)
}

function sameProjection(stored: ProjectionValues, expected: ProjectionValues): boolean {
	return (
		stored.reviewStatus === expected.reviewStatus &&
		stored.finalPassed === expected.finalPassed &&
		sameNumber(stored.finalEarnedPoints, expected.finalEarnedPoints) &&
		sameNumber(stored.finalScorePercentage, expected.finalScorePercentage) &&
		sameNumber(stored.autoTotalPoints, expected.autoTotalPoints)
	)
}

type ReconcileRow = OutcomeRow &
	ProjectionValues & {
		earnedPoints: number
		totalPoints: number
		scorePercentage: number
		passed: boolean
	}

function expectedProjection(
	row: ReconcileRow,
	outcome: AttemptOutcome
): { values: ProjectionValues; fromFacts: boolean } {
	if (row.reviewStatus === 'none' && outcome.reviewStatus === 'none') {
		return {
			fromFacts: true,
			values: {
				reviewStatus: 'none',
				finalEarnedPoints: row.earnedPoints,
				finalScorePercentage: row.scorePercentage,
				finalPassed: row.passed,
				autoTotalPoints: row.totalPoints,
			},
		}
	}
	return { fromFacts: false, values: projectionOf(outcome) }
}

function storedProjection(row: ReconcileRow): ProjectionValues {
	return {
		reviewStatus: row.reviewStatus,
		finalEarnedPoints: row.finalEarnedPoints,
		finalScorePercentage: row.finalScorePercentage,
		finalPassed: row.finalPassed,
		autoTotalPoints: row.autoTotalPoints,
	}
}

async function repairFromFacts(row: ReconcileRow): Promise<void> {
	await db
		.update(testAttempts)
		.set({
			finalEarnedPoints: row.earnedPoints,
			finalScorePercentage: row.scorePercentage,
			finalPassed: row.passed,
			autoTotalPoints: row.totalPoints,
		})
		.where(eq(testAttempts.id, row.id))
}

async function readBatch(afterId: string | null, limit: number): Promise<ReconcileRow[]> {
	return db
		.select({
			id: testAttempts.id,
			results: testAttempts.results,
			resultsVersion: testAttempts.resultsVersion,
			passingScore: testAttempts.passingScore,
			earnedPoints: testAttempts.earnedPoints,
			totalPoints: testAttempts.totalPoints,
			scorePercentage: testAttempts.scorePercentage,
			passed: testAttempts.passed,
			reviewStatus: testAttempts.reviewStatus,
			finalEarnedPoints: testAttempts.finalEarnedPoints,
			finalScorePercentage: testAttempts.finalScorePercentage,
			finalPassed: testAttempts.finalPassed,
			autoTotalPoints: testAttempts.autoTotalPoints,
		})
		.from(testAttempts)
		.where(afterId === null ? undefined : gt(testAttempts.id, afterId))
		.orderBy(asc(testAttempts.id))
		.limit(limit)
}

export async function reconcileOutcomes(input: {
	loadLatestScores: LoadLatestScores
	repair?: boolean
	batchSize?: number
}): Promise<ReconcileResult> {
	const batchSize = input.batchSize ?? DEFAULT_BATCH_SIZE
	const result: ReconcileResult = { checked: 0, mismatched: [], repaired: 0 }
	let cursor: string | null = null

	for (;;) {
		const rows = await readBatch(cursor, batchSize)
		if (rows.length === 0) break
		const scoresByAttempt = await input.loadLatestScores(rows.map((row) => row.id))

		for (const row of rows) {
			result.checked += 1
			let outcome: AttemptOutcome
			try {
				outcome = outcomeOfRow(row, scoresByAttempt.get(row.id) ?? NO_SCORES)
			} catch (error) {
				result.mismatched.push({
					attemptId: row.id,
					stored: storedProjection(row),
					expected: { error: error instanceof Error ? error.message : String(error) },
				})
				continue
			}
			const expected = expectedProjection(row, outcome)
			const stored = storedProjection(row)
			if (sameProjection(stored, expected.values)) continue
			result.mismatched.push({ attemptId: row.id, stored, expected: expected.values })
			if (!input.repair) continue
			if (expected.fromFacts) await repairFromFacts(row)
			else
				await db.transaction((tx) =>
					materializeAttemptOutcome(tx, { attemptId: row.id, latestScores: scoresByAttempt.get(row.id) ?? NO_SCORES })
				)
			result.repaired += 1
		}

		cursor = rows[rows.length - 1]!.id
		if (rows.length < batchSize) break
	}

	return result
}

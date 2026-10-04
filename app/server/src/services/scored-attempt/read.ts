import {
	AttemptFactsSchema,
	LegacyAttemptResultsSchema,
	normalizeKeyValue,
	type AttemptView,
} from '@bio-exam/exam-core'

import { eq } from 'drizzle-orm'

import { db } from '../../db/index.js'
import { testAttempts } from '../../db/schema.js'
import { buildAttemptView, type AttemptViewer, type ReadableFact } from './view.js'

export class AttemptResultsShapeError extends Error {
	constructor(readonly attemptId: string | null) {
		super(`attempt ${attemptId ?? 'unknown'}: results do not match the schema of their version`)
		this.name = 'AttemptResultsShapeError'
	}
}

function factsFromRow(results: unknown, resultsVersion: number): ReadableFact[] {
	if (resultsVersion === 2) {
		return AttemptFactsSchema.parse(results).map((fact) => ({
			questionId: fact.questionId,
			points: fact.points,
			earnedPoints: fact.earnedPoints,
			isCorrect: fact.isCorrect,
			userAnswer: fact.userAnswer,
			explanationText: fact.explanationText,
			key: fact.key,
			verdicts: fact.verdicts,
			mistakes: fact.mistakes,
		}))
	}
	if (resultsVersion === 1) {
		return LegacyAttemptResultsSchema.parse(results).map((item) => ({
			questionId: item.questionId,
			points: item.points,
			earnedPoints: item.earnedPoints,
			isCorrect: item.isCorrect,
			userAnswer: item.userAnswer ?? null,
			explanationText: item.explanationText ?? null,
			key: item.correctAnswer != null ? normalizeKeyValue(item.correctAnswer) : null,
			verdicts: null,
			mistakes: null,
		}))
	}
	throw new Error(`unknown results version ${resultsVersion}`)
}

export function readFactsFromRow(row: {
	attemptId?: string | null
	results: unknown
	resultsVersion: number
}): ReadableFact[] {
	try {
		return factsFromRow(row.results, row.resultsVersion)
	} catch {
		throw new AttemptResultsShapeError(row.attemptId ?? null)
	}
}

export async function readAttemptView(attemptId: string, viewer: AttemptViewer): Promise<AttemptView> {
	const [row] = await db
		.select({
			id: testAttempts.id,
			submittedAt: testAttempts.submittedAt,
			earnedPoints: testAttempts.earnedPoints,
			totalPoints: testAttempts.totalPoints,
			scorePercentage: testAttempts.scorePercentage,
			passed: testAttempts.passed,
			results: testAttempts.results,
			resultsVersion: testAttempts.resultsVersion,
		})
		.from(testAttempts)
		.where(eq(testAttempts.id, attemptId))
	if (!row) throw new Error(`readAttemptView: attempt ${attemptId} not found`)
	const facts = readFactsFromRow({ attemptId: row.id, results: row.results, resultsVersion: row.resultsVersion })
	return buildAttemptView({
		attempt: {
			id: row.id,
			submittedAt: row.submittedAt.toISOString(),
			earnedPoints: row.earnedPoints,
			totalPoints: row.totalPoints,
			scorePercentage: row.scorePercentage,
			passed: row.passed,
		},
		facts,
		viewer,
	})
}

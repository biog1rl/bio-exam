import { SubmitResultSchema, type SubmitResult } from '@bio-exam/exam-core'

import { eq } from 'drizzle-orm'

import { db } from '../../db/index.js'
import { testAttempts } from '../../db/schema.js'

export async function readSubmittedResult(attemptId: string): Promise<SubmitResult> {
	const [row] = await db
		.select({
			id: testAttempts.id,
			submittedAt: testAttempts.submittedAt,
			earnedPoints: testAttempts.earnedPoints,
			totalPoints: testAttempts.totalPoints,
			scorePercentage: testAttempts.scorePercentage,
			passed: testAttempts.passed,
			results: testAttempts.results,
		})
		.from(testAttempts)
		.where(eq(testAttempts.id, attemptId))
	if (!row) throw new Error(`readSubmittedResult: attempt ${attemptId} not found`)
	return SubmitResultSchema.parse({
		attemptId: row.id,
		submittedAt: row.submittedAt.toISOString(),
		earnedPoints: row.earnedPoints,
		totalPoints: row.totalPoints,
		scorePercentage: row.scorePercentage,
		passed: row.passed,
		results: row.results,
	})
}

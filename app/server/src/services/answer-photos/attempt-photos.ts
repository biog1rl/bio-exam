import { and, asc, inArray } from 'drizzle-orm'

import { db } from '../../db/index.js'
import { answerPhotos } from '../../db/schema.js'
import { photoOwnership } from './open-answer-rule.js'

export type AttemptAnswerPhoto = { id: string; uploadedAt: string }

export async function listAttemptAnswerPhotos(input: {
	attemptId: string
	sessionId: string | null
	questionIds: readonly string[]
}): Promise<Map<string, AttemptAnswerPhoto[]>> {
	const result = new Map<string, AttemptAnswerPhoto[]>()
	if (input.questionIds.length === 0) return result
	const rows = await db
		.select({ id: answerPhotos.id, questionId: answerPhotos.questionId, uploadedAt: answerPhotos.uploadedAt })
		.from(answerPhotos)
		.where(and(inArray(answerPhotos.questionId, [...input.questionIds]), photoOwnership(input)))
		.orderBy(asc(answerPhotos.uploadedAt), asc(answerPhotos.id))
	for (const row of rows) {
		const list = result.get(row.questionId) ?? []
		list.push({ id: row.id, uploadedAt: row.uploadedAt.toISOString() })
		result.set(row.questionId, list)
	}
	return result
}

import type { LegacyAttemptResultItem } from '@bio-exam/exam-core'

import { and, desc, inArray, lte, sql } from 'drizzle-orm'

import { db } from '../../db/index.js'
import { answerKeys, questions, testAttempts } from '../../db/schema.js'
import { getQuestionTypeMapForTest } from '../../lib/tests/question-type-resolver.js'
import { isUuid } from '../../lib/uuid.js'
import { readContent } from './facts.js'
import { legacyFact, type LegacyQuestion } from './legacy-fact.js'
import type { ReadableFact } from './view.js'

async function readHistoryKeys(attemptId: string, questionIds: string[]): Promise<Map<string, unknown>> {
	if (questionIds.length === 0) return new Map()
	const rows = await db
		.selectDistinctOn([answerKeys.questionId], {
			questionId: answerKeys.questionId,
			correctAnswer: answerKeys.correctAnswer,
		})
		.from(answerKeys)
		.where(
			and(
				inArray(answerKeys.questionId, questionIds),
				lte(
					answerKeys.createdAt,
					sql`(SELECT ${testAttempts.submittedAt} FROM ${testAttempts} WHERE ${testAttempts.id} = ${attemptId})`
				)
			)
		)
		.orderBy(answerKeys.questionId, desc(answerKeys.version))
	return new Map(rows.map((row) => [row.questionId, row.correctAnswer]))
}

export async function readLegacyFacts(params: {
	attemptId: string
	testId: string
	items: LegacyAttemptResultItem[]
}): Promise<ReadableFact[]> {
	const { attemptId, testId, items } = params
	const questionIds = [...new Set(items.map((item) => item.questionId).filter(isUuid))]
	if (questionIds.length === 0) return items.map((item) => legacyFact({ item, question: null, historyKey: null }))

	const questionRows = await db
		.select({
			id: questions.id,
			type: questions.type,
			points: questions.points,
			options: questions.options,
			matchingPairs: questions.matchingPairs,
		})
		.from(questions)
		.where(inArray(questions.id, questionIds))
	const typesMap = await getQuestionTypeMapForTest({ testId, includeInactive: true })
	const questionsById = new Map<string, LegacyQuestion>()
	for (const row of questionRows) {
		const typeConfig = typesMap[row.type]
		if (!typeConfig) continue
		questionsById.set(row.id, { typeConfig, content: readContent(row), points: Number(row.points ?? 0) })
	}

	const withoutStoredKey = questionIds.filter((id) =>
		items.some((item) => item.questionId === id && item.correctAnswer == null)
	)
	const historyKeys = await readHistoryKeys(attemptId, withoutStoredKey)

	return items.map((item) =>
		legacyFact({
			item,
			question: questionsById.get(item.questionId) ?? null,
			historyKey: historyKeys.get(item.questionId) ?? null,
		})
	)
}

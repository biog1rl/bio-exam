import '../config/env.js'

import { asc, eq, inArray } from 'drizzle-orm'

import { db, pgPool } from '../db/index.js'
import { questions, tests, topics } from '../db/schema.js'
import { upsertQuestionSearchDocument } from '../services/search/question-documents.js'
import { storageService } from '../services/storage/storage.js'

type BackfillCounters = {
	processed: number
	inserted: number
	skipped: number
	failed: number
}

async function main() {
	const counters: BackfillCounters = {
		processed: 0,
		inserted: 0,
		skipped: 0,
		failed: 0,
	}

	const rows = await db
		.select({
			questionId: questions.id,
			testId: questions.testId,
			type: questions.type,
			options: questions.options,
			matchingPairs: questions.matchingPairs,
			promptPath: questions.promptPath,
			topicId: tests.topicId,
		})
		.from(questions)
		.innerJoin(tests, eq(tests.id, questions.testId))
		.innerJoin(topics, eq(topics.id, tests.topicId))
		.orderBy(asc(questions.createdAt))

	const existing =
		rows.length > 0
			? await pgPool.query<{ question_id: string }>(
					'select question_id from question_search_documents where question_id = any($1::uuid[])',
					[rows.map((row) => row.questionId)]
				)
			: { rows: [] }
	const existingIds = new Set(existing.rows.map((row) => row.question_id))

	for (const row of rows) {
		counters.processed += 1
		try {
			if (!row.promptPath) {
				counters.skipped += 1
				continue
			}

			const promptText = await storageService.readFile(row.promptPath)
			if (!promptText.trim()) {
				counters.skipped += 1
				continue
			}

			await upsertQuestionSearchDocument({
				questionId: row.questionId,
				testId: row.testId,
				topicId: row.topicId,
				type: row.type,
				promptText,
				options: row.options,
				matchingPairs: row.matchingPairs,
			})

			if (!existingIds.has(row.questionId)) counters.inserted += 1
		} catch (error) {
			counters.failed += 1
			console.error(`[search-backfill] failed question=${row.questionId}`, error)
		}
	}

	console.log(
		`[search-backfill] processed=${counters.processed} inserted=${counters.inserted} skipped=${counters.skipped} failed=${counters.failed}`
	)

	await pgPool.end()
}

main().catch(async (error) => {
	console.error('[search-backfill] failed', error)
	await pgPool.end().catch(() => undefined)
	process.exit(1)
})

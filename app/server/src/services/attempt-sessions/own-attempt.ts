import { and, eq } from 'drizzle-orm'

import { db } from '../../db/index.js'
import { testAttempts, tests, topics } from '../../db/schema.js'

export type OwnAttempt = {
	attemptId: string
	sessionId: string | null
	test: {
		id: string
		slug: string
		title: string
		topicSlug: string
		topicTitle: string
		showCorrectAnswer: boolean
	}
}

export async function findOwnAttempt(attemptId: string, userId: string): Promise<OwnAttempt | null> {
	const [row] = await db
		.select({
			attemptId: testAttempts.id,
			sessionId: testAttempts.sessionId,
			testId: tests.id,
			slug: tests.slug,
			title: tests.title,
			showCorrectAnswer: tests.showCorrectAnswer,
			topicSlug: topics.slug,
			topicTitle: topics.title,
		})
		.from(testAttempts)
		.innerJoin(tests, eq(tests.id, testAttempts.testId))
		.innerJoin(topics, eq(topics.id, tests.topicId))
		.where(and(eq(testAttempts.id, attemptId), eq(testAttempts.userId, userId)))
		.limit(1)
	if (!row) return null
	return {
		attemptId: row.attemptId,
		sessionId: row.sessionId,
		test: {
			id: row.testId,
			slug: row.slug,
			title: row.title,
			topicSlug: row.topicSlug,
			topicTitle: row.topicTitle,
			showCorrectAnswer: row.showCorrectAnswer,
		},
	}
}

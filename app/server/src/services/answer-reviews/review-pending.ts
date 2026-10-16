import { sql } from 'drizzle-orm'

import { db } from '../../db/index.js'
import { emptyOpenQuestionIds } from '../answer-photos/open-answer-rule.js'
import {
	ATTEMPT_REVIEW_PENDING_KIND,
	recordAttemptReviewPending,
} from '../notifications/producers/attempt-review-pending.js'
import { REVIEW_READY_SQL, type DbTransaction } from '../scored-attempt/index.js'
import { lockAttemptForReview, unreviewedOpenQuestionIds } from './queries.js'

export async function recordReviewPending(
	tx: DbTransaction,
	attemptId: string,
	options: { assumeReady?: boolean } = {}
): Promise<number> {
	const attempt = await lockAttemptForReview(tx, attemptId)
	if (!attempt || !(attempt.ready || options.assumeReady)) return 0
	const pending = await unreviewedOpenQuestionIds(tx, attemptId, [...attempt.openAnswers.keys()])
	if (pending.length === 0) return 0
	const empty = new Set(
		await emptyOpenQuestionIds(tx, {
			sessionId: attempt.sessionId,
			attemptId,
			answers: Object.fromEntries(pending.map((id) => [id, attempt.openAnswers.get(id)])),
		})
	)
	if (pending.every((id) => empty.has(id))) return 0
	return recordAttemptReviewPending(tx, { attemptId, testId: attempt.testId })
}

export async function notifyReviewPending(attemptId: string): Promise<number> {
	return db.transaction((tx) => recordReviewPending(tx, attemptId))
}

export async function findReviewPendingAttemptIds(limit: number): Promise<string[]> {
	const result = await db.execute<{ id: string }>(sql`
		select ta.id
		from test_attempts ta
		where ta.review_status = 'pending'
			and ta.results_version = 2
			and ${sql.raw(REVIEW_READY_SQL)}
			and not exists (
				select 1 from notification_events e
				where e.subject_id = ta.id
					and e.dedupe_key = ${ATTEMPT_REVIEW_PENDING_KIND}::text || ':' || ta.id::text
			)
		order by ta.submitted_at desc, ta.id
		limit ${limit}
	`)
	return result.rows.map((row) => row.id)
}

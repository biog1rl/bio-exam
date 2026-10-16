import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'

import { db, type DB } from '../../db/index.js'
import { answerReviews, users } from '../../db/schema.js'
import { OPEN_PHOTO_ABSENT_SQL, OPEN_TEXT_BLANK_SQL } from '../answer-photos/open-answer-rule.js'
import {
	lockAttemptFacts,
	REVIEW_READY_SQL,
	type DbTransaction,
	type LatestScores,
	type LoadLatestScores,
} from '../scored-attempt/index.js'

type Executor = Pick<DB, 'selectDistinctOn'>

export type LatestReview = {
	questionId: string
	score: number
	comment: string | null
	reviewedAt: Date
	reviewerName: string | null
}

export type AttemptForReview = {
	id: string
	userId: string
	testId: string
	sessionId: string | null
	ready: boolean
	openAnswers: ReadonlyMap<string, unknown>
}

export type NoAnswerCandidate = { attemptId: string; questionIds: string[] }

export const REVIEWER_FALLBACK_NAME = 'Проверяющий'

export const loadLatestScores: LoadLatestScores = (attemptIds) => loadLatestScoresIn(db, attemptIds)

export async function loadLatestScoresIn(
	executor: Executor,
	attemptIds: readonly string[]
): Promise<ReadonlyMap<string, LatestScores>> {
	const result = new Map<string, Map<string, number>>()
	if (attemptIds.length === 0) return result
	const rows = await executor
		.selectDistinctOn([answerReviews.attemptId, answerReviews.questionId], {
			attemptId: answerReviews.attemptId,
			questionId: answerReviews.questionId,
			score: answerReviews.score,
		})
		.from(answerReviews)
		.where(inArray(answerReviews.attemptId, [...attemptIds]))
		.orderBy(
			asc(answerReviews.attemptId),
			asc(answerReviews.questionId),
			desc(answerReviews.createdAt),
			desc(answerReviews.id)
		)
	for (const row of rows) {
		let scores = result.get(row.attemptId)
		if (!scores) {
			scores = new Map()
			result.set(row.attemptId, scores)
		}
		scores.set(row.questionId, row.score)
	}
	return result
}

export async function readLatestReviews(attemptId: string): Promise<Map<string, LatestReview>> {
	const rows = await db
		.selectDistinctOn([answerReviews.questionId], {
			questionId: answerReviews.questionId,
			score: answerReviews.score,
			comment: answerReviews.comment,
			reviewedAt: answerReviews.createdAt,
			reviewerName: sql<
				string | null
			>`case when ${users.id} is null then null else coalesce(${users.name}, ${users.firstName}, ${REVIEWER_FALLBACK_NAME}) end`,
		})
		.from(answerReviews)
		.leftJoin(users, eq(users.id, answerReviews.reviewerId))
		.where(eq(answerReviews.attemptId, attemptId))
		.orderBy(asc(answerReviews.questionId), desc(answerReviews.createdAt), desc(answerReviews.id))
	return new Map(rows.map((row) => [row.questionId, row]))
}

export async function lockAttemptForReview(tx: DbTransaction, attemptId: string): Promise<AttemptForReview | null> {
	const locked = await lockAttemptFacts(tx, attemptId)
	if (!locked) return null
	const openAnswers = new Map(
		locked.facts.filter((fact) => fact.template === 'open').map((fact) => [fact.questionId, fact.userAnswer])
	)
	return {
		id: locked.id,
		userId: locked.userId,
		testId: locked.testId,
		sessionId: locked.sessionId,
		ready: locked.ready,
		openAnswers,
	}
}

export async function unreviewedOpenQuestionIds(
	tx: DbTransaction,
	attemptId: string,
	questionIds: readonly string[]
): Promise<string[]> {
	if (questionIds.length === 0) return []
	const reviewed = await tx
		.select({ questionId: answerReviews.questionId })
		.from(answerReviews)
		.where(and(eq(answerReviews.attemptId, attemptId), inArray(answerReviews.questionId, [...questionIds])))
	const taken = new Set(reviewed.map((row) => row.questionId))
	return questionIds.filter((id) => !taken.has(id))
}

export async function findNoAnswerCandidates(limit: number): Promise<NoAnswerCandidate[]> {
	const result = await db.execute<{ attempt_id: string; question_ids: string[] }>(sql`
		select ta.id as attempt_id, array_agg(distinct f.item ->> 'questionId') as question_ids
		from test_attempts ta
		cross join lateral jsonb_array_elements(ta.results) as f(item)
		where ta.review_status = 'pending'
			and ta.results_version = 2
			and ${sql.raw(REVIEW_READY_SQL)}
			and f.item ->> 'template' = 'open'
			and ${OPEN_TEXT_BLANK_SQL}
			and not exists (
				select 1 from answer_reviews r
				where r.attempt_id = ta.id and r.question_id = (f.item ->> 'questionId')::uuid
			)
			and ${OPEN_PHOTO_ABSENT_SQL}
		group by ta.id, ta.submitted_at
		order by ta.submitted_at, ta.id
		limit ${limit}
	`)
	return result.rows.map((row) => ({ attemptId: row.attempt_id, questionIds: row.question_ids }))
}

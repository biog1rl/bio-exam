import { OPEN_REVIEW_NO_ANSWER_COMMENT, type OpenReviewResponse, type ReviewStatus } from '@bio-exam/exam-core'

import { eq, sql } from 'drizzle-orm'

import { db } from '../../db/index.js'
import { answerReviews, users } from '../../db/schema.js'
import { emptyOpenQuestionIds } from '../answer-photos/open-answer-rule.js'
import { recordAttemptGraded } from '../notifications/index.js'
import { materializeAttemptOutcome, type DbTransaction } from '../scored-attempt/index.js'
import {
	loadLatestScoresIn,
	lockAttemptForReview,
	REVIEWER_FALLBACK_NAME,
	unreviewedOpenQuestionIds,
	type AttemptForReview,
} from './queries.js'

export {
	findNoAnswerCandidates,
	loadLatestScores,
	loadLatestScoresIn,
	lockAttemptForReview,
	readLatestReviews,
	REVIEWER_FALLBACK_NAME,
	unreviewedOpenQuestionIds,
} from './queries.js'
export type { AttemptForReview, LatestReview, NoAnswerCandidate } from './queries.js'
export { findReviewPendingAttemptIds, notifyReviewPending, recordReviewPending } from './review-pending.js'

export type SaveReviewInput = {
	attemptId: string
	questionId: string
	reviewerId: string
	score: number
	comment: string | undefined
}

export type SaveReviewOutcome =
	| ({ kind: 'saved' } & OpenReviewResponse)
	| { kind: 'not_found' }
	| { kind: 'own_attempt' }
	| { kind: 'not_ready' }
	| { kind: 'not_open_question' }

export type NoAnswerOutcome = { written: number; reviewStatus: ReviewStatus | null }

type NewReview = { questionId: string; score: number; comment: string | null }

async function recordReviews(
	tx: DbTransaction,
	attempt: AttemptForReview,
	reviewerId: string | null,
	reviews: readonly NewReview[]
) {
	const inserted = await tx
		.insert(answerReviews)
		.values(
			reviews.map((review) => ({
				attemptId: attempt.id,
				questionId: review.questionId,
				score: review.score,
				comment: review.comment,
				reviewerId,
				createdAt: sql`clock_timestamp()`,
			}))
		)
		.returning({ questionId: answerReviews.questionId, createdAt: answerReviews.createdAt })
	const latestScores = (await loadLatestScoresIn(tx, [attempt.id])).get(attempt.id) ?? new Map<string, number>()
	const outcome = await materializeAttemptOutcome(tx, { attemptId: attempt.id, latestScores })
	if (outcome.reviewStatus === 'graded') {
		await recordAttemptGraded(tx, {
			attemptId: attempt.id,
			testId: attempt.testId,
			studentId: attempt.userId,
			actorId: reviewerId,
		})
	}
	return { outcome, inserted }
}

export async function saveAnswerReview(input: SaveReviewInput): Promise<SaveReviewOutcome> {
	return db.transaction(async (tx): Promise<SaveReviewOutcome> => {
		const attempt = await lockAttemptForReview(tx, input.attemptId)
		if (!attempt) return { kind: 'not_found' }
		if (attempt.userId === input.reviewerId) return { kind: 'own_attempt' }
		if (!attempt.ready) return { kind: 'not_ready' }
		if (!attempt.openAnswers.has(input.questionId)) return { kind: 'not_open_question' }

		const comment = input.comment && input.comment.length > 0 ? input.comment : null
		const { outcome, inserted } = await recordReviews(tx, attempt, input.reviewerId, [
			{ questionId: input.questionId, score: input.score, comment },
		])
		const [reviewer] = await tx
			.select({ name: sql<string>`coalesce(${users.name}, ${users.firstName}, ${REVIEWER_FALLBACK_NAME})` })
			.from(users)
			.where(eq(users.id, input.reviewerId))
			.limit(1)
		return {
			kind: 'saved',
			review: {
				questionId: input.questionId,
				score: input.score,
				comment,
				reviewedAt: inserted[0]!.createdAt.toISOString(),
				reviewerName: reviewer?.name ?? null,
			},
			attempt: {
				reviewStatus: outcome.reviewStatus,
				finalScorePercentage: outcome.final?.scorePercentage ?? null,
				finalPassed: outcome.final?.passed ?? null,
			},
		}
	})
}

export async function recordNoAnswerReviews(
	attemptId: string,
	questionIds: readonly string[]
): Promise<NoAnswerOutcome> {
	return db.transaction(async (tx): Promise<NoAnswerOutcome> => {
		const attempt = await lockAttemptForReview(tx, attemptId)
		if (!attempt || !attempt.ready) return { written: 0, reviewStatus: null }
		const open = questionIds.filter((id) => attempt.openAnswers.has(id))
		const pending = await unreviewedOpenQuestionIds(tx, attemptId, open)
		const empty = await emptyOpenQuestionIds(tx, {
			sessionId: attempt.sessionId,
			attemptId,
			answers: Object.fromEntries(pending.map((id) => [id, attempt.openAnswers.get(id)])),
		})
		if (empty.length === 0) return { written: 0, reviewStatus: null }
		const { outcome } = await recordReviews(
			tx,
			attempt,
			null,
			empty.map((questionId) => ({ questionId, score: 0, comment: OPEN_REVIEW_NO_ANSWER_COMMENT }))
		)
		return { written: empty.length, reviewStatus: outcome.reviewStatus }
	})
}

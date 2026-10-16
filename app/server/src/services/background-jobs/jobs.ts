import { logger } from '../../lib/logger.js'
import {
	findNoAnswerCandidates,
	findReviewPendingAttemptIds,
	loadLatestScores,
	notifyReviewPending,
	recordNoAnswerReviews,
} from '../answer-reviews/index.js'
import {
	closeStaleOpenSessions,
	finalizeSessionByDeadline,
	findSessionsDueForFinalization,
} from '../attempt-sessions/index.js'
import { reconcileOutcomes } from '../scored-attempt/index.js'
import type { Job, JobLog } from './registry.js'

export const FINALIZE_DEADLINES_JOB = 'finalize-deadlines'
export const RECONCILE_OUTCOMES_JOB = 'reconcile-outcomes'
export const NO_ANSWER_REVIEWS_JOB = 'no-answer-reviews'
export const FINALIZE_DEADLINES_INTERVAL_MS = 30_000
export const FINALIZE_DEADLINES_BATCH = 50
export const FINALIZE_RUN_BUDGET_MS = 20_000
export const NO_ANSWER_REVIEWS_INTERVAL_MS = 60_000
export const NO_ANSWER_REVIEWS_BATCH = 50
export const FINALIZE_FAILURE_COOLDOWN_MS = 600_000

export type FinalizeDeadlinesDeps = {
	find?: typeof findSessionsDueForFinalization
	finalize?: typeof finalizeSessionByDeadline
	closeStale?: typeof closeStaleOpenSessions
	now?: () => number
	log?: Pick<JobLog, 'error'>
}

export function finalizeDeadlinesJob(deps: FinalizeDeadlinesDeps = {}): Job {
	const find = deps.find ?? findSessionsDueForFinalization
	const finalize = deps.finalize ?? finalizeSessionByDeadline
	const closeStale = deps.closeStale ?? closeStaleOpenSessions
	const now = deps.now ?? Date.now
	const log = deps.log ?? logger
	const failures = new Map<string, number>()

	return {
		name: FINALIZE_DEADLINES_JOB,
		intervalMs: FINALIZE_DEADLINES_INTERVAL_MS,
		async runOnce({ signal }) {
			const startedAt = now()
			const report = { stale: 0, due: 0, finalized: 0, expired: 0, other: 0, failed: 0, timeBounded: 0 }
			report.stale = await closeStale()

			for (const [sessionId, failedAt] of failures) {
				if (startedAt - failedAt >= FINALIZE_FAILURE_COOLDOWN_MS) failures.delete(sessionId)
			}
			const due = await find(FINALIZE_DEADLINES_BATCH, [...failures.keys()])
			report.due = due.length

			for (const sessionId of due) {
				if (signal.aborted) break
				if (now() - startedAt >= FINALIZE_RUN_BUDGET_MS) {
					report.timeBounded = 1
					break
				}
				try {
					const outcome = await finalize(sessionId)
					if (outcome.kind === 'finalized') report.finalized += 1
					else if (outcome.kind === 'expired') report.expired += 1
					else report.other += 1
				} catch (error) {
					failures.set(sessionId, now())
					report.failed += 1
					log.error({ sessionId, err: error }, 'finalize-deadlines session failed')
				}
			}
			return report
		},
	}
}

export function reconcileOutcomesJob(deps: { log?: Pick<JobLog, 'warn'> } = {}): Job {
	const log = deps.log ?? logger
	return {
		name: RECONCILE_OUTCOMES_JOB,
		intervalMs: null,
		async runOnce() {
			const result = await reconcileOutcomes({
				loadLatestScores,
				repair: true,
				repairOnly: 'none',
			})
			if (result.mismatched.length > 0) {
				log.warn(
					{ attemptIds: result.mismatched.map((item) => item.attemptId) },
					'reconcile-outcomes found mismatched projections'
				)
			}
			return { checked: result.checked, mismatched: result.mismatched.length, repaired: result.repaired }
		},
	}
}

export type NoAnswerReviewsDeps = {
	find?: typeof findNoAnswerCandidates
	record?: typeof recordNoAnswerReviews
	findPending?: typeof findReviewPendingAttemptIds
	notify?: typeof notifyReviewPending
	log?: Pick<JobLog, 'error'>
}

export function noAnswerReviewsJob(deps: NoAnswerReviewsDeps = {}): Job {
	const find = deps.find ?? findNoAnswerCandidates
	const record = deps.record ?? recordNoAnswerReviews
	const findPending = deps.findPending ?? findReviewPendingAttemptIds
	const notify = deps.notify ?? notifyReviewPending
	const log = deps.log ?? logger
	return {
		name: NO_ANSWER_REVIEWS_JOB,
		intervalMs: NO_ANSWER_REVIEWS_INTERVAL_MS,
		async runOnce({ signal }) {
			const report = { candidates: 0, reviewed: 0, graded: 0, notified: 0, failed: 0 }
			const candidates = await find(NO_ANSWER_REVIEWS_BATCH)
			report.candidates = candidates.length
			for (const candidate of candidates) {
				if (signal.aborted) break
				try {
					const outcome = await record(candidate.attemptId, candidate.questionIds)
					report.reviewed += outcome.written
					if (outcome.reviewStatus === 'graded') report.graded += 1
				} catch (error) {
					report.failed += 1
					log.error({ attemptId: candidate.attemptId, err: error }, 'no-answer-reviews attempt failed')
				}
			}
			for (const attemptId of await findPending(NO_ANSWER_REVIEWS_BATCH)) {
				if (signal.aborted) break
				try {
					if ((await notify(attemptId)) > 0) report.notified += 1
				} catch (error) {
					report.failed += 1
					log.error({ attemptId, err: error }, 'review-pending notification failed')
				}
			}
			return report
		},
	}
}

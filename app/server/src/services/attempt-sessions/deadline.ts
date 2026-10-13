import type { AnswerValue, AttemptSubmitSource } from '@bio-exam/exam-core'

import { and, asc, eq, exists, isNotNull, isNull, not, notInArray, sql } from 'drizzle-orm'

import { db } from '../../db/index.js'
import { testAttempts, testSessions, tests, topics } from '../../db/schema.js'
import { isTransientDbError } from '../../lib/db-errors.js'
import { logger } from '../../lib/logger.js'
import { scoreSubmission } from '../scored-attempt/index.js'
import { draftAnswerRule } from './draft-answers.js'
import { explanationReaderFor } from './explanations.js'
import { classifySubmitted, type SessionOwner, type SettledOutcome } from './outcome.js'
import {
	closeSessionsAsExpired,
	DEADLINE_FINALIZE_MAX_AGE_HOURS,
	sessionExpired,
	sessionFilter,
	toSessionInfo,
} from './sessions.js'
import { closeSessionAsExpired, submitAttempt, type DraftChanged } from './submit.js'

export const DEADLINE_CLIENT_ATTEMPT_PREFIX = 'deadline:'

export const FINALIZE_SETTLE_SECONDS = 60

const MAX_DRAFT_ROUNDS = 3

function isDraftChanged(value: unknown): value is DraftChanged {
	return typeof value === 'object' && value !== null && (value as { kind?: unknown }).kind === 'draft_changed'
}

type DeadlineSession = {
	testId: string
	userId: string
	timeLimitMinutes: number | null
	photoUploadWindowMinutes: number
	passingScore: number | null
	testSlug: string
	topicSlug: string
	draftAnswers: unknown
}

export function deadlineClientAttemptId(sessionId: string): string {
	return `${DEADLINE_CLIENT_ATTEMPT_PREFIX}${sessionId}`
}

function draftEntriesOf(value: unknown): [string, unknown][] {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return []
	return Object.entries(value as Record<string, unknown>)
}

async function scorableAnswers(
	sessionId: string,
	testId: string,
	draft: unknown
): Promise<Record<string, AnswerValue>> {
	const entries = draftEntriesOf(draft)
	if (entries.length === 0) return {}

	const rule = await draftAnswerRule(testId)
	const kept: Record<string, AnswerValue> = {}
	for (const [questionId, raw] of entries) {
		const verdict = rule(questionId, raw)
		if (verdict.ok) {
			kept[questionId] = verdict.value
			continue
		}
		logger.warn({ sessionId, questionId, reason: verdict.violation.reason }, 'deadline finalize dropped draft answer')
	}
	return kept
}

async function finalizeDraft(sessionId: string, session: DeadlineSession): Promise<SettledOutcome | DraftChanged> {
	const answers = await scorableAnswers(sessionId, session.testId, session.draftAnswers)
	if (Object.keys(answers).length === 0) {
		await closeSessionAsExpired(sessionId)
		return { kind: 'expired' }
	}

	const scored = await scoreSubmission({
		testId: session.testId,
		answers,
		passingScore: session.passingScore,
		readExplanation: explanationReaderFor({ id: session.testId, slug: session.testSlug, topicSlug: session.topicSlug }),
	})
	if (!scored.ok) {
		if (scored.reason === 'no_questions') {
			await closeSessionAsExpired(sessionId)
			return { kind: 'expired' }
		}
		throw new Error(`finalizeSessionByDeadline: answers invalid after filter in session ${sessionId}`)
	}

	const outcome = await submitAttempt({
		owner: { testId: session.testId, userId: session.userId },
		sessionId,
		clientAttemptId: deadlineClientAttemptId(sessionId),
		answers,
		scored,
		test: session,
		source: 'deadline',
		expectedDraft: session.draftAnswers,
	})
	if (outcome.kind === 'accepted') return { kind: 'finalized', attemptId: outcome.attemptId }
	return outcome
}

async function finalizeOnce(
	sessionId: string,
	owner: SessionOwner | undefined
): Promise<SettledOutcome | DraftChanged> {
	const [row] = await db
		.select({
			id: testSessions.id,
			startedAt: testSessions.startedAt,
			draftLastQuestionId: testSessions.draftLastQuestionId,
			draftTelemetry: testSessions.draftTelemetry,
			serverNow: sql<Date | string>`clock_timestamp()`,
			testId: testSessions.testId,
			userId: testSessions.userId,
			submittedAt: testSessions.submittedAt,
			attemptId: testSessions.attemptId,
			closedAt: testSessions.closedAt,
			closeReason: testSessions.closeReason,
			draftAnswers: testSessions.draftAnswers,
			timeLimitMinutes: tests.timeLimitMinutes,
			photoUploadWindowMinutes: tests.photoUploadWindowMinutes,
			passingScore: tests.passingScore,
			testSlug: tests.slug,
			topicSlug: topics.slug,
			expired: sessionExpired(tests.timeLimitMinutes),
			stale: sessionExpired(tests.timeLimitMinutes, DEADLINE_FINALIZE_MAX_AGE_HOURS * 3600),
			attemptSubmitSource: testAttempts.submitSource,
		})
		.from(testSessions)
		.innerJoin(tests, eq(tests.id, testSessions.testId))
		.innerJoin(topics, eq(topics.id, tests.topicId))
		.leftJoin(testAttempts, eq(testAttempts.id, testSessions.attemptId))
		.where(sessionFilter({ sessionId, owner }))
		.limit(1)

	if (!row) return { kind: 'not_found' }
	if (row.submittedAt) {
		return classifySubmitted({
			id: row.attemptId,
			submitSource: row.attemptSubmitSource as AttemptSubmitSource | null,
		})
	}
	if (row.closedAt) return row.closeReason === 'superseded' ? { kind: 'superseded' } : { kind: 'expired' }
	if (!row.expired) return { kind: 'open', session: toSessionInfo(row, new Date(row.serverNow).toISOString()) }

	if (row.stale) {
		await closeSessionAsExpired(sessionId)
		logger.info({ sessionId, maxAgeHours: DEADLINE_FINALIZE_MAX_AGE_HOURS }, 'deadline finalize skipped stale session')
		return { kind: 'expired' }
	}

	try {
		return await finalizeDraft(sessionId, row)
	} catch (error) {
		if (isTransientDbError(error)) throw error
		logger.error({ sessionId, err: error }, 'deadline finalize failed, session closed as expired')
		await closeSessionAsExpired(sessionId)
		return { kind: 'expired' }
	}
}

export async function untilDraftSettles<T>(
	step: () => Promise<T | DraftChanged>,
	rounds = MAX_DRAFT_ROUNDS
): Promise<T> {
	for (let round = 0; round < rounds; round++) {
		const outcome = await step()
		if (!isDraftChanged(outcome)) return outcome
	}
	throw new Error('finalizeSessionByDeadline: draft kept changing')
}

export function finalizeSessionByDeadline(sessionId: string, owner?: SessionOwner): Promise<SettledOutcome> {
	return untilDraftSettles(() => finalizeOnce(sessionId, owner))
}

export async function findSessionsDueForFinalization(
	limit: number,
	excludeIds: readonly string[] = []
): Promise<string[]> {
	const rows = await db
		.select({ id: testSessions.id })
		.from(testSessions)
		.innerJoin(tests, eq(tests.id, testSessions.testId))
		.where(
			and(
				isNull(testSessions.submittedAt),
				isNull(testSessions.closedAt),
				isNotNull(tests.timeLimitMinutes),
				sessionExpired(tests.timeLimitMinutes, FINALIZE_SETTLE_SECONDS),
				not(sessionExpired(tests.timeLimitMinutes, DEADLINE_FINALIZE_MAX_AGE_HOURS * 3600)),
				excludeIds.length > 0 ? notInArray(testSessions.id, [...excludeIds]) : undefined
			)
		)
		.orderBy(asc(testSessions.startedAt))
		.limit(limit)
	return rows.map((row) => row.id)
}

export async function closeStaleOpenSessions(): Promise<number> {
	const closed = await closeSessionsAsExpired(
		db,
		exists(
			db
				.select({ one: sql`1` })
				.from(tests)
				.where(
					and(
						eq(tests.id, testSessions.testId),
						isNotNull(tests.timeLimitMinutes),
						sessionExpired(tests.timeLimitMinutes, DEADLINE_FINALIZE_MAX_AGE_HOURS * 3600)
					)
				)
		)
	)
	if (closed.length > 0) {
		logger.info(
			{ count: closed.length, maxAgeHours: DEADLINE_FINALIZE_MAX_AGE_HOURS },
			'deadline finalize closed stale sessions'
		)
	}
	return closed.length
}

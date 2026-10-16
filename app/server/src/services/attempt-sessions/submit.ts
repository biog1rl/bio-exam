import {
	mergeTelemetryMaps,
	projectionOf,
	type AnswerValue,
	type AttemptSubmitSource,
	type TelemetryMap,
} from '@bio-exam/exam-core'

import { and, eq, sql, type SQL } from 'drizzle-orm'

import { db } from '../../db/index.js'
import { answerPhotos, testAttempts, testSessions } from '../../db/schema.js'
import { emptyOpenQuestionIds } from '../answer-photos/open-answer-rule.js'
import type { ScoreSubmissionResult } from '../scored-attempt/index.js'
import { classifySubmitted, type SessionOutcomeOf, type SessionOwner, type SessionTest } from './outcome.js'
import { closeSessionsAsExpired, sessionExpired, sessionFilter } from './sessions.js'

export type ScoredSubmission = Extract<ScoreSubmissionResult, { ok: true }>

export type DraftChanged = { kind: 'draft_changed' }

type SubmitOutcome = SessionOutcomeOf<
	'accepted' | 'finalized' | 'submitted' | 'expired' | 'superseded' | 'not_found' | 'open_answer_empty'
>

type PrecheckOutcome = { kind: 'writable' } | { kind: 'past_deadline' } | SubmitOutcome

type SubmitAttemptParams = {
	owner: SessionOwner
	sessionId: string
	clientAttemptId: string
	answers: Record<string, AnswerValue>
	telemetry?: TelemetryMap
	scored: ScoredSubmission
	test: Pick<SessionTest, 'timeLimitMinutes' | 'photoUploadWindowMinutes'>
	source: AttemptSubmitSource
}

class ClientAttemptConflict extends Error {
	constructor(
		readonly attemptId: string,
		readonly submitSource: AttemptSubmitSource | null
	) {
		super('client attempt id belongs to another attempt')
	}
}

function closedOutcome(closeReason: string | null): SessionOutcomeOf<'expired' | 'superseded'> {
	return closeReason === 'superseded' ? { kind: 'superseded' } : { kind: 'expired' }
}

function timerEndsAtOf(startedAt: Date, timeLimitMinutes: number | null): SQL {
	return timeLimitMinutes == null
		? sql`NULL`
		: sql`${startedAt}::timestamptz + make_interval(mins => ${timeLimitMinutes}::int)`
}

function submittedAtOf(source: AttemptSubmitSource, startedAt: Date, timeLimitMinutes: number | null): SQL {
	if (source === 'deadline' && timeLimitMinutes != null) {
		return sql`(${timerEndsAtOf(startedAt, timeLimitMinutes)})::timestamptz`
	}
	return sql`now()`
}

function uploadClosesAtOf(params: {
	submittedAt: SQL
	startedAt: Date
	timeLimitMinutes: number | null
	uploadWindowMinutes: number
	hasOpenQuestion: boolean
}): SQL | null {
	const { submittedAt, startedAt, timeLimitMinutes, uploadWindowMinutes, hasOpenQuestion } = params
	if (!hasOpenQuestion || uploadWindowMinutes <= 0) return null
	return sql`LEAST(${submittedAt}, (${timerEndsAtOf(startedAt, timeLimitMinutes)})::timestamptz) + make_interval(mins => ${uploadWindowMinutes}::int)`
}

function draftMatchesOf(expectedDraft: unknown): SQL<boolean> {
	if (expectedDraft === undefined) return sql<boolean>`true`
	if (expectedDraft === null) return sql<boolean>`${testSessions.draftAnswers} IS NULL`
	return sql<boolean>`${testSessions.draftAnswers} IS NOT DISTINCT FROM ${JSON.stringify(expectedDraft)}::jsonb`
}

export async function precheckSubmit(
	owner: SessionOwner,
	request: { sessionId: string; clientAttemptId: string },
	timeLimitMinutes: number | null
): Promise<PrecheckOutcome> {
	const [row] = await db
		.select({
			submittedAt: testSessions.submittedAt,
			attemptId: testSessions.attemptId,
			closedAt: testSessions.closedAt,
			closeReason: testSessions.closeReason,
			pastDeadline: sessionExpired(timeLimitMinutes),
			attemptClientId: testAttempts.clientAttemptId,
			attemptSubmitSource: testAttempts.submitSource,
		})
		.from(testSessions)
		.leftJoin(testAttempts, eq(testAttempts.id, testSessions.attemptId))
		.where(sessionFilter({ sessionId: request.sessionId, owner }))
		.limit(1)
	if (!row) return { kind: 'not_found' }
	if (row.submittedAt) {
		if (row.attemptId !== null && row.attemptClientId === request.clientAttemptId) {
			return { kind: 'accepted', attemptId: row.attemptId }
		}
		return classifySubmitted({
			id: row.attemptId,
			submitSource: row.attemptSubmitSource as AttemptSubmitSource | null,
		})
	}
	if (row.closedAt) return closedOutcome(row.closeReason)
	if (row.pastDeadline) return { kind: 'past_deadline' }
	return { kind: 'writable' }
}

export function closeSessionAsExpired(testSessionId: string): Promise<string[]> {
	return closeSessionsAsExpired(db, sessionFilter({ sessionId: testSessionId }))
}

export function submitAttempt(
	params: SubmitAttemptParams & { expectedDraft: unknown }
): Promise<SubmitOutcome | DraftChanged>
export function submitAttempt(params: SubmitAttemptParams): Promise<SubmitOutcome>
export async function submitAttempt({
	owner,
	sessionId,
	clientAttemptId,
	answers,
	telemetry,
	scored,
	test,
	source,
	expectedDraft,
}: SubmitAttemptParams & { expectedDraft?: unknown }): Promise<SubmitOutcome | DraftChanged> {
	const { testId, userId } = owner
	const { timeLimitMinutes, photoUploadWindowMinutes } = test
	try {
		return await db.transaction(async (tx): Promise<SubmitOutcome | DraftChanged> => {
			const [session] = await tx
				.select({
					submittedAt: testSessions.submittedAt,
					closedAt: testSessions.closedAt,
					closeReason: testSessions.closeReason,
					attemptId: testSessions.attemptId,
					draftTelemetry: testSessions.draftTelemetry,
					startedAt: testSessions.startedAt,
					draftMatches: draftMatchesOf(expectedDraft),
				})
				.from(testSessions)
				.where(sessionFilter({ sessionId, owner }))
				.for('update')
			if (!session) return { kind: 'not_found' }

			if (session.submittedAt) {
				if (!session.attemptId) return classifySubmitted({ id: null, submitSource: null })
				const [stored] = await tx
					.select({ clientAttemptId: testAttempts.clientAttemptId, submitSource: testAttempts.submitSource })
					.from(testAttempts)
					.where(eq(testAttempts.id, session.attemptId))
				if (stored?.clientAttemptId === clientAttemptId) return { kind: 'accepted', attemptId: session.attemptId }
				return classifySubmitted({
					id: session.attemptId,
					submitSource: (stored?.submitSource ?? null) as AttemptSubmitSource | null,
				})
			}

			if (session.closedAt) return closedOutcome(session.closeReason)

			if (!session.draftMatches) return { kind: 'draft_changed' }

			if (source === 'client') {
				const openIds = scored.facts.filter((fact) => fact.template === 'open').map((fact) => fact.questionId)
				const questionIds = await emptyOpenQuestionIds(tx, {
					sessionId,
					answers: Object.fromEntries(openIds.map((id) => [id, answers[id]])),
				})
				if (questionIds.length > 0) return { kind: 'open_answer_empty', questionIds }
			}

			const submittedAt = submittedAtOf(source, session.startedAt, timeLimitMinutes)
			const mergedTelemetry = mergeTelemetryMaps(session.draftTelemetry, telemetry)
			const [inserted] = await tx
				.insert(testAttempts)
				.values({
					testId,
					userId,
					sessionId,
					clientAttemptId,
					answers,
					results: scored.facts,
					resultsVersion: 2,
					earnedPoints: scored.outcome.submitted.earnedPoints,
					totalPoints: scored.outcome.submitted.totalPoints,
					scorePercentage: scored.outcome.submitted.scorePercentage,
					passed: scored.outcome.submitted.passed,
					...projectionOf(scored.outcome),
					passingScore: scored.passingScore,
					submittedAt,
					submitSource: source,
					uploadClosesAt: uploadClosesAtOf({
						submittedAt,
						startedAt: session.startedAt,
						timeLimitMinutes,
						uploadWindowMinutes: photoUploadWindowMinutes,
						hasOpenQuestion: scored.facts.some((fact) => fact.template === 'open'),
					}),
					gradedAt: null,
					telemetry: Object.keys(mergedTelemetry).length > 0 ? mergedTelemetry : null,
				})
				.onConflictDoNothing()
				.returning({ id: testAttempts.id })

			if (!inserted) {
				const [existing] = await tx
					.select({ id: testAttempts.id, submitSource: testAttempts.submitSource })
					.from(testAttempts)
					.where(and(eq(testAttempts.userId, userId), eq(testAttempts.clientAttemptId, clientAttemptId)))
					.limit(1)
				if (existing) {
					throw new ClientAttemptConflict(existing.id, existing.submitSource as AttemptSubmitSource | null)
				}
				throw new Error('submitAttempt: attempt insert was skipped without a client attempt conflict')
			}

			await tx
				.update(testSessions)
				.set({
					submittedAt,
					attemptId: inserted.id,
					draftAnswers: null,
					draftLastQuestionId: null,
					draftTelemetry: null,
					draftUpdatedAt: null,
				})
				.where(eq(testSessions.id, sessionId))
			await tx.update(answerPhotos).set({ attemptId: inserted.id }).where(eq(answerPhotos.sessionId, sessionId))
			return { kind: 'accepted', attemptId: inserted.id }
		})
	} catch (error) {
		if (error instanceof ClientAttemptConflict) {
			return classifySubmitted({ id: error.attemptId, submitSource: error.submitSource })
		}
		throw error
	}
}

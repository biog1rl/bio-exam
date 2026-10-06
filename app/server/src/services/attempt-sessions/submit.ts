import {
	mergeTelemetryMaps,
	projectionOf,
	type AnswerValue,
	type AttemptOutcome,
	type AttemptSubmitSource,
	type TelemetryMap,
} from '@bio-exam/exam-core'

import { and, eq, isNull, sql, type SQL } from 'drizzle-orm'

import { db } from '../../db/index.js'
import { testAttempts, testSessions } from '../../db/schema.js'
import { sessionExpired } from './sessions.js'

export type SessionCloseReason = 'expired' | 'superseded'

export type ScoredAttemptFacts = {
	results: unknown[]
	resultsVersion: 1 | 2
	earnedPoints: number
	totalPoints: number
	scorePercentage: number
	passed: boolean
	outcome: AttemptOutcome
	passingScore: number | null
}

export type PrecheckSubmitParams = {
	testId: string
	userId: string
	testSessionId: string
	clientAttemptId: string
	timeLimitMinutes: number | null
}

export type PrecheckSubmitResult =
	| { kind: 'not_found' }
	| { kind: 'submitted'; attemptId: string | null; sameClient: boolean }
	| { kind: 'closed'; reason: SessionCloseReason }
	| { kind: 'expired' }
	| { kind: 'open' }

export type SubmitAttemptParams = {
	testId: string
	userId: string
	testSessionId: string
	clientAttemptId: string
	answers: Record<string, AnswerValue>
	telemetry?: TelemetryMap
	scored: ScoredAttemptFacts
	timeLimitMinutes?: number | null
	uploadWindowMinutes?: number
	hasOpenQuestion?: boolean
	source?: AttemptSubmitSource
	expectedDraft?: unknown
}

export type SubmitAttemptOutcome =
	| { kind: 'created'; attemptId: string }
	| { kind: 'replayed'; attemptId: string }
	| { kind: 'conflict'; attemptId: string | null }
	| { kind: 'closed'; reason: SessionCloseReason }
	| { kind: 'not_found' }
	| { kind: 'draft_changed' }

class ClientAttemptConflict extends Error {
	constructor(readonly attemptId: string) {
		super('client attempt id belongs to another attempt')
	}
}

function closeReasonOf(value: string | null): SessionCloseReason {
	return value === 'superseded' ? 'superseded' : 'expired'
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

function sessionOfPair(testSessionId: string, testId: string, userId: string): SQL | undefined {
	return and(eq(testSessions.id, testSessionId), eq(testSessions.testId, testId), eq(testSessions.userId, userId))
}

export async function precheckSubmit({
	testId,
	userId,
	testSessionId,
	clientAttemptId,
	timeLimitMinutes,
}: PrecheckSubmitParams): Promise<PrecheckSubmitResult> {
	const [row] = await db
		.select({
			submittedAt: testSessions.submittedAt,
			attemptId: testSessions.attemptId,
			closedAt: testSessions.closedAt,
			closeReason: testSessions.closeReason,
			pastDeadline: sessionExpired(timeLimitMinutes),
			attemptClientId: testAttempts.clientAttemptId,
		})
		.from(testSessions)
		.leftJoin(testAttempts, eq(testAttempts.id, testSessions.attemptId))
		.where(sessionOfPair(testSessionId, testId, userId))
		.limit(1)
	if (!row) return { kind: 'not_found' }
	if (row.submittedAt) {
		return {
			kind: 'submitted',
			attemptId: row.attemptId,
			sameClient: row.attemptId !== null && row.attemptClientId === clientAttemptId,
		}
	}
	if (row.closedAt) return { kind: 'closed', reason: closeReasonOf(row.closeReason) }
	if (row.pastDeadline) return { kind: 'expired' }
	return { kind: 'open' }
}

export async function closeExpiredSession(testSessionId: string): Promise<void> {
	await db
		.update(testSessions)
		.set({ closedAt: sql`now()`, closeReason: 'expired' })
		.where(and(eq(testSessions.id, testSessionId), isNull(testSessions.submittedAt), isNull(testSessions.closedAt)))
}

export async function submitAttempt({
	testId,
	userId,
	testSessionId,
	clientAttemptId,
	answers,
	telemetry,
	scored,
	timeLimitMinutes = null,
	uploadWindowMinutes = 0,
	hasOpenQuestion = false,
	source = 'client',
	expectedDraft,
}: SubmitAttemptParams): Promise<SubmitAttemptOutcome> {
	try {
		return await db.transaction(async (tx): Promise<SubmitAttemptOutcome> => {
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
				.where(sessionOfPair(testSessionId, testId, userId))
				.for('update')
			if (!session) return { kind: 'not_found' }

			if (session.submittedAt) {
				if (!session.attemptId) return { kind: 'conflict', attemptId: null }
				const [stored] = await tx
					.select({ clientAttemptId: testAttempts.clientAttemptId })
					.from(testAttempts)
					.where(eq(testAttempts.id, session.attemptId))
				if (stored?.clientAttemptId === clientAttemptId) return { kind: 'replayed', attemptId: session.attemptId }
				return { kind: 'conflict', attemptId: session.attemptId }
			}

			if (session.closedAt) return { kind: 'closed', reason: closeReasonOf(session.closeReason) }

			if (!session.draftMatches) return { kind: 'draft_changed' }

			const submittedAt = submittedAtOf(source, session.startedAt, timeLimitMinutes)
			const mergedTelemetry = mergeTelemetryMaps(session.draftTelemetry, telemetry)
			const [inserted] = await tx
				.insert(testAttempts)
				.values({
					testId,
					userId,
					sessionId: testSessionId,
					clientAttemptId,
					answers,
					results: scored.results,
					resultsVersion: scored.resultsVersion,
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
						uploadWindowMinutes,
						hasOpenQuestion,
					}),
					gradedAt: null,
					telemetry: Object.keys(mergedTelemetry).length > 0 ? mergedTelemetry : null,
				})
				.onConflictDoNothing()
				.returning({ id: testAttempts.id })

			if (!inserted) {
				const [existing] = await tx
					.select({ id: testAttempts.id })
					.from(testAttempts)
					.where(and(eq(testAttempts.userId, userId), eq(testAttempts.clientAttemptId, clientAttemptId)))
					.limit(1)
				if (existing) throw new ClientAttemptConflict(existing.id)
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
				.where(eq(testSessions.id, testSessionId))
			return { kind: 'created', attemptId: inserted.id }
		})
	} catch (error) {
		if (error instanceof ClientAttemptConflict) return { kind: 'conflict', attemptId: error.attemptId }
		throw error
	}
}

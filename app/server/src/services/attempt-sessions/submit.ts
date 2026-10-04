import { mergeTelemetryMaps, type AnswerValue, type TelemetryMap } from '@bio-exam/exam-core'

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
}

export type SubmitAttemptOutcome =
	| { kind: 'created'; attemptId: string }
	| { kind: 'replayed'; attemptId: string }
	| { kind: 'conflict'; attemptId: string | null }
	| { kind: 'closed'; reason: SessionCloseReason }
	| { kind: 'not_found' }

class ClientAttemptConflict extends Error {
	constructor(readonly attemptId: string) {
		super('client attempt id belongs to another attempt')
	}
}

function closeReasonOf(value: string | null): SessionCloseReason {
	return value === 'superseded' ? 'superseded' : 'expired'
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
					earnedPoints: scored.earnedPoints,
					totalPoints: scored.totalPoints,
					scorePercentage: scored.scorePercentage,
					passed: scored.passed,
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
					submittedAt: sql`now()`,
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

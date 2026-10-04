import {
	ATTEMPT_GRACE_PERIOD_MINUTES,
	mergeTelemetryMaps,
	type AnswerValue,
	type TelemetryMap,
} from '@bio-exam/exam-core'

import { and, desc, eq, isNull, sql, type SQL } from 'drizzle-orm'

import { db } from '../../db/index.js'
import { testSessions } from '../../db/schema.js'

export type SessionInfo = {
	sessionId: string
	startedAt: string
	draftAnswers: Record<string, unknown> | null
	draftLastQuestionId: string | null
	draftTelemetry: TelemetryMap | null
}

export type StartAttemptSessionParams = {
	testId: string
	userId: string
	timeLimitMinutes: number | null
}

export type SaveSessionDraftParams = {
	testId: string
	userId: string
	testSessionId: string
	questionId?: string
	value?: AnswerValue
	telemetry?: TelemetryMap
}

export type SaveSessionDraftResult = 'saved' | 'not_found'

type SessionRow = {
	id: string
	startedAt: Date
	draftAnswers: unknown
	draftLastQuestionId: string | null
	draftTelemetry: TelemetryMap | null
}

const sessionColumns = {
	id: testSessions.id,
	startedAt: testSessions.startedAt,
	draftAnswers: testSessions.draftAnswers,
	draftLastQuestionId: testSessions.draftLastQuestionId,
	draftTelemetry: testSessions.draftTelemetry,
}

export function sessionExpired(timeLimitMinutes: number | null): SQL<boolean> {
	return sql<boolean>`(${timeLimitMinutes}::int IS NOT NULL AND now() > ${testSessions.startedAt} + make_interval(mins => ${timeLimitMinutes}::int + ${ATTEMPT_GRACE_PERIOD_MINUTES}::int))`
}

function openSessionOf(testId: string, userId: string): SQL | undefined {
	return and(
		eq(testSessions.testId, testId),
		eq(testSessions.userId, userId),
		isNull(testSessions.submittedAt),
		isNull(testSessions.closedAt)
	)
}

function draftAnswersOf(value: unknown): Record<string, unknown> | null {
	if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
	return null
}

function toSessionInfo(row: SessionRow): SessionInfo {
	return {
		sessionId: row.id,
		startedAt: row.startedAt.toISOString(),
		draftAnswers: draftAnswersOf(row.draftAnswers),
		draftLastQuestionId: row.draftLastQuestionId ?? null,
		draftTelemetry: row.draftTelemetry ?? null,
	}
}

export async function startAttemptSession({
	testId,
	userId,
	timeLimitMinutes,
}: StartAttemptSessionParams): Promise<SessionInfo> {
	return db.transaction(async (tx) => {
		const [open] = await tx
			.select({ ...sessionColumns, expired: sessionExpired(timeLimitMinutes) })
			.from(testSessions)
			.where(openSessionOf(testId, userId))
			.orderBy(desc(testSessions.startedAt))
			.limit(1)
			.for('update')

		if (open && !open.expired) return toSessionInfo(open)

		if (open) {
			await tx
				.update(testSessions)
				.set({ closedAt: sql`now()`, closeReason: 'expired' })
				.where(and(eq(testSessions.id, open.id), isNull(testSessions.closedAt)))
		}

		const [created] = await tx
			.insert(testSessions)
			.values({ testId, userId })
			.onConflictDoNothing({
				target: [testSessions.testId, testSessions.userId],
				where: sql`${testSessions.submittedAt} IS NULL AND ${testSessions.closedAt} IS NULL`,
			})
			.returning(sessionColumns)
		if (created) return toSessionInfo(created)

		const [existing] = await tx
			.select(sessionColumns)
			.from(testSessions)
			.where(openSessionOf(testId, userId))
			.orderBy(desc(testSessions.startedAt))
			.limit(1)
		if (!existing) throw new Error('startAttemptSession: open session vanished after insert conflict')
		return toSessionInfo(existing)
	})
}

export async function saveSessionDraft({
	testId,
	userId,
	testSessionId,
	questionId,
	value,
	telemetry,
}: SaveSessionDraftParams): Promise<SaveSessionDraftResult> {
	return db.transaction(async (tx) => {
		const [session] = await tx
			.select({ draftAnswers: testSessions.draftAnswers, draftTelemetry: testSessions.draftTelemetry })
			.from(testSessions)
			.where(and(eq(testSessions.id, testSessionId), openSessionOf(testId, userId)))
			.for('update')
		if (!session) return 'not_found'

		const existingDraft = draftAnswersOf(session.draftAnswers) ?? {}
		const nextDraft =
			questionId !== undefined && value !== undefined ? { ...existingDraft, [questionId]: value } : existingDraft
		const nextTelemetry = mergeTelemetryMaps(session.draftTelemetry, telemetry)

		await tx
			.update(testSessions)
			.set({
				...(questionId !== undefined ? { draftAnswers: nextDraft, draftLastQuestionId: questionId } : {}),
				...(telemetry !== undefined ? { draftTelemetry: nextTelemetry } : {}),
				draftUpdatedAt: sql`now()`,
			})
			.where(eq(testSessions.id, testSessionId))
		return 'saved'
	})
}

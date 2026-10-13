import {
	ATTEMPT_GRACE_PERIOD_MINUTES,
	mergeTelemetryMaps,
	type AnswerValue,
	type AttemptSession,
	type TelemetryMap,
} from '@bio-exam/exam-core'

import { and, desc, eq, isNull, not, sql, type SQL, type SQLWrapper } from 'drizzle-orm'

import { db } from '../../db/index.js'
import { testSessions } from '../../db/schema.js'
import type { SessionOutcomeOf, SessionOwner } from './outcome.js'

export type SessionInfo = AttemptSession

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

export const DEADLINE_FINALIZE_MAX_AGE_HOURS = 24

export function sessionExpired(timeLimitMinutes: number | null | SQLWrapper, marginSeconds = 0): SQL<boolean> {
	const limit = sql`(${timeLimitMinutes})::int`
	return sql<boolean>`(${limit} IS NOT NULL AND now() > ${testSessions.startedAt} + make_interval(mins => ${limit} + ${ATTEMPT_GRACE_PERIOD_MINUTES}::int) + make_interval(secs => ${marginSeconds}::int))`
}

export function sessionFilter({
	sessionId,
	owner,
	open = false,
}: {
	sessionId?: string
	owner?: SessionOwner
	open?: boolean
}): SQL {
	if (sessionId === undefined && owner === undefined) throw new Error('sessionFilter: sessionId or owner is required')
	return and(
		sessionId === undefined ? undefined : eq(testSessions.id, sessionId),
		owner ? eq(testSessions.testId, owner.testId) : undefined,
		owner ? eq(testSessions.userId, owner.userId) : undefined,
		open ? isNull(testSessions.submittedAt) : undefined,
		open ? isNull(testSessions.closedAt) : undefined
	) as SQL
}

export async function closeSessionsAsExpired(
	executor: Pick<typeof db, 'update'>,
	where: SQL | undefined
): Promise<string[]> {
	const closed = await executor
		.update(testSessions)
		.set({ closedAt: sql`now()`, closeReason: 'expired' })
		.where(and(where, isNull(testSessions.submittedAt), isNull(testSessions.closedAt)))
		.returning({ id: testSessions.id })
	return closed.map((row) => row.id)
}

function draftAnswersOf(value: unknown): Record<string, unknown> | null {
	if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
	return null
}

function hasDraftAnswers(value: unknown): boolean {
	return Object.keys(draftAnswersOf(value) ?? {}).length > 0
}

async function readServerNow(tx: Pick<typeof db, 'execute'>): Promise<string> {
	const result = await tx.execute<{ now: Date | string }>(sql`SELECT clock_timestamp() AS now`)
	const row = result.rows[0]
	if (!row) throw new Error('readServerNow: clock_timestamp() returned no rows')
	return new Date(row.now).toISOString()
}

export function databaseNow(): Promise<string> {
	return readServerNow(db)
}

export function toSessionInfo(row: SessionRow, serverNow: string): SessionInfo {
	return {
		serverNow,
		sessionId: row.id,
		startedAt: row.startedAt.toISOString(),
		draftAnswers: draftAnswersOf(row.draftAnswers),
		draftLastQuestionId: row.draftLastQuestionId ?? null,
		draftTelemetry: row.draftTelemetry ?? null,
	}
}

export type OpenOrStartResult = SessionOutcomeOf<'open'> | { kind: 'needs_finalization'; sessionId: string }

export async function openOrStartSession(
	owner: SessionOwner,
	timeLimitMinutes: number | null
): Promise<OpenOrStartResult> {
	return db.transaction(async (tx): Promise<OpenOrStartResult> => {
		const [open] = await tx
			.select({
				...sessionColumns,
				expired: sessionExpired(timeLimitMinutes),
				stale: sessionExpired(timeLimitMinutes, DEADLINE_FINALIZE_MAX_AGE_HOURS * 3600),
			})
			.from(testSessions)
			.where(sessionFilter({ owner, open: true }))
			.orderBy(desc(testSessions.startedAt))
			.limit(1)
			.for('update')

		if (open && !open.expired) return { kind: 'open', session: toSessionInfo(open, await readServerNow(tx)) }

		if (open) {
			if (hasDraftAnswers(open.draftAnswers) && !open.stale) return { kind: 'needs_finalization', sessionId: open.id }
			await closeSessionsAsExpired(tx, sessionFilter({ sessionId: open.id }))
		}

		const [created] = await tx
			.insert(testSessions)
			.values({ testId: owner.testId, userId: owner.userId })
			.onConflictDoNothing({
				target: [testSessions.testId, testSessions.userId],
				where: sql`${testSessions.submittedAt} IS NULL AND ${testSessions.closedAt} IS NULL`,
			})
			.returning(sessionColumns)
		if (created) return { kind: 'open', session: toSessionInfo(created, await readServerNow(tx)) }

		const [existing] = await tx
			.select(sessionColumns)
			.from(testSessions)
			.where(sessionFilter({ owner, open: true }))
			.orderBy(desc(testSessions.startedAt))
			.limit(1)
		if (!existing) throw new Error('startAttemptSession: open session vanished after insert conflict')
		return { kind: 'open', session: toSessionInfo(existing, await readServerNow(tx)) }
	})
}

export type WriteDraftResult = SessionOutcomeOf<'saved'> | { kind: 'not_written' }

export async function writeSessionDraft(params: {
	owner: SessionOwner
	sessionId: string
	timeLimitMinutes: number | null
	questionId?: string
	value?: AnswerValue
	telemetry?: TelemetryMap
}): Promise<WriteDraftResult> {
	const { owner, sessionId, timeLimitMinutes, questionId, value, telemetry } = params
	return db.transaction(async (tx): Promise<WriteDraftResult> => {
		const [session] = await tx
			.select({ draftAnswers: testSessions.draftAnswers, draftTelemetry: testSessions.draftTelemetry })
			.from(testSessions)
			.where(and(sessionFilter({ sessionId, owner, open: true }), not(sessionExpired(timeLimitMinutes))))
			.for('update')
		if (!session) return { kind: 'not_written' }

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
			.where(eq(testSessions.id, sessionId))
		return { kind: 'saved', serverNow: await readServerNow(tx) }
	})
}

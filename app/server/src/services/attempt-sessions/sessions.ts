import {
	ATTEMPT_GRACE_PERIOD_MINUTES,
	findAnswerViolation,
	mergeTelemetryMaps,
	type AnswerValue,
	type AnswerViolation,
	type AttemptSession,
	type TelemetryMap,
} from '@bio-exam/exam-core'

import { and, desc, eq, isNull, not, sql, type SQL, type SQLWrapper } from 'drizzle-orm'

import { db } from '../../db/index.js'
import { questions, testSessions } from '../../db/schema.js'
import { getQuestionTypeMapForTest } from '../../lib/tests/question-type-resolver.js'

export type SessionInfo = AttemptSession

export type StartAttemptSessionParams = {
	testId: string
	userId: string
	timeLimitMinutes: number | null
}

export type SaveSessionDraftParams = {
	testId: string
	userId: string
	testSessionId: string
	timeLimitMinutes: number | null
	questionId?: string
	value?: AnswerValue
	telemetry?: TelemetryMap
}

export type SaveSessionDraftResult =
	| { kind: 'saved'; serverNow: string }
	| { kind: 'not_found' }
	| { kind: 'invalid'; violation: AnswerViolation }

export class SessionNeedsFinalizationError extends Error {
	constructor(readonly sessionId: string) {
		super(`session ${sessionId} needs deadline finalization`)
	}
}

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

export function openSessionOf(testId: string, userId: string): SQL | undefined {
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

function toSessionInfo(row: SessionRow, serverNow: string): SessionInfo {
	return {
		serverNow,
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
			.select({
				...sessionColumns,
				expired: sessionExpired(timeLimitMinutes),
				stale: sessionExpired(timeLimitMinutes, DEADLINE_FINALIZE_MAX_AGE_HOURS * 3600),
			})
			.from(testSessions)
			.where(openSessionOf(testId, userId))
			.orderBy(desc(testSessions.startedAt))
			.limit(1)
			.for('update')

		if (open && !open.expired) return toSessionInfo(open, await readServerNow(tx))

		if (open) {
			if (hasDraftAnswers(open.draftAnswers) && !open.stale) throw new SessionNeedsFinalizationError(open.id)
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
		if (created) return toSessionInfo(created, await readServerNow(tx))

		const [existing] = await tx
			.select(sessionColumns)
			.from(testSessions)
			.where(openSessionOf(testId, userId))
			.orderBy(desc(testSessions.startedAt))
			.limit(1)
		if (!existing) throw new Error('startAttemptSession: open session vanished after insert conflict')
		return toSessionInfo(existing, await readServerNow(tx))
	})
}

export async function saveSessionDraft({
	testId,
	userId,
	testSessionId,
	timeLimitMinutes,
	questionId,
	value,
	telemetry,
}: SaveSessionDraftParams): Promise<SaveSessionDraftResult> {
	if (questionId !== undefined && value !== undefined) {
		const [question] = await db
			.select({ type: questions.type })
			.from(questions)
			.where(and(eq(questions.id, questionId), eq(questions.testId, testId)))
		const template = question
			? ((await getQuestionTypeMapForTest({ testId, includeInactive: true }))[question.type]?.uiTemplate ?? null)
			: null
		const violation = findAnswerViolation({
			answers: { [questionId]: value },
			questions: question ? [{ id: questionId, template }] : [],
		})
		if (violation) return { kind: 'invalid' as const, violation }
	}

	return db.transaction(async (tx): Promise<SaveSessionDraftResult> => {
		const [session] = await tx
			.select({ draftAnswers: testSessions.draftAnswers, draftTelemetry: testSessions.draftTelemetry })
			.from(testSessions)
			.where(
				and(eq(testSessions.id, testSessionId), openSessionOf(testId, userId), not(sessionExpired(timeLimitMinutes)))
			)
			.for('update')
		if (!session) return { kind: 'not_found' }

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
		return { kind: 'saved', serverNow: await readServerNow(tx) }
	})
}

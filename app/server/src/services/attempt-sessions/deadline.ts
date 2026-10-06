import { AnswerValueSchema, findAnswerViolation, type AnswerValue } from '@bio-exam/exam-core'

import { and, eq, type SQL } from 'drizzle-orm'

import { db } from '../../db/index.js'
import { questions, testAttempts, testSessions, tests, topics } from '../../db/schema.js'
import { isTransientDbError } from '../../lib/db-errors.js'
import { logger } from '../../lib/logger.js'
import { getQuestionTypeMapForTest } from '../../lib/tests/question-type-resolver.js'
import { scoreSubmission } from '../scored-attempt/index.js'
import { explanationReaderFor } from './explanations.js'
import { DEADLINE_FINALIZE_MAX_AGE_HOURS, sessionExpired } from './sessions.js'
import { closeExpiredSession, submitAttempt, type SubmitAttemptOutcome } from './submit.js'

export type DeadlineOwner = { testId: string; userId: string }

export type FinalizeOutcome =
	| { kind: 'open' }
	| { kind: 'finalized'; attemptId: string }
	| { kind: 'submitted'; attemptId: string | null }
	| { kind: 'expired' }
	| { kind: 'superseded' }
	| { kind: 'not_found' }

export const DEADLINE_CLIENT_ATTEMPT_PREFIX = 'deadline:'

const MAX_DRAFT_ROUNDS = 3

const DRAFT_CHANGED = Symbol('draft_changed')

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

function sessionWhere(sessionId: string, owner: DeadlineOwner | undefined): SQL | undefined {
	if (!owner) return eq(testSessions.id, sessionId)
	return and(
		eq(testSessions.id, sessionId),
		eq(testSessions.testId, owner.testId),
		eq(testSessions.userId, owner.userId)
	)
}

function draftEntriesOf(value: unknown): [string, unknown][] {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return []
	return Object.entries(value as Record<string, unknown>)
}

async function scorableDraft(sessionId: string, testId: string, draft: unknown): Promise<Record<string, AnswerValue>> {
	const entries = draftEntriesOf(draft)
	if (entries.length === 0) return {}

	const rows = await db
		.select({ id: questions.id, type: questions.type })
		.from(questions)
		.where(eq(questions.testId, testId))
	const typeMap = await getQuestionTypeMapForTest({ testId, includeInactive: true })
	const templates = new Map(rows.map((row) => [row.id, typeMap[row.type]?.uiTemplate ?? null]))

	const kept: Record<string, AnswerValue> = {}
	for (const [questionId, raw] of entries) {
		const parsed = AnswerValueSchema.safeParse(raw)
		const reason = !parsed.success
			? 'invalid_value'
			: findAnswerViolation({
					answers: { [questionId]: parsed.data },
					questions: templates.has(questionId) ? [{ id: questionId, template: templates.get(questionId) ?? null }] : [],
				})?.reason
		if (parsed.success && !reason) {
			kept[questionId] = parsed.data
			continue
		}
		logger.warn({ sessionId, questionId, reason }, 'deadline finalize dropped draft answer')
	}
	return kept
}

function outcomeOfSubmit(outcome: Exclude<SubmitAttemptOutcome, { kind: 'draft_changed' }>): FinalizeOutcome {
	switch (outcome.kind) {
		case 'created':
		case 'replayed':
			return { kind: 'finalized', attemptId: outcome.attemptId }
		case 'conflict':
			return { kind: 'submitted', attemptId: outcome.attemptId }
		case 'closed':
			return outcome.reason === 'superseded' ? { kind: 'superseded' } : { kind: 'expired' }
		case 'not_found':
			return { kind: 'not_found' }
	}
}

async function finalizeDraft(
	sessionId: string,
	session: DeadlineSession
): Promise<FinalizeOutcome | typeof DRAFT_CHANGED> {
	const answers = await scorableDraft(sessionId, session.testId, session.draftAnswers)
	if (Object.keys(answers).length === 0) {
		await closeExpiredSession(sessionId)
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
			await closeExpiredSession(sessionId)
			return { kind: 'expired' }
		}
		throw new Error(`finalizeSessionByDeadline: answers invalid after filter in session ${sessionId}`)
	}

	const outcome = await submitAttempt({
		testId: session.testId,
		userId: session.userId,
		testSessionId: sessionId,
		clientAttemptId: deadlineClientAttemptId(sessionId),
		answers,
		scored: {
			results: scored.facts,
			resultsVersion: 2,
			earnedPoints: scored.earnedPoints,
			totalPoints: scored.totalPoints,
			scorePercentage: scored.scorePercentage,
			passed: scored.passed,
			outcome: scored.outcome,
			passingScore: scored.passingScore,
		},
		source: 'deadline',
		timeLimitMinutes: session.timeLimitMinutes,
		uploadWindowMinutes: session.photoUploadWindowMinutes,
		hasOpenQuestion: scored.facts.some((fact) => fact.template === 'open'),
		expectedDraft: session.draftAnswers,
	})
	if (outcome.kind === 'draft_changed') return DRAFT_CHANGED
	return outcomeOfSubmit(outcome)
}

async function finalizeOnce(
	sessionId: string,
	owner: DeadlineOwner | undefined
): Promise<FinalizeOutcome | typeof DRAFT_CHANGED> {
	const [row] = await db
		.select({
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
			attemptClientId: testAttempts.clientAttemptId,
		})
		.from(testSessions)
		.innerJoin(tests, eq(tests.id, testSessions.testId))
		.innerJoin(topics, eq(topics.id, tests.topicId))
		.leftJoin(testAttempts, eq(testAttempts.id, testSessions.attemptId))
		.where(sessionWhere(sessionId, owner))
		.limit(1)

	if (!row) return { kind: 'not_found' }
	if (row.submittedAt) {
		if (row.attemptId && row.attemptClientId === deadlineClientAttemptId(sessionId)) {
			return { kind: 'finalized', attemptId: row.attemptId }
		}
		return { kind: 'submitted', attemptId: row.attemptId }
	}
	if (row.closedAt) return row.closeReason === 'superseded' ? { kind: 'superseded' } : { kind: 'expired' }
	if (!row.expired) return { kind: 'open' }

	if (row.stale) {
		await closeExpiredSession(sessionId)
		logger.info({ sessionId, maxAgeHours: DEADLINE_FINALIZE_MAX_AGE_HOURS }, 'deadline finalize skipped stale session')
		return { kind: 'expired' }
	}

	try {
		return await finalizeDraft(sessionId, row)
	} catch (error) {
		if (isTransientDbError(error)) throw error
		logger.error({ sessionId, err: error }, 'deadline finalize failed, session closed as expired')
		await closeExpiredSession(sessionId)
		return { kind: 'expired' }
	}
}

export async function finalizeSessionByDeadline(sessionId: string, owner?: DeadlineOwner): Promise<FinalizeOutcome> {
	for (let round = 0; round < MAX_DRAFT_ROUNDS; round++) {
		const outcome = await finalizeOnce(sessionId, owner)
		if (outcome !== DRAFT_CHANGED) return outcome
	}
	throw new Error('finalizeSessionByDeadline: draft kept changing')
}

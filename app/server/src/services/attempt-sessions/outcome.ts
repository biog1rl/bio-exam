import type { AnswerViolation, AttemptSubmitSource } from '@bio-exam/exam-core'

import type { AttemptTest } from './access.js'
import type { SessionInfo } from './sessions.js'

export type SessionOwner = { testId: string; userId: string }

export type SessionTest = Pick<
	AttemptTest,
	'id' | 'slug' | 'topicSlug' | 'timeLimitMinutes' | 'photoUploadWindowMinutes' | 'passingScore'
>

export type AttemptPair = { test: SessionTest; userId: string }

export type SessionOutcome =
	| { kind: 'open'; session: SessionInfo }
	| { kind: 'saved'; serverNow: string }
	| { kind: 'accepted'; attemptId: string }
	| { kind: 'finalized'; attemptId: string }
	| { kind: 'submitted'; attemptId: string | null }
	| { kind: 'expired' }
	| { kind: 'superseded' }
	| { kind: 'not_found' }
	| { kind: 'answers_invalid'; violation: AnswerViolation }
	| { kind: 'no_questions' }

export type SessionOutcomeOf<K extends SessionOutcome['kind']> = Extract<SessionOutcome, { kind: K }>

export type SettledOutcome = SessionOutcomeOf<
	'open' | 'finalized' | 'submitted' | 'expired' | 'superseded' | 'not_found'
>

export function ownerOf(pair: AttemptPair): SessionOwner {
	return { testId: pair.test.id, userId: pair.userId }
}

export function classifySubmitted(attempt: {
	id: string | null
	submitSource: AttemptSubmitSource | null
}): SessionOutcomeOf<'finalized' | 'submitted'> {
	if (attempt.id !== null && attempt.submitSource === 'deadline') return { kind: 'finalized', attemptId: attempt.id }
	return { kind: 'submitted', attemptId: attempt.id }
}

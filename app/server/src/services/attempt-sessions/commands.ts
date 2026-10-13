import type { SaveAttemptDraftRequest, SubmitAttemptRequest } from '@bio-exam/exam-core'

import { scoreSubmission } from '../scored-attempt/index.js'
import { finalizeSessionByDeadline } from './deadline.js'
import { draftAnswerRule } from './draft-answers.js'
import { explanationReaderFor } from './explanations.js'
import { ownerOf, type AttemptPair, type SessionOutcomeOf, type SettledOutcome } from './outcome.js'
import { openOrStartSession, writeSessionDraft } from './sessions.js'
import { precheckSubmit, submitAttempt } from './submit.js'

export async function startAttemptSession(pair: AttemptPair): Promise<SessionOutcomeOf<'open'>> {
	const owner = ownerOf(pair)
	const first = await openOrStartSession(owner, pair.test.timeLimitMinutes)
	if (first.kind === 'open') return first

	await finalizeSessionByDeadline(first.sessionId, owner)
	const second = await openOrStartSession(owner, pair.test.timeLimitMinutes)
	if (second.kind === 'open') return second
	throw new Error(`startAttemptSession: session ${second.sessionId} still needs deadline finalization`)
}

export async function saveSessionDraft(
	pair: AttemptPair,
	sessionId: string,
	draft: SaveAttemptDraftRequest
): Promise<SessionOutcomeOf<'saved' | 'answers_invalid'> | SettledOutcome> {
	const owner = ownerOf(pair)
	const { questionId, value, telemetry } = draft
	if (questionId !== undefined && value !== undefined) {
		const verdict = (await draftAnswerRule(pair.test.id))(questionId, value)
		if (!verdict.ok) return { kind: 'answers_invalid', violation: verdict.violation }
	}

	const written = await writeSessionDraft({
		owner,
		sessionId,
		timeLimitMinutes: pair.test.timeLimitMinutes,
		questionId,
		value,
		telemetry,
	})
	if (written.kind === 'saved') return written
	return finalizeSessionByDeadline(sessionId, owner)
}

export async function submitSession(
	pair: AttemptPair,
	request: SubmitAttemptRequest
): Promise<
	SessionOutcomeOf<
		'accepted' | 'finalized' | 'submitted' | 'expired' | 'superseded' | 'not_found' | 'answers_invalid' | 'no_questions'
	>
> {
	const owner = ownerOf(pair)
	const { sessionId, clientAttemptId, answers, telemetry } = request
	const precheck = await precheckSubmit(owner, { sessionId, clientAttemptId }, pair.test.timeLimitMinutes)
	if (precheck.kind === 'past_deadline') {
		const finalized = await finalizeSessionByDeadline(sessionId, owner)
		if (finalized.kind !== 'open') return finalized
	} else if (precheck.kind !== 'writable') {
		return precheck
	}

	const scored = await scoreSubmission({
		testId: pair.test.id,
		answers,
		passingScore: pair.test.passingScore,
		readExplanation: explanationReaderFor(pair.test),
	})
	if (!scored.ok) {
		if (scored.reason === 'no_questions') return { kind: 'no_questions' }
		return { kind: 'answers_invalid', violation: scored.violation }
	}

	return submitAttempt({
		owner,
		sessionId,
		clientAttemptId,
		answers,
		telemetry,
		scored,
		test: pair.test,
		source: 'client',
	})
}

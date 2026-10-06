import type { SaveAttemptDraftRequest } from '@bio-exam/exam-core'

import { finalizeSessionByDeadline } from './deadline.js'
import { draftAnswerRule } from './draft-answers.js'
import { ownerOf, type AttemptPair, type SessionOutcomeOf, type SettledOutcome } from './outcome.js'
import { openOrStartSession, writeSessionDraft } from './sessions.js'

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

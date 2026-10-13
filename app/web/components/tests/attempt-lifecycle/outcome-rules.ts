import type { SaveOutcome } from '@/lib/drafts/save-queue'
import type { AttemptDraftSaveResult } from '@/lib/tests/api'

import { answersInvalidBanner, bannerFor, type AttemptBannerView, type SubmitRejection } from '../attempt-submit-flow'
import type { AttemptBlockReason, AttemptPhase } from './lifecycle'

export type AttemptOutcomePanel = { kind: 'result'; accepted: boolean } | { kind: 'accepted-without-result' }

export type AttemptDialog = 'start' | 'time-expired' | 'already-submitted'

export type AttemptDisplay = {
	outcome: AttemptOutcomePanel | null
	deadlinePanel: 'sending' | 'failed' | null
	banner: AttemptBannerView | null
	dialog: AttemptDialog | null
	timer: boolean
}

export type AttemptDisplayInput = {
	phase: AttemptPhase
	blockReason: AttemptBlockReason | null
	submitFailed: boolean
	submitRejection: SubmitRejection | null
	deadlinePassed: boolean
	hasResult: boolean
	acceptedAutomatically: boolean
	alreadySubmittedDismissed: boolean
	timed: boolean
}

function outcomeOf(input: AttemptDisplayInput): AttemptOutcomePanel | null {
	if (input.hasResult) return { kind: 'result', accepted: input.acceptedAutomatically }
	if (input.phase === 'submitted' && input.acceptedAutomatically) return { kind: 'accepted-without-result' }
	return null
}

function bannerOf(input: AttemptDisplayInput): AttemptBannerView | null {
	if (input.submitRejection) return answersInvalidBanner(input.submitRejection)
	const reason = input.blockReason
	if (reason === 'start-not-assigned' || reason === 'submit-not-assigned' || reason === 'not-found') {
		return bannerFor(reason)
	}
	if (reason === 'already-submitted') {
		return input.alreadySubmittedDismissed ? bannerFor('already-submitted') : null
	}
	return input.submitFailed && !input.deadlinePassed ? bannerFor('retry') : null
}

function dialogOf(input: AttemptDisplayInput): AttemptDialog | null {
	if (input.phase === 'awaitingStart') return 'start'
	if (input.blockReason === 'time-expired') return 'time-expired'
	if (input.blockReason === 'already-submitted' && !input.alreadySubmittedDismissed) return 'already-submitted'
	return null
}

export function saveOutcomeOf(result: AttemptDraftSaveResult): SaveOutcome {
	if (result.kind !== 'response') return { kind: 'retry' }
	if (result.status >= 200 && result.status < 300) return { kind: 'ok' }
	if (result.status === 400) return { kind: 'reject', status: 400 }
	if (result.status === 403 || result.status === 404) return { kind: 'stop', status: result.status }
	return { kind: 'retry' }
}

export function attemptDisplay(input: AttemptDisplayInput): AttemptDisplay {
	const outcome = outcomeOf(input)
	const deadlinePanel =
		input.deadlinePassed && outcome === null && input.phase !== 'blocked'
			? input.submitFailed && input.phase === 'active'
				? 'failed'
				: 'sending'
			: null
	return {
		outcome,
		deadlinePanel,
		banner: bannerOf(input),
		dialog: dialogOf(input),
		timer: input.timed && outcome === null,
	}
}

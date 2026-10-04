import { mergeTelemetryMaps, type AnswerValue, type AttemptSession, type TelemetryMap } from '@bio-exam/exam-core'

import { parseAnswers, parseTelemetry, type WalRecord } from './wal'

export type RestoreInput = {
	server: AttemptSession | null
	wal: WalRecord | null
	cachedSessionId: string | null
	questionIds: readonly string[]
}

export type RestoredDraft = {
	sessionId: string | null
	answers: Record<string, AnswerValue>
	pending: string[]
	position: string | null
	telemetry: TelemetryMap
	telemetryPending: boolean
}

function known(questionIds: readonly string[], id: string | null | undefined): string | null {
	return id && questionIds.includes(id) ? id : null
}

export function resolveRestoredDraft({ server, wal, cachedSessionId, questionIds }: RestoreInput): RestoredDraft {
	const sessionId = server ? server.sessionId : cachedSessionId
	const answers: Record<string, AnswerValue> = server ? parseAnswers(server.draftAnswers) : {}
	const serverTelemetry = server ? parseTelemetry(server.draftTelemetry) : {}
	const pending: string[] = []
	const sameSession = wal !== null && wal.sessionId !== null && wal.sessionId === sessionId
	const detached = wal !== null && wal.sessionId === null

	if (wal && detached) {
		for (const [questionId, value] of Object.entries(wal.answers)) {
			answers[questionId] = value
			pending.push(questionId)
		}
	} else if (wal && sameSession) {
		if (!server) Object.assign(answers, wal.answers)
		for (const questionId of wal.pending) {
			const value = wal.answers[questionId]
			if (value === undefined) continue
			answers[questionId] = value
			pending.push(questionId)
		}
	}

	const accepted = wal !== null && (detached || sameSession)
	const position =
		(sameSession ? known(questionIds, wal?.position) : null) ??
		known(questionIds, server?.draftLastQuestionId) ??
		questionIds[0] ??
		null
	const telemetry = accepted && wal ? mergeTelemetryMaps(wal.telemetry, serverTelemetry) : serverTelemetry
	const telemetryPending = accepted && wal !== null && wal.telemetryPending && Object.keys(wal.telemetry).length > 0

	return { sessionId, answers, pending, position, telemetry, telemetryPending }
}

export type QuestionTelemetry = {
	timeSpentMs: number
	focusLossCount: number
	visitCount: number
}

export type TelemetryMap = Record<string, QuestionTelemetry>

export function mergeTelemetryMaps(...snapshots: Array<TelemetryMap | null | undefined>): TelemetryMap {
	const merged: TelemetryMap = {}

	for (const snapshot of snapshots) {
		if (!snapshot) continue
		for (const [questionId, entry] of Object.entries(snapshot)) {
			const current = merged[questionId]
			merged[questionId] = current
				? {
						timeSpentMs: Math.max(current.timeSpentMs, entry.timeSpentMs),
						focusLossCount: Math.max(current.focusLossCount, entry.focusLossCount),
						visitCount: Math.max(current.visitCount, entry.visitCount),
					}
				: { ...entry }
		}
	}

	return merged
}

function getQuestionTelemetryEntry(telemetry: TelemetryMap, questionId: string): QuestionTelemetry {
	return (
		telemetry[questionId] ?? {
			timeSpentMs: 0,
			focusLossCount: 0,
			visitCount: 0,
		}
	)
}

export function appendQuestionTime(telemetry: TelemetryMap, questionId: string, elapsedMs: number): TelemetryMap {
	if (!questionId || elapsedMs <= 0) return telemetry

	const current = getQuestionTelemetryEntry(telemetry, questionId)
	return {
		...telemetry,
		[questionId]: {
			...current,
			timeSpentMs: current.timeSpentMs + elapsedMs,
		},
	}
}

export function incrementQuestionVisit(telemetry: TelemetryMap, questionId: string): TelemetryMap {
	if (!questionId) return telemetry

	const current = getQuestionTelemetryEntry(telemetry, questionId)
	return {
		...telemetry,
		[questionId]: {
			...current,
			visitCount: current.visitCount + 1,
		},
	}
}

export function incrementQuestionFocusLoss(telemetry: TelemetryMap, questionId: string): TelemetryMap {
	if (!questionId) return telemetry

	const current = getQuestionTelemetryEntry(telemetry, questionId)
	return {
		...telemetry,
		[questionId]: {
			...current,
			focusLossCount: current.focusLossCount + 1,
		},
	}
}

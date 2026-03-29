export type QuestionTelemetry = {
	timeSpentMs: number
	focusLossCount: number
	visitCount: number
}

export type TelemetryMap = Record<string, QuestionTelemetry>

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

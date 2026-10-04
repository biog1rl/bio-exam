import { z } from 'zod'

export const QuestionTelemetrySchema = z.object({
	timeSpentMs: z.number().int().nonnegative(),
	focusLossCount: z.number().int().nonnegative(),
	visitCount: z.number().int().nonnegative(),
})

export const TelemetryMapSchema = z.record(z.string().uuid(), QuestionTelemetrySchema)

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

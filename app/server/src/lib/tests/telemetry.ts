import type { TelemetryMap } from '../../db/schema.js'

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

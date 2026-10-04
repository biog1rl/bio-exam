export const REFRESH_LEAD_MS = 60_000

export function refreshDelayMs(accessExpiresAt: string | null, nowMs: number): number | null {
	if (accessExpiresAt === null) return null
	const expiresAtMs = Date.parse(accessExpiresAt)
	if (Number.isNaN(expiresAtMs)) return null
	return Math.max(0, expiresAtMs - REFRESH_LEAD_MS - nowMs)
}

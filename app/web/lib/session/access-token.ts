export const REFRESH_THRESHOLD_SEC = 60

export type AccessPayload = {
	sid: string | null
	exp: number | null
}

function decodeBase64Url(part: string): string {
	const base64 = part.replace(/-/g, '+').replace(/_/g, '/')
	const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
	const binary = atob(padded)
	const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
	return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}

function decodePayloadRecord(token: string | null | undefined): Record<string, unknown> | null {
	if (typeof token !== 'string') return null
	const parts = token.split('.')
	if (parts.length !== 3 || !parts[1]) return null
	let payload: unknown
	try {
		payload = JSON.parse(decodeBase64Url(parts[1]))
	} catch {
		return null
	}
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
	return payload as Record<string, unknown>
}

function finiteNumber(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function toAccessPayload(record: Record<string, unknown>): AccessPayload {
	return {
		sid: typeof record.sid === 'string' && record.sid.length > 0 ? record.sid : null,
		exp: finiteNumber(record.exp),
	}
}

function refreshThresholdSec(iat: number | null, exp: number): number {
	if (iat === null || exp <= iat) return REFRESH_THRESHOLD_SEC
	return Math.min(REFRESH_THRESHOLD_SEC, (exp - iat) / 2)
}

export function needsRefresh(input: {
	accessToken: string | null | undefined
	hasRefresh: boolean
	nowSec: number
}): boolean {
	if (!input.hasRefresh) return false
	if (!input.accessToken) return true
	const record = decodePayloadRecord(input.accessToken)
	if (!record) return true
	const payload = toAccessPayload(record)
	if (!payload.sid || payload.exp === null) return true
	return payload.exp - input.nowSec <= refreshThresholdSec(finiteNumber(record.iat), payload.exp)
}

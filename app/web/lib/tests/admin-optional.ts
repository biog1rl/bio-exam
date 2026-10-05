import { RequestError, type RequestOutcome } from '@/lib/http/request'

export function optionalAdminData<T>(outcome: RequestOutcome<T>): T | null {
	if (outcome.ok) return outcome.data
	if (outcome.kind === 'auth') return null
	if (outcome.kind === 'http' && (outcome.status === 401 || outcome.status === 403)) return null
	throw new RequestError(outcome)
}

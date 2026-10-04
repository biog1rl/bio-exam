export type ObjectAccess = 'ok' | 'denied' | 'missing' | 'error'

export function objectAccess(status: number): ObjectAccess {
	if (status === 200) return 'ok'
	if (status === 403) return 'denied'
	if (status === 404) return 'missing'
	return 'error'
}

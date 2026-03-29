import { parseAuthMe, type AuthMe } from './authMePayload'
import { tryRefreshSession } from './refresh'

export type { AuthMe } from './authMePayload'

async function readAuthMeResponse(): Promise<{ response: Response; body: unknown | null }> {
	const response = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' })
	const body = await response.json().catch(() => null)
	return { response, body }
}

function shouldTryRefresh(response: Response, body: unknown): boolean {
	if (response.status === 401) return true

	const payload = body && typeof body === 'object' ? (body as Record<string, unknown>) : null
	return response.ok && payload?.ok === false
}

export async function fetchAuthMe(): Promise<AuthMe | null> {
	let current = await readAuthMeResponse()
	let me = parseAuthMe(current.body)
	if (me) return me

	if (!shouldTryRefresh(current.response, current.body)) return null

	const refreshed = await tryRefreshSession()
	if (!refreshed) return null

	current = await readAuthMeResponse()
	me = parseAuthMe(current.body)
	return me
}

import { apiUrl } from './api-origin'

export type ProxyRefreshOutcome =
	| { kind: 'refreshed'; setCookies: string[]; values: Record<string, string> }
	| { kind: 'rejected' }
	| { kind: 'unavailable' }

type FetchLike = (input: URL, init: RequestInit) => Promise<Response>

function parseSetCookieValue(line: string): [string, string] | null {
	const pair = line.split(';', 1)[0] ?? ''
	const separator = pair.indexOf('=')
	if (separator <= 0) return null
	const name = pair.slice(0, separator).trim()
	const rawValue = pair.slice(separator + 1).trim()
	if (!name) return null
	try {
		return [name, decodeURIComponent(rawValue)]
	} catch {
		return null
	}
}

function discardBody(response: Response): void {
	response.body?.cancel().catch(() => undefined)
}

export async function refreshForProxy({
	cookieHeader,
	fetchImpl = fetch,
}: {
	cookieHeader: string
	fetchImpl?: FetchLike
}): Promise<ProxyRefreshOutcome> {
	const url = apiUrl('/api/auth/refresh')
	let response: Response
	try {
		response = await fetchImpl(url, {
			method: 'POST',
			headers: { cookie: cookieHeader },
			redirect: 'manual',
			cache: 'no-store',
		})
	} catch {
		return { kind: 'unavailable' }
	}

	discardBody(response)

	if (response.status === 401) return { kind: 'rejected' }
	if (response.status !== 200) return { kind: 'unavailable' }

	const setCookies = response.headers.getSetCookie()
	const values: Record<string, string> = {}
	for (const line of setCookies) {
		const parsed = parseSetCookieValue(line)
		if (parsed) values[parsed[0]] = parsed[1]
	}
	return { kind: 'refreshed', setCookies, values }
}

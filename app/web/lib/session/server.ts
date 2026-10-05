import { cache } from 'react'

import { cookies, headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import 'server-only'

import { parseAuthMe, type AuthMe } from '@/lib/auth/authMePayload'

import { apiUrl } from './api-origin'
import { SESSION_REFRESH_HEADER, SESSION_REFRESH_UNAVAILABLE } from './proxy-refresh'
import { buildLoginRedirect } from './redirect'

export type ServerMe = AuthMe

export type ServerOutcome<T> =
	| { kind: 'ok'; data: T }
	| { kind: 'unauthorized' }
	| { kind: 'denied' }
	| { kind: 'missing' }
	| { kind: 'error'; status?: number; cause?: unknown }

type ServerRequestOptions<T> = { parse: (body: unknown) => T }

const API_PREFIX = '/api/'

function resolveApiUrl(path: string): URL {
	if (!path.startsWith(API_PREFIX)) throw new Error('serverRequest path must start with /api/')
	const url = apiUrl(path)
	if (!url.pathname.startsWith(API_PREFIX)) throw new Error('serverRequest path must stay under /api/')
	return url
}

async function refreshUnavailable(): Promise<boolean> {
	return (await headers()).get(SESSION_REFRESH_HEADER) === SESSION_REFRESH_UNAVAILABLE
}

export async function serverRequest<T>(
	path: `/api/${string}`,
	options: ServerRequestOptions<T>
): Promise<ServerOutcome<T>> {
	const url = resolveApiUrl(path)
	const cookieStore = await cookies()

	let response: Response
	let text: string
	try {
		response = await fetch(url, {
			headers: { cookie: cookieStore.toString() },
			cache: 'no-store',
			redirect: 'error',
		})
		text = await response.text()
	} catch (cause) {
		return { kind: 'error', cause }
	}

	if (response.status === 401) {
		return (await refreshUnavailable()) ? { kind: 'error', status: 401 } : { kind: 'unauthorized' }
	}
	if (response.status === 403) return { kind: 'denied' }
	if (response.status === 404) return { kind: 'missing' }
	if (!response.ok) return { kind: 'error', status: response.status }

	let body: unknown
	try {
		body = JSON.parse(text)
	} catch {
		return { kind: 'error', status: response.status }
	}
	try {
		return { kind: 'ok', data: options.parse(body) }
	} catch (cause) {
		return { kind: 'error', status: response.status, cause }
	}
}

function describeFailure(outcome: Exclude<ServerOutcome<unknown>, { kind: 'ok' }>): string {
	if (outcome.kind === 'error') {
		return outcome.status === undefined ? 'no response' : `status ${outcome.status}`
	}
	return outcome.kind
}

export function requireServerData<T>(outcome: ServerOutcome<T>, currentPath: string): T {
	switch (outcome.kind) {
		case 'ok':
			return outcome.data
		case 'unauthorized':
			redirect(buildLoginRedirect(currentPath))
		case 'denied':
		case 'missing':
			notFound()
		case 'error':
			throw new Error(`Server request for ${currentPath} failed: ${describeFailure(outcome)}`)
	}
}

export const getServerMe = cache(async (): Promise<ServerMe | null> => {
	const outcome = await serverRequest('/api/auth/me', { parse: parseAuthMe })
	if (outcome.kind === 'ok') return outcome.data
	if (outcome.kind === 'unauthorized') return null
	if (outcome.kind === 'error' && outcome.status === 401) return null
	throw new Error(`GET /api/auth/me failed: ${describeFailure(outcome)}`, {
		cause: outcome.kind === 'error' ? outcome.cause : undefined,
	})
})

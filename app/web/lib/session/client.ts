import { parseAuthMe, type AuthMe } from '@/lib/auth/authMePayload'

import { buildLoginRedirect } from './redirect'
import { browserRefreshCoordinator, REFRESH_LOCK_TIMEOUT_MS, type RefreshCoordinator } from './refresh-coordinator'
import { httpTransport, type SessionTransport } from './transport'

export type { AuthMe } from '@/lib/auth/authMePayload'

export class AuthExpiredError extends Error {
	constructor() {
		super('Сессия истекла. Пожалуйста, войдите снова.')
		this.name = 'AuthExpiredError'
	}
}

export const LOGOUT_FAILED_MESSAGE = 'Не удалось выйти: нет связи с сервером. Попробуйте ещё раз'

export type RefreshOutcome =
	| { kind: 'ok'; accessExpiresAt: string | null }
	| { kind: 'rejected' }
	| { kind: 'unavailable' }

export type LoadMeOutcome = { kind: 'ok'; me: AuthMe } | { kind: 'rejected' } | { kind: 'unavailable' }

export type SessionClientOptions = {
	transport: SessionTransport
	navigate: (url: string) => void
	currentPath: () => string
	coordinator?: Pick<RefreshCoordinator, 'coordinate' | 'readRecord'>
}

export type SessionClient = {
	refreshOnce(): Promise<RefreshOutcome>
	fetchWithSession(url: string, init?: RequestInit): Promise<Response>
	loadMe(): Promise<LoadMeOutcome>
	logout(): Promise<boolean>
	redirectToLogin(): void
}

const AUTH_PAGE_PREFIXES = ['/login', '/invite']

function isAuthPage(path: string): boolean {
	const pathname = path.split(/[?#]/, 1)[0] ?? ''
	return AUTH_PAGE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

async function readJson(response: Response): Promise<unknown> {
	return response.json().catch(() => null)
}

function discard(response: Response): void {
	if (response.bodyUsed) return
	void response.arrayBuffer().catch(() => undefined)
}

function readAccessExpiresAt(body: unknown): string | null {
	if (!body || typeof body !== 'object') return null
	const value = (body as Record<string, unknown>).accessExpiresAt
	return typeof value === 'string' ? value : null
}

export function createSessionClient({
	transport,
	navigate,
	currentPath,
	coordinator,
}: SessionClientOptions): SessionClient {
	let pendingRefresh: Promise<RefreshOutcome> | null = null
	let navigated = false

	async function performRefresh(): Promise<RefreshOutcome> {
		let response: Response
		try {
			response = await transport.refresh(AbortSignal.timeout(REFRESH_LOCK_TIMEOUT_MS))
		} catch {
			return { kind: 'unavailable' }
		}
		if (!response.ok) {
			discard(response)
			return response.status === 401 ? { kind: 'rejected' } : { kind: 'unavailable' }
		}
		return { kind: 'ok', accessExpiresAt: readAccessExpiresAt(await readJson(response)) }
	}

	function seenSeq(): number | undefined {
		return coordinator ? (coordinator.readRecord()?.seq ?? 0) : undefined
	}

	function refreshAfter(seen: number | undefined): Promise<RefreshOutcome> {
		if (!pendingRefresh) {
			const started = coordinator ? coordinator.coordinate(performRefresh, seen) : performRefresh()
			pendingRefresh = started.finally(() => {
				pendingRefresh = null
			})
		}
		return pendingRefresh
	}

	function refreshOnce(): Promise<RefreshOutcome> {
		return refreshAfter(undefined)
	}

	function redirectToLogin(): void {
		if (navigated) return
		const path = currentPath()
		if (isAuthPage(path)) return
		navigated = true
		navigate(buildLoginRedirect(path))
	}

	function expire(): never {
		redirectToLogin()
		throw new AuthExpiredError()
	}

	async function fetchWithSession(url: string, init?: RequestInit): Promise<Response> {
		const seen = seenSeq()
		const response = await transport.request(url, init)
		if (response.status !== 401) return response

		const outcome = await refreshAfter(seen)
		if (outcome.kind === 'unavailable') return response
		discard(response)
		if (outcome.kind === 'rejected') expire()

		const retry = await transport.request(url, init)
		if (retry.status === 401) {
			discard(retry)
			expire()
		}
		return retry
	}

	async function readMe(): Promise<LoadMeOutcome | 'expired'> {
		let response: Response
		try {
			response = await transport.me()
		} catch {
			return { kind: 'unavailable' }
		}
		if (!response.ok) {
			discard(response)
			return response.status === 401 ? 'expired' : { kind: 'unavailable' }
		}
		const me = parseAuthMe(await readJson(response))
		return me ? { kind: 'ok', me } : { kind: 'rejected' }
	}

	async function loadMe(): Promise<LoadMeOutcome> {
		const seen = seenSeq()
		const first = await readMe()
		if (first !== 'expired') return first

		const outcome = await refreshAfter(seen)
		if (outcome.kind !== 'ok') return { kind: outcome.kind }

		const second = await readMe()
		return second === 'expired' ? { kind: 'rejected' } : second
	}

	async function logout(): Promise<boolean> {
		try {
			const response = await transport.logout()
			discard(response)
			navigated = true
			return true
		} catch {
			return false
		}
	}

	return { refreshOnce, fetchWithSession, loadMe, logout, redirectToLogin }
}

export const sessionRefreshCoordinator = browserRefreshCoordinator()

export const sessionClient = createSessionClient({
	transport: httpTransport,
	navigate: (url) => window.location.assign(url),
	currentPath: () => `${window.location.pathname}${window.location.search}`,
	coordinator: sessionRefreshCoordinator,
})

export function apiFetch(url: string, init?: RequestInit): Promise<Response> {
	return sessionClient.fetchWithSession(url, init)
}

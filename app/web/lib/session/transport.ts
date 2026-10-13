export type SessionTransport = {
	me(): Promise<Response>
	refresh(signal?: AbortSignal): Promise<Response>
	logout(): Promise<Response>
	request(url: string, init?: RequestInit): Promise<Response>
}

export const httpTransport: SessionTransport = {
	me: () => fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' }),
	refresh: (signal) => fetch('/api/auth/refresh', { method: 'POST', credentials: 'include', signal }),
	logout: () => fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }),
	request: (url, init) => fetch(url, { credentials: 'include', ...init }),
}

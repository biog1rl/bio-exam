export type SessionTransport = {
	me(): Promise<Response>
	refresh(): Promise<Response>
	logout(): Promise<Response>
	request(url: string, init?: RequestInit): Promise<Response>
}

export const httpTransport: SessionTransport = {
	me: () => fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' }),
	refresh: () => fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' }),
	logout: () => fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }),
	request: (url, init) => fetch(url, { credentials: 'include', ...init }),
}

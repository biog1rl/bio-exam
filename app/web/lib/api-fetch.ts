export class AuthExpiredError extends Error {
	constructor() {
		super('Сессия истекла. Пожалуйста, войдите снова.')
		this.name = 'AuthExpiredError'
	}
}

async function tryRefresh(): Promise<boolean> {
	try {
		const r = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
		return r.ok
	} catch {
		return false
	}
}

export async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
	const opts: RequestInit = { credentials: 'include', ...init }
	const response = await fetch(url, opts)
	if (response.status === 401) {
		const refreshed = await tryRefresh()
		if (!refreshed) throw new AuthExpiredError()
		const retry = await fetch(url, opts)
		if (retry.status === 401) throw new AuthExpiredError()
		return retry
	}
	return response
}

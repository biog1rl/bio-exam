import { tryRefreshSession } from '@/lib/auth/refresh'

export class AuthExpiredError extends Error {
	constructor() {
		super('Сессия истекла. Пожалуйста, войдите снова.')
		this.name = 'AuthExpiredError'
	}
}

export async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
	const opts: RequestInit = { credentials: 'include', ...init }
	const response = await fetch(url, opts)
	if (response.status === 401) {
		const refreshed = await tryRefreshSession()
		if (!refreshed) throw new AuthExpiredError()
		const retry = await fetch(url, opts)
		if (retry.status === 401) throw new AuthExpiredError()
		return retry
	}
	return response
}

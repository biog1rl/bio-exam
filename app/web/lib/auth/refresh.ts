let refreshRequest: Promise<boolean> | null = null

export async function tryRefreshSession(): Promise<boolean> {
	if (refreshRequest) return refreshRequest

	refreshRequest = fetch('/api/auth/refresh', {
		method: 'POST',
		credentials: 'include',
	})
		.then((response) => response.ok)
		.catch(() => false)
		.finally(() => {
			refreshRequest = null
		})

	return refreshRequest
}

import { apiFetch } from '@/lib/api-fetch'
import type { SearchResponse, SearchScope } from '@/types/search'

export async function searchAll(query: string, scope: SearchScope = 'all', limit = 10): Promise<SearchResponse> {
	const params = new URLSearchParams({
		q: query,
		scope,
		limit: String(limit),
	})
	const response = await apiFetch(`/api/search?${params.toString()}`)
	if (!response.ok) {
		const data = await response.json().catch(() => null)
		throw new Error(data?.error || 'Не удалось выполнить поиск')
	}
	return response.json()
}

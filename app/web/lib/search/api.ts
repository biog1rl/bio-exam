import { MalformedBodyError, request, type RequestOutcome } from '@/lib/http/request'
import type { SearchResponse, SearchScope } from '@/types/search'

function parseSearchResponse(body: unknown): SearchResponse {
	if (!body || typeof body !== 'object' || Array.isArray(body)) throw new MalformedBodyError()
	if (!Array.isArray((body as Record<string, unknown>).categories)) throw new MalformedBodyError()
	return body as SearchResponse
}

export function searchAll(
	query: string,
	scope: SearchScope = 'all',
	limit = 10,
	signal?: AbortSignal
): Promise<RequestOutcome<SearchResponse>> {
	const params = new URLSearchParams({
		q: query,
		scope,
		limit: String(limit),
	})
	return request(`/api/search?${params.toString()}`, { parse: parseSearchResponse, signal })
}

import { apiFetch } from '../api-fetch'
import type {
	AttemptReviewData,
	PublicTestDetail,
	PublicTestListItem,
	PublicTestQuestion,
	SessionInfo,
	SubmitResult,
	TestAnswerValue,
	TestAttemptSummary,
} from './types'

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
	const response = await apiFetch(url, {
		cache: 'no-store',
		...init,
		headers: {
			'Content-Type': 'application/json',
			...(init?.headers ?? {}),
		},
	})

	if (!response.ok) {
		const text = await response.text()
		throw new Error(text || `HTTP ${response.status}`)
	}

	return (await response.json()) as T
}

export async function fetchPublicTestsList() {
	return fetchJson<{ tests: PublicTestListItem[] }>('/api/tests/public/tests')
}

export async function fetchPublicTestBySlug(topicSlug: string, testSlug: string) {
	return fetchJson<{ test: PublicTestDetail; questions: PublicTestQuestion[] }>(
		`/api/tests/public/topics/${topicSlug}/tests/${testSlug}`
	)
}

export async function fetchPublicTestById(testId: string) {
	return fetchJson<{ test: PublicTestDetail; questions: PublicTestQuestion[] }>(`/api/tests/public/tests/${testId}`)
}

export async function fetchMyTestAttempts(testId: string, options?: { offset?: number; limit?: number }) {
	const params = new URLSearchParams()
	if (options?.offset !== undefined) params.set('offset', String(options.offset))
	if (options?.limit !== undefined) params.set('limit', String(options.limit))
	const qs = params.toString()
	return fetchJson<{ rows: TestAttemptSummary[]; total: number }>(
		`/api/tests/public/tests/${testId}/attempts/me${qs ? `?${qs}` : ''}`
	)
}

export type ChartDataPoint = {
	date: string
	maxScore: number
	minScore: number
	count: number
}

export async function fetchChartData(testId: string, params: { from?: string; to?: string }) {
	const qs = new URLSearchParams()
	if (params.from) qs.set('from', params.from)
	if (params.to) qs.set('to', params.to)
	const query = qs.toString()
	return fetchJson<{ data: ChartDataPoint[] }>(
		`/api/tests/public/tests/${testId}/chart-data${query ? `?${query}` : ''}`
	)
}

export async function fetchChartDefaultRange(): Promise<{ value: string }> {
	try {
		return await fetchJson<{ value: string }>('/api/settings/chart-default-range')
	} catch {
		return { value: 'month' }
	}
}

export async function fetchTopicTests(topicSlug: string) {
	return fetchJson<{ tests: PublicTestListItem[] }>(`/api/tests/public/topics/${topicSlug}/tests`)
}

export async function startTestSession(testId: string): Promise<SessionInfo> {
	return fetchJson<SessionInfo>(`/api/tests/public/tests/${testId}/start`, { method: 'POST' })
}

export async function saveAnswer(
	testId: string,
	sessionId: string,
	questionId: string,
	value: TestAnswerValue
): Promise<void> {
	// Endpoint available after 03-01 migration; errors silently ignored (localStorage WAL in TestRunner)
	// Fire-and-forget with apiFetch; errors are caught silently (localStorage is WAL backup)
	await apiFetch(`/api/tests/public/tests/${testId}/sessions/${sessionId}/answers`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ questionId, value }),
	})
}

type QuestionTelemetry = {
	timeSpentMs: number
	focusLossCount: number
	visitCount: number
}
type TelemetryMap = Record<string, QuestionTelemetry>

export async function submitPublicTestAnswers(
	testId: string,
	answers: Record<string, TestAnswerValue>,
	telemetry?: TelemetryMap
) {
	const clientAttemptId = crypto.randomUUID()
	return fetchJson<SubmitResult>(`/api/tests/public/tests/${testId}/submit`, {
		method: 'POST',
		body: JSON.stringify({ answers, clientAttemptId, telemetry }),
	})
}

export async function fetchAttemptReview(attemptId: string) {
	const res = await apiFetch(`/api/tests/admin/attempts/${attemptId}`)
	if (!res.ok) throw new Error('Failed to fetch attempt')
	return res.json() as Promise<{ attempt: AttemptReviewData; questions: PublicTestQuestion[] }>
}

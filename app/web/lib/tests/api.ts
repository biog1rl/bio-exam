import { apiFetch } from '../api-fetch'
import type {
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

export async function fetchMyTestAttempts(testId: string) {
	return fetchJson<{ attempts: TestAttemptSummary[] }>(`/api/tests/public/tests/${testId}/attempts/me`)
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

export async function submitPublicTestAnswers(testId: string, answers: Record<string, TestAnswerValue>) {
	const clientAttemptId = crypto.randomUUID()
	return fetchJson<SubmitResult>(`/api/tests/public/tests/${testId}/submit`, {
		method: 'POST',
		body: JSON.stringify({ answers, clientAttemptId }),
	})
}

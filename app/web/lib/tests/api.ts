import type {
	PublicTestDetail,
	PublicTestListItem,
	PublicTestQuestion,
	SubmitResult,
	TestAnswerValue,
	TestAttemptSummary,
} from './types'

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
	const response = await fetch(url, {
		credentials: 'include',
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

export async function submitPublicTestAnswers(testId: string, answers: Record<string, TestAnswerValue>) {
	return fetchJson<SubmitResult>(`/api/tests/public/tests/${testId}/submit`, {
		method: 'POST',
		body: JSON.stringify({ answers }),
	})
}

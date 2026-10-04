import type { AttemptView, SaveAttemptDraftRequest, SubmitAttemptRequest } from '@bio-exam/exam-core'

import { apiFetch } from '../api-fetch'
import type {
	PublicTestDetail,
	PublicTestListItem,
	PublicTestQuestion,
	QuestionTelemetry,
	SessionInfo,
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

export class AttemptRequestError extends Error {
	readonly status: number
	readonly code: string | null
	readonly attemptId: string | null

	constructor(status: number, code: string | null, attemptId: string | null) {
		super(`HTTP ${status}`)
		this.name = 'AttemptRequestError'
		this.status = status
		this.code = code
		this.attemptId = attemptId
	}
}

function readAttemptErrorBody(text: string): { code: string | null; attemptId: string | null } {
	try {
		const body: unknown = JSON.parse(text)
		if (!body || typeof body !== 'object' || Array.isArray(body)) return { code: null, attemptId: null }
		const record = body as Record<string, unknown>
		return {
			code: typeof record.error === 'string' ? record.error : null,
			attemptId: typeof record.attemptId === 'string' ? record.attemptId : null,
		}
	} catch {
		return { code: null, attemptId: null }
	}
}

async function fetchAttemptJson<T>(url: string, init?: RequestInit): Promise<T> {
	const response = await apiFetch(url, {
		cache: 'no-store',
		...init,
		headers: {
			'Content-Type': 'application/json',
			...(init?.headers ?? {}),
		},
	})

	if (!response.ok) {
		const text = await response.text().catch(() => '')
		const { code, attemptId } = readAttemptErrorBody(text)
		throw new AttemptRequestError(response.status, code, attemptId)
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

export async function fetchPublicTestSummary(topicSlug: string, testSlug: string) {
	return fetchJson<{ test: PublicTestDetail }>(`/api/tests/public/topics/${topicSlug}/tests/${testSlug}?view=summary`)
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
	return fetchAttemptJson<SessionInfo>(`/api/tests/public/tests/${testId}/start`, { method: 'POST' })
}

export async function saveAnswer(
	testId: string,
	sessionId: string,
	questionId: string,
	value: TestAnswerValue,
	telemetry?: TelemetryMap
): Promise<void> {
	// Errors silently ignored (localStorage WAL fallback)
	await apiFetch(`/api/tests/public/tests/${testId}/sessions/${sessionId}/answers`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ questionId, value, telemetry }),
	})
}

type TelemetryMap = Record<string, QuestionTelemetry>

export async function saveSessionTelemetry(testId: string, sessionId: string, telemetry: TelemetryMap): Promise<void> {
	await apiFetch(`/api/tests/public/tests/${testId}/sessions/${sessionId}/answers`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ telemetry }),
	})
}

export const KEEPALIVE_BODY_LIMIT_BYTES = 60_000

export type AttemptDraftSaveResult = { kind: 'response'; status: number } | { kind: 'network' } | { kind: 'too-large' }

export async function saveAttemptDraft(
	testId: string,
	sessionId: string,
	body: SaveAttemptDraftRequest,
	options: { keepalive: boolean }
): Promise<AttemptDraftSaveResult> {
	const json = JSON.stringify(body)
	if (options.keepalive && new TextEncoder().encode(json).length > KEEPALIVE_BODY_LIMIT_BYTES) {
		return { kind: 'too-large' }
	}
	try {
		const response = await apiFetch(`/api/tests/public/tests/${testId}/sessions/${sessionId}/answers`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: json,
			keepalive: options.keepalive,
		})
		return { kind: 'response', status: response.status }
	} catch {
		return { kind: 'network' }
	}
}

export async function submitPublicTestAnswers(testId: string, request: SubmitAttemptRequest): Promise<AttemptView> {
	return fetchAttemptJson<AttemptView>(`/api/tests/public/tests/${testId}/submit`, {
		method: 'POST',
		body: JSON.stringify(request),
	})
}

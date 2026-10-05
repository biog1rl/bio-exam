import type { AttemptSession, AttemptView, SaveAttemptDraftRequest, SubmitAttemptRequest } from '@bio-exam/exam-core'

import { request, RequestError, requestJson, type RequestOptions } from '@/lib/http/request'

import type { PublicTestDetail, PublicTestListItem, PublicTestQuestion, TestAttemptSummary } from './types'

const segment = encodeURIComponent

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

function readAttemptErrorBody(body: unknown): { code: string | null; attemptId: string | null } {
	if (!body || typeof body !== 'object' || Array.isArray(body)) return { code: null, attemptId: null }
	const record = body as Record<string, unknown>
	return {
		code: typeof record.error === 'string' ? record.error : null,
		attemptId: typeof record.attemptId === 'string' ? record.attemptId : null,
	}
}

async function fetchAttemptJson<T>(url: string, options: RequestOptions<T>): Promise<T> {
	const outcome = await request<T>(url, options)
	if (outcome.ok) return outcome.data
	if (outcome.kind === 'http' && outcome.status !== undefined) {
		const { code, attemptId } = readAttemptErrorBody(outcome.body)
		throw new AttemptRequestError(outcome.status, code, attemptId)
	}
	throw new RequestError(outcome)
}

export async function fetchPublicTestsList() {
	return requestJson<{ tests: PublicTestListItem[] }>('/api/tests/public/tests')
}

export async function fetchPublicTestBySlug(topicSlug: string, testSlug: string) {
	return requestJson<{ test: PublicTestDetail; questions: PublicTestQuestion[] }>(
		`/api/tests/public/topics/${segment(topicSlug)}/tests/${segment(testSlug)}`
	)
}

export async function fetchPublicTestSummary(topicSlug: string, testSlug: string) {
	return requestJson<{ test: PublicTestDetail }>(
		`/api/tests/public/topics/${segment(topicSlug)}/tests/${segment(testSlug)}?view=summary`
	)
}

export async function fetchMyTestAttempts(testId: string, options?: { offset?: number; limit?: number }) {
	const params = new URLSearchParams()
	if (options?.offset !== undefined) params.set('offset', String(options.offset))
	if (options?.limit !== undefined) params.set('limit', String(options.limit))
	const qs = params.toString()
	return requestJson<{ rows: TestAttemptSummary[]; total: number }>(
		`/api/tests/public/tests/${segment(testId)}/attempts/me${qs ? `?${qs}` : ''}`
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
	return requestJson<{ data: ChartDataPoint[] }>(
		`/api/tests/public/tests/${segment(testId)}/chart-data${query ? `?${query}` : ''}`
	)
}

export async function fetchChartDefaultRange(): Promise<{ value: string }> {
	try {
		return await requestJson<{ value: string }>('/api/settings/chart-default-range')
	} catch {
		return { value: 'month' }
	}
}

export async function startTestSession(testId: string): Promise<AttemptSession> {
	return fetchAttemptJson<AttemptSession>(`/api/tests/public/tests/${segment(testId)}/start`, { method: 'POST' })
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
	const outcome = await request(`/api/tests/public/tests/${segment(testId)}/sessions/${segment(sessionId)}/answers`, {
		method: 'PATCH',
		json: body,
		keepalive: options.keepalive,
	})
	if (outcome.ok) return { kind: 'response', status: outcome.status }
	if (outcome.status !== undefined) return { kind: 'response', status: outcome.status }
	return { kind: 'network' }
}

export async function submitPublicTestAnswers(testId: string, body: SubmitAttemptRequest): Promise<AttemptView> {
	return fetchAttemptJson<AttemptView>(`/api/tests/public/tests/${segment(testId)}/submit`, {
		method: 'POST',
		json: body,
	})
}

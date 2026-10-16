import {
	AttemptViewSchema,
	SessionFateSchema,
	SubmitAttemptErrorSchema,
	type AttemptSession,
	type AttemptSubmitSource,
	type AttemptView,
	type SaveAttemptDraftRequest,
	type SessionFate,
	type SubmitAttemptRequest,
} from '@bio-exam/exam-core'

import { request, RequestError, requestJson, type RequestOptions } from '@/lib/http/request'

import type { PublicTestDetail, PublicTestListItem, PublicTestQuestion, TestAttemptSummary } from './types'

const segment = encodeURIComponent

export type AttemptRequestErrorDetails = {
	submitSource?: AttemptSubmitSource | null
	uploadClosesAt?: string | null
	serverNow?: string | null
	attempt?: AttemptView | null
	questionIds?: readonly string[] | null
}

export class AttemptRequestError extends Error {
	readonly status: number
	readonly code: string | null
	readonly attemptId: string | null
	readonly reason: string | null
	readonly limit: number | null
	readonly submitSource: AttemptSubmitSource | null
	readonly uploadClosesAt: string | null
	readonly serverNow: string | null
	readonly attempt: AttemptView | null
	readonly questionIds: readonly string[]

	constructor(
		status: number,
		code: string | null,
		attemptId: string | null,
		reason: string | null = null,
		limit: number | null = null,
		details: AttemptRequestErrorDetails = {}
	) {
		super(`HTTP ${status}`)
		this.name = 'AttemptRequestError'
		this.status = status
		this.code = code
		this.attemptId = attemptId
		this.reason = reason
		this.limit = limit
		this.submitSource = details.submitSource ?? null
		this.uploadClosesAt = details.uploadClosesAt ?? null
		this.serverNow = details.serverNow ?? null
		this.attempt = details.attempt ?? null
		this.questionIds = details.questionIds ?? []
	}
}

const SubmitAttemptErrorEnvelopeSchema = SubmitAttemptErrorSchema.omit({ attempt: true })

type AttemptErrorBody = {
	code: string | null
	attemptId: string | null
	reason: string | null
	limit: number | null
	details: Required<AttemptRequestErrorDetails>
}

const EMPTY_DETAILS: Required<AttemptRequestErrorDetails> = {
	submitSource: null,
	uploadClosesAt: null,
	serverNow: null,
	attempt: null,
	questionIds: null,
}

function readAttemptErrorBody(body: unknown): AttemptErrorBody {
	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		return { code: null, attemptId: null, reason: null, limit: null, details: EMPTY_DETAILS }
	}
	const record = body as Record<string, unknown>
	const parsed = SubmitAttemptErrorEnvelopeSchema.safeParse(body)
	const envelope = parsed.success ? parsed.data : null
	const attempt = AttemptViewSchema.safeParse(record.attempt)
	return {
		code: typeof record.error === 'string' ? record.error : null,
		attemptId: typeof record.attemptId === 'string' ? record.attemptId : null,
		reason: envelope?.reason ?? null,
		limit: envelope?.limit ?? null,
		details: {
			submitSource: envelope?.submitSource ?? null,
			uploadClosesAt: envelope?.uploadClosesAt ?? null,
			serverNow: envelope?.serverNow ?? null,
			attempt: attempt.success ? attempt.data : null,
			questionIds: envelope?.questionIds ?? null,
		},
	}
}

async function fetchAttemptJson<T>(url: string, options: RequestOptions<T>): Promise<T> {
	const outcome = await request<T>(url, options)
	if (outcome.ok) return outcome.data
	if (outcome.kind === 'http' && outcome.status !== undefined) {
		const { code, attemptId, reason, limit, details } = readAttemptErrorBody(outcome.body)
		throw new AttemptRequestError(outcome.status, code, attemptId, reason, limit, details)
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

export type ChartAttemptRow = {
	id: string
	earnedPoints: number
	totalPoints: number
	scorePercentage: number
	passed: boolean
	submittedAt: string
}

export async function fetchChartData(testId: string, params: { from?: string; to?: string }) {
	const qs = new URLSearchParams()
	if (params.from) qs.set('from', params.from)
	if (params.to) qs.set('to', params.to)
	const query = qs.toString()
	return requestJson<{ attempts: ChartAttemptRow[] }>(
		`/api/tests/public/tests/${segment(testId)}/chart-data${query ? `?${query}` : ''}`
	)
}

export async function startTestSession(testId: string): Promise<AttemptSession> {
	return fetchAttemptJson<AttemptSession>(`/api/tests/public/tests/${segment(testId)}/start`, { method: 'POST' })
}

export async function readTestSession(testId: string, sessionId: string): Promise<SessionFate> {
	return fetchAttemptJson<SessionFate>(`/api/tests/public/tests/${segment(testId)}/sessions/${segment(sessionId)}`, {
		parse: (body) => SessionFateSchema.parse(body),
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

import { OpenReviewResponseSchema, type OpenReviewRequest, type OpenReviewResponse } from '@bio-exam/exam-core'

import { MalformedBodyError, request, type RequestOutcome } from '@/lib/http/request'

import type { AttemptReviewData, PublicTestQuestion } from './types'

const segment = encodeURIComponent

export type AdminAttemptResponse = { attempt: AttemptReviewData; questions: PublicTestQuestion[] }

function parseSavedReview(body: unknown): OpenReviewResponse {
	const parsed = OpenReviewResponseSchema.safeParse(body)
	if (!parsed.success) throw new MalformedBodyError()
	return parsed.data
}

function parseAdminAttempt(body: unknown): AdminAttemptResponse {
	if (!body || typeof body !== 'object') throw new MalformedBodyError()
	const record = body as Record<string, unknown>
	if (!record.attempt || typeof record.attempt !== 'object' || !Array.isArray(record.questions)) {
		throw new MalformedBodyError()
	}
	return body as AdminAttemptResponse
}

export function saveOpenReview(input: {
	attemptId: string
	questionId: string
	review: OpenReviewRequest
}): Promise<RequestOutcome<OpenReviewResponse>> {
	return request(
		`/api/tests/admin/attempts/${segment(input.attemptId)}/questions/${segment(input.questionId)}/review`,
		{
			method: 'POST',
			json: input.review,
			parse: parseSavedReview,
			fallbackMessage: 'Не удалось сохранить оценку. Повторите попытку.',
		}
	)
}

export function fetchAdminAttempt(attemptId: string): Promise<RequestOutcome<AdminAttemptResponse>> {
	return request(`/api/tests/admin/attempts/${segment(attemptId)}`, { parse: parseAdminAttempt })
}

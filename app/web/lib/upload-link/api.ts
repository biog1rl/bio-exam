import {
	AnswerPhotoDeleteResponseSchema,
	AnswerPhotoListResponseSchema,
	AnswerPhotoUploadResponseSchema,
	UPLOAD_TOKEN_HEADER,
	UploadLinkContextSchema,
	UploadLinkIssueResponseSchema,
	type AnswerPhotoDeleteResponse,
	type AnswerPhotoListResponse,
	type AnswerPhotoUploadResponse,
	type UploadLinkContext,
	type UploadLinkIssueResponse,
} from '@bio-exam/exam-core'

import { request, requestBlob, type RequestOutcome } from '@/lib/http/request'
import type { AnswerPhotoTarget } from '@/lib/tests/answer-photos-api'

const segment = encodeURIComponent

const UPLOAD_API = '/api/upload'

function tokenHeaders(token: string): Record<string, string> {
	return { [UPLOAD_TOKEN_HEADER]: token }
}

function photoPath(photoId: string): string {
	return `${UPLOAD_API}/photos/${segment(photoId)}`
}

export function issueUploadLink({
	testId,
	sessionId,
	questionId,
}: AnswerPhotoTarget): Promise<RequestOutcome<UploadLinkIssueResponse>> {
	return request(
		`/api/tests/public/tests/${segment(testId)}/sessions/${segment(sessionId)}/questions/${segment(questionId)}/upload-link`,
		{ method: 'POST', parse: (body) => UploadLinkIssueResponseSchema.parse(body) }
	)
}

export function readUploadContext(token: string): Promise<RequestOutcome<UploadLinkContext>> {
	return request(`${UPLOAD_API}/context`, {
		headers: tokenHeaders(token),
		parse: (body) => UploadLinkContextSchema.parse(body),
	})
}

export function listLinkPhotos(token: string): Promise<RequestOutcome<AnswerPhotoListResponse>> {
	return request(`${UPLOAD_API}/photos`, {
		headers: tokenHeaders(token),
		parse: (body) => AnswerPhotoListResponseSchema.parse(body),
	})
}

export function uploadLinkPhoto(
	token: string,
	photoId: string,
	blob: Blob,
	fileName: string
): Promise<RequestOutcome<AnswerPhotoUploadResponse>> {
	const form = new FormData()
	form.append('file', blob, fileName)
	return request(photoPath(photoId), {
		method: 'PUT',
		body: form,
		headers: tokenHeaders(token),
		parse: (body) => AnswerPhotoUploadResponseSchema.parse(body),
	})
}

export function deleteLinkPhoto(token: string, photoId: string): Promise<RequestOutcome<AnswerPhotoDeleteResponse>> {
	return request(photoPath(photoId), {
		method: 'DELETE',
		headers: tokenHeaders(token),
		parse: (body) => AnswerPhotoDeleteResponseSchema.parse(body),
	})
}

export function loadLinkThumb(
	token: string,
	photoId: string,
	signal?: AbortSignal
): Promise<RequestOutcome<{ blob: Blob; filename: string }>> {
	return requestBlob(`${photoPath(photoId)}/thumb`, {
		headers: tokenHeaders(token),
		signal,
		filename: `${photoId}.webp`,
	})
}

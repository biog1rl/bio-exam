import {
	AnswerPhotoDeleteResponseSchema,
	AnswerPhotoListResponseSchema,
	AnswerPhotoUploadResponseSchema,
	type AnswerPhotoDeleteResponse,
	type AnswerPhotoListResponse,
	type AnswerPhotoUploadResponse,
	type AnswerPhotoVariant,
} from '@bio-exam/exam-core'

import { request, type RequestOutcome } from '@/lib/http/request'

const segment = encodeURIComponent

export type AnswerPhotoTarget = { testId: string; sessionId: string; questionId: string }

function photosPath({ testId, sessionId, questionId }: AnswerPhotoTarget): string {
	return `/api/tests/public/tests/${segment(testId)}/sessions/${segment(sessionId)}/questions/${segment(questionId)}/photos`
}

export function uploadAnswerPhoto(
	target: AnswerPhotoTarget,
	photoId: string,
	blob: Blob,
	fileName: string
): Promise<RequestOutcome<AnswerPhotoUploadResponse>> {
	const form = new FormData()
	form.append('file', blob, fileName)
	return request(`${photosPath(target)}/${segment(photoId)}`, {
		method: 'PUT',
		body: form,
		parse: (body) => AnswerPhotoUploadResponseSchema.parse(body),
	})
}

export function listAnswerPhotos(target: AnswerPhotoTarget): Promise<RequestOutcome<AnswerPhotoListResponse>> {
	return request(photosPath(target), { parse: (body) => AnswerPhotoListResponseSchema.parse(body) })
}

export function deleteAnswerPhoto(
	target: AnswerPhotoTarget,
	photoId: string
): Promise<RequestOutcome<AnswerPhotoDeleteResponse>> {
	return request(`${photosPath(target)}/${segment(photoId)}`, {
		method: 'DELETE',
		parse: (body) => AnswerPhotoDeleteResponseSchema.parse(body),
	})
}

export function answerPhotoUrl(photoId: string, variant: AnswerPhotoVariant): string {
	return `/api/answer-photos/${segment(photoId)}/${segment(variant)}`
}

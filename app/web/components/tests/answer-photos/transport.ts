import type { AnswerPhotoDeleteResponse, AnswerPhotoListResponse, AnswerPhotoUploadResponse } from '@bio-exam/exam-core'

import type { RequestOutcome } from '@/lib/http/request'
import {
	answerPhotoUrl,
	deleteAnswerPhoto,
	listAnswerPhotos,
	uploadAnswerPhoto,
	type AnswerPhotoTarget,
} from '@/lib/tests/answer-photos-api'
import { deleteLinkPhoto, listLinkPhotos, loadLinkThumb, uploadLinkPhoto } from '@/lib/upload-link/api'

export type PhotoThumbSource =
	| { kind: 'url'; src(photoId: string): string }
	| { kind: 'blob'; load(photoId: string, signal: AbortSignal): Promise<Blob | null> }

export type PhotoTransport = {
	key: string
	list(): Promise<RequestOutcome<AnswerPhotoListResponse>>
	upload(photoId: string, blob: Blob, fileName: string): Promise<RequestOutcome<AnswerPhotoUploadResponse>>
	remove(photoId: string): Promise<RequestOutcome<AnswerPhotoDeleteResponse>>
	thumb: PhotoThumbSource
	fullView: boolean
}

export function sessionPhotoTransport(target: AnswerPhotoTarget): PhotoTransport {
	return {
		key: `answer-photos:${target.testId}:${target.sessionId}:${target.questionId}`,
		list: () => listAnswerPhotos(target),
		upload: (photoId, blob, fileName) => uploadAnswerPhoto(target, photoId, blob, fileName),
		remove: (photoId) => deleteAnswerPhoto(target, photoId),
		thumb: { kind: 'url', src: (photoId) => answerPhotoUrl(photoId, 'thumb') },
		fullView: true,
	}
}

const LINK_PHOTOS_KEY = 'upload-link:photos'

export function linkPhotoTransport(token: string): PhotoTransport {
	return {
		key: LINK_PHOTOS_KEY,
		list: () => listLinkPhotos(token),
		upload: (photoId, blob, fileName) => uploadLinkPhoto(token, photoId, blob, fileName),
		remove: (photoId) => deleteLinkPhoto(token, photoId),
		thumb: {
			kind: 'blob',
			load: async (photoId, signal) => {
				const outcome = await loadLinkThumb(token, photoId, signal)
				return outcome.ok ? outcome.data.blob : null
			},
		},
		fullView: false,
	}
}

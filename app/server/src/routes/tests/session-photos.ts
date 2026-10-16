import { ANSWER_PHOTO_FORBIDDEN_MESSAGE, ANSWER_PHOTO_MAX_BYTES } from '@bio-exam/exam-core'

import { Router, type NextFunction, type Request, type Response } from 'express'

import { db } from '../../db/index.js'
import { sessionRequired } from '../../middleware/auth/session.js'
import { rateLimiter } from '../../middleware/rateLimiter.js'
import { singleFileUpload } from '../../middleware/upload.js'
import { validateUUID } from '../../middleware/validateParams.js'
import {
	ANSWER_PHOTO_TARGET_MISSING,
	deleteAnswerPhoto,
	FILE_MISSING,
	listAnswerPhotos,
	readPhotoSlot,
	uploadAnswerPhoto,
	type AnswerPhotoPlace,
	type PhotoSlotRefusal,
} from '../../services/answer-photos/index.js'
import { issueUploadLink } from '../../services/upload-links/index.js'
import { photoBodyGate, sendDeleteOutcome, sendIntakeBusy, sendUploadOutcome } from '../answer-photo-intake.js'

const router = Router()

const ANSWER_PATH = '/tests/:id/sessions/:sessionId/questions/:questionId'
const PHOTOS_PATH = `${ANSWER_PATH}/photos`
const PHOTO_PATH = `${PHOTOS_PATH}/:photoId`
const UPLOAD_LINK_PATH = `${ANSWER_PATH}/upload-link`

function placeOf(req: Request): AnswerPhotoPlace {
	return {
		owner: { testId: req.params.id as string, userId: req.authUser!.id },
		sessionId: req.params.sessionId as string,
		questionId: req.params.questionId as string,
	}
}

function sendSlotRefusal(res: Response, reason: PhotoSlotRefusal) {
	switch (reason) {
		case 'test_missing':
			return res.status(404).json({ error: 'Test not found' })
		case 'not_assigned':
			return res.status(403).json({ error: 'Тест не назначен' })
		case 'slot_missing':
		case 'user_inactive':
			return res.status(404).json({ error: ANSWER_PHOTO_TARGET_MISSING })
	}
}

async function answerPhotoTarget(req: Request, res: Response, next: NextFunction) {
	try {
		const slot = await readPhotoSlot(db, placeOf(req))
		if (slot.kind === 'slot') return next()
		return sendSlotRefusal(res, slot.reason)
	} catch (e) {
		return next(e)
	}
}

router.put(
	PHOTO_PATH,
	validateUUID('id'),
	validateUUID('sessionId'),
	validateUUID('questionId'),
	validateUUID('photoId'),
	sessionRequired(),
	answerPhotoTarget,
	photoBodyGate,
	singleFileUpload({ field: 'file', maxBytes: ANSWER_PHOTO_MAX_BYTES }),
	async (req, res, next) => {
		try {
			if (!req.file) return res.status(400).json({ error: FILE_MISSING })
			const outcome = await uploadAnswerPhoto(placeOf(req), req.params.photoId as string, req.file.buffer, 'session')
			return sendUploadOutcome(res, outcome)
		} catch (e) {
			if (sendIntakeBusy(res, e)) return
			return next(e)
		}
	}
)

router.delete(
	PHOTO_PATH,
	validateUUID('id'),
	validateUUID('sessionId'),
	validateUUID('questionId'),
	validateUUID('photoId'),
	sessionRequired(),
	answerPhotoTarget,
	async (req, res, next) => {
		try {
			const outcome = await deleteAnswerPhoto(placeOf(req), req.params.photoId as string)
			return sendDeleteOutcome(res, outcome)
		} catch (e) {
			return next(e)
		}
	}
)

router.get(
	PHOTOS_PATH,
	validateUUID('id'),
	validateUUID('sessionId'),
	validateUUID('questionId'),
	sessionRequired(),
	answerPhotoTarget,
	async (req, res, next) => {
		try {
			const photos = await listAnswerPhotos(placeOf(req))
			if (photos === null) return res.status(404).json({ error: ANSWER_PHOTO_TARGET_MISSING })
			return res.json({ photos })
		} catch (e) {
			return next(e)
		}
	}
)

router.post(
	UPLOAD_LINK_PATH,
	validateUUID('id'),
	validateUUID('sessionId'),
	validateUUID('questionId'),
	sessionRequired(),
	rateLimiter({
		keyPrefix: 'upload-link-issue',
		maxAttempts: 10,
		windowMs: 60_000,
		clientKey: (req) => req.authUser?.id,
	}),
	async (req, res, next) => {
		try {
			const outcome = await issueUploadLink(placeOf(req))
			switch (outcome.kind) {
				case 'issued':
					res.setHeader('Cache-Control', 'no-store')
					return res.status(201).json(outcome.link)
				case 'refused':
					return sendSlotRefusal(res, outcome.reason)
				case 'window':
					return res.status(outcome.status).json(outcome.body)
				case 'forbidden':
					return res.status(409).json({ error: ANSWER_PHOTO_FORBIDDEN_MESSAGE })
			}
		} catch (e) {
			return next(e)
		}
	}
)

export default router

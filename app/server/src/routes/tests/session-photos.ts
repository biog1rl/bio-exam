import { ANSWER_PHOTO_FORBIDDEN_MESSAGE, ANSWER_PHOTO_MAX_BYTES, answerPhotoLimitMessage } from '@bio-exam/exam-core'

import { Router, type NextFunction, type Request, type Response } from 'express'

import { sessionRequired } from '../../middleware/auth/session.js'
import { inFlightGate } from '../../middleware/in-flight-gate.js'
import { singleFileUpload } from '../../middleware/upload.js'
import { validateUUID } from '../../middleware/validateParams.js'
import { canReadTest } from '../../services/access-policy/index.js'
import {
	ANSWER_PHOTO_CONFLICT,
	ANSWER_PHOTO_NOT_FOUND,
	ANSWER_PHOTO_TARGET_MISSING,
	deleteAnswerPhoto,
	FILE_MISSING,
	findPhotoTarget,
	listAnswerPhotos,
	uploadAnswerPhoto,
	type AnswerPhotoPlace,
	type DeleteOutcome,
	type UploadOutcome,
} from '../../services/answer-photos/index.js'
import {
	IMAGE_BUSY_MESSAGE,
	IMAGE_INTAKE_CONCURRENCY,
	IMAGE_INTAKE_QUEUE_LIMIT,
	ImageRejectedError,
} from '../../services/assets/index.js'
import { checkAttemptAccess } from '../../services/attempt-sessions/index.js'

const router = Router()

const PHOTOS_PATH = '/tests/:id/sessions/:sessionId/questions/:questionId/photos'
const PHOTO_PATH = `${PHOTOS_PATH}/:photoId`
const BUSY_RETRY_AFTER_SECONDS = 5

const photoBodyGate = inFlightGate({
	limit: IMAGE_INTAKE_CONCURRENCY + IMAGE_INTAKE_QUEUE_LIMIT,
	retryAfterSeconds: BUSY_RETRY_AFTER_SECONDS,
	message: IMAGE_BUSY_MESSAGE,
})

function placeOf(req: Request): AnswerPhotoPlace {
	return {
		owner: { testId: req.params.id as string, userId: req.authUser!.id },
		sessionId: req.params.sessionId as string,
		questionId: req.params.questionId as string,
	}
}

async function answerPhotoTarget(req: Request, res: Response, next: NextFunction) {
	try {
		const place = placeOf(req)
		const testId = place.owner.testId
		const access = await checkAttemptAccess({
			testId,
			userId: place.owner.userId,
			canReadTest: () => canReadTest(req, testId),
		})
		if (!access.ok) {
			if (access.status === 404) return res.status(404).json({ error: 'Test not found' })
			return res.status(403).json({ error: 'Тест не назначен' })
		}
		if (!(await findPhotoTarget(place))) return res.status(404).json({ error: ANSWER_PHOTO_TARGET_MISSING })
		return next()
	} catch (e) {
		return next(e)
	}
}

function sendUploadOutcome(res: Response, outcome: UploadOutcome) {
	switch (outcome.kind) {
		case 'created':
			return res.status(201).json({ photo: outcome.photo, count: outcome.count })
		case 'existing':
			return res.status(200).json({ photo: outcome.photo, count: outcome.count })
		case 'window':
			return res.status(outcome.status).json(outcome.body)
		case 'limit':
			return res.status(409).json({ error: answerPhotoLimitMessage(outcome.max) })
		case 'forbidden':
			return res.status(409).json({ error: ANSWER_PHOTO_FORBIDDEN_MESSAGE })
		case 'conflict':
			return res.status(409).json({ error: ANSWER_PHOTO_CONFLICT })
		case 'missing':
			return res.status(404).json({ error: ANSWER_PHOTO_TARGET_MISSING })
	}
}

function sendDeleteOutcome(res: Response, outcome: DeleteOutcome) {
	switch (outcome.kind) {
		case 'deleted':
			return res.status(200).json({ count: outcome.count })
		case 'window':
			return res.status(outcome.status).json(outcome.body)
		case 'missing':
			return res.status(404).json({ error: ANSWER_PHOTO_NOT_FOUND })
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
			const outcome = await uploadAnswerPhoto(placeOf(req), req.params.photoId as string, req.file.buffer)
			return sendUploadOutcome(res, outcome)
		} catch (e) {
			if (e instanceof ImageRejectedError && e.statusCode === 503) {
				res.setHeader('Retry-After', String(BUSY_RETRY_AFTER_SECONDS))
				return res.status(503).json({ error: e.message })
			}
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

export default router

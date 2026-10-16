import { ANSWER_PHOTO_FORBIDDEN_MESSAGE, answerPhotoLimitMessage } from '@bio-exam/exam-core'

import type { Response } from 'express'

import { inFlightGate } from '../middleware/in-flight-gate.js'
import {
	ANSWER_PHOTO_CONFLICT,
	ANSWER_PHOTO_NOT_FOUND,
	ANSWER_PHOTO_TARGET_MISSING,
	type DeleteOutcome,
	type UploadOutcome,
} from '../services/answer-photos/index.js'
import {
	IMAGE_BUSY_MESSAGE,
	IMAGE_INTAKE_CONCURRENCY,
	IMAGE_INTAKE_QUEUE_LIMIT,
	ImageRejectedError,
} from '../services/assets/index.js'

export const BUSY_RETRY_AFTER_SECONDS = 5

export const photoBodyGate = inFlightGate({
	limit: IMAGE_INTAKE_CONCURRENCY + IMAGE_INTAKE_QUEUE_LIMIT,
	retryAfterSeconds: BUSY_RETRY_AFTER_SECONDS,
	message: IMAGE_BUSY_MESSAGE,
})

export function sendUploadOutcome(res: Response, outcome: UploadOutcome) {
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

export function sendDeleteOutcome(res: Response, outcome: DeleteOutcome) {
	switch (outcome.kind) {
		case 'deleted':
			return res.status(200).json({ count: outcome.count })
		case 'window':
			return res.status(outcome.status).json(outcome.body)
		case 'refused':
		case 'absent':
			return res.status(404).json({ error: ANSWER_PHOTO_NOT_FOUND })
	}
}

export function sendIntakeBusy(res: Response, error: unknown): boolean {
	if (!(error instanceof ImageRejectedError) || error.statusCode !== 503) return false
	res.setHeader('Retry-After', String(BUSY_RETRY_AFTER_SECONDS))
	res.status(503).json({ error: error.message })
	return true
}

export function sendAnswerPhotoFile(res: Response, data: Buffer) {
	res.setHeader('Content-Type', 'image/webp')
	res.setHeader('Content-Length', String(data.length))
	res.setHeader('Cache-Control', 'private, no-store')
	res.setHeader('X-Content-Type-Options', 'nosniff')
	res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
	res.setHeader('Content-Disposition', 'inline')
	return res.send(data)
}

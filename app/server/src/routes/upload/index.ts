import { ANSWER_PHOTO_MAX_BYTES, UploadLinkContextSchema } from '@bio-exam/exam-core'

import { Router, type Request } from 'express'

import { singleFileUpload } from '../../middleware/upload.js'
import { sendInvalidUploadLink, uploadTokenRequired } from '../../middleware/uploadTokenRequired.js'
import { validateUUID } from '../../middleware/validateParams.js'
import {
	ANSWER_PHOTO_NOT_FOUND,
	deleteAnswerPhoto,
	FILE_MISSING,
	listAnswerPhotos,
	readAnswerPhotoFile,
	uploadAnswerPhoto,
	type AnswerPhotoPlace,
} from '../../services/answer-photos/index.js'
import { placeOfUploadScope, readUploadContext, type UploadScope } from '../../services/upload-links/index.js'
import {
	photoBodyGate,
	sendAnswerPhotoFile,
	sendDeleteOutcome,
	sendIntakeBusy,
	sendUploadOutcome,
} from '../answer-photo-intake.js'

const router = Router()

function scopeOf(req: Request): UploadScope {
	return req.uploadScope!
}

function linkPlace(req: Request): Promise<AnswerPhotoPlace | null> {
	return placeOfUploadScope(scopeOf(req))
}

router.get('/context', uploadTokenRequired, async (req, res, next) => {
	try {
		const context = await readUploadContext(scopeOf(req))
		if (!context) return sendInvalidUploadLink(res)
		res.setHeader('Cache-Control', 'no-store')
		return res.json(UploadLinkContextSchema.parse(context))
	} catch (e) {
		return next(e)
	}
})

router.get('/photos', uploadTokenRequired, async (req, res, next) => {
	try {
		const place = await linkPlace(req)
		const photos = place ? await listAnswerPhotos(place) : null
		if (photos === null) return sendInvalidUploadLink(res)
		res.setHeader('Cache-Control', 'no-store')
		return res.json({ photos })
	} catch (e) {
		return next(e)
	}
})

router.put(
	'/photos/:photoId',
	validateUUID('photoId'),
	uploadTokenRequired,
	photoBodyGate,
	singleFileUpload({ field: 'file', maxBytes: ANSWER_PHOTO_MAX_BYTES }),
	async (req, res, next) => {
		try {
			if (!req.file) return res.status(400).json({ error: FILE_MISSING })
			const place = await linkPlace(req)
			if (!place) return sendInvalidUploadLink(res)
			const outcome = await uploadAnswerPhoto(place, req.params.photoId as string, req.file.buffer, 'link')
			if (outcome.kind === 'missing') return sendInvalidUploadLink(res)
			return sendUploadOutcome(res, outcome)
		} catch (e) {
			if (sendIntakeBusy(res, e)) return
			return next(e)
		}
	}
)

router.delete('/photos/:photoId', validateUUID('photoId'), uploadTokenRequired, async (req, res, next) => {
	try {
		const place = await linkPlace(req)
		if (!place) return sendInvalidUploadLink(res)
		const outcome = await deleteAnswerPhoto(place, req.params.photoId as string)
		if (outcome.kind === 'refused') return sendInvalidUploadLink(res)
		if (outcome.kind === 'absent') return res.status(200).json({ count: outcome.count })
		return sendDeleteOutcome(res, outcome)
	} catch (e) {
		return next(e)
	}
})

router.get('/photos/:photoId/thumb', validateUUID('photoId'), uploadTokenRequired, async (req, res, next) => {
	try {
		const scope = scopeOf(req)
		const data = await readAnswerPhotoFile(req.params.photoId as string, 'thumb', scope)
		if (data === null) return res.status(404).json({ error: ANSWER_PHOTO_NOT_FOUND })
		return sendAnswerPhotoFile(res, data)
	} catch (e) {
		return next(e)
	}
})

export default router

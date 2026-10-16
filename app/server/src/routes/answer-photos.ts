import { ANSWER_PHOTO_VARIANTS, type AnswerPhotoVariant } from '@bio-exam/exam-core'

import { Router, type Response } from 'express'

import { sessionRequired } from '../middleware/auth/session.js'
import { validateUUID } from '../middleware/validateParams.js'
import { canReadAnswerPhoto } from '../services/access-policy/index.js'
import { ANSWER_PHOTO_NOT_FOUND, readAnswerPhotoFile } from '../services/answer-photos/index.js'

const router = Router()

function isAnswerPhotoVariant(value: unknown): value is AnswerPhotoVariant {
	return typeof value === 'string' && (ANSWER_PHOTO_VARIANTS as readonly string[]).includes(value)
}

function photoNotFound(res: Response) {
	return res.status(404).json({ error: ANSWER_PHOTO_NOT_FOUND })
}

router.get('/:photoId/:variant', validateUUID('photoId'), sessionRequired(), async (req, res, next) => {
	try {
		const photoId = req.params.photoId as string
		const variant = req.params.variant
		if (!(await canReadAnswerPhoto(req, photoId))) return photoNotFound(res)
		if (!isAnswerPhotoVariant(variant)) return photoNotFound(res)
		const data = await readAnswerPhotoFile(photoId, variant)
		if (data === null) return photoNotFound(res)
		res.setHeader('Content-Type', 'image/webp')
		res.setHeader('Content-Length', String(data.length))
		res.setHeader('Cache-Control', 'private, no-store')
		res.setHeader('X-Content-Type-Options', 'nosniff')
		res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
		res.setHeader('Content-Disposition', 'inline')
		return res.send(data)
	} catch (e) {
		return next(e)
	}
})

export default router

import { eq } from 'drizzle-orm'
import { Router, type NextFunction, type Request, type Response } from 'express'
import multer from 'multer'

import { db } from '../../../db/index.js'
import { tests, topics } from '../../../db/schema.js'
import { ERROR_MESSAGES } from '../../../lib/constants.js'
import { sessionRequired } from '../../../middleware/auth/session.js'
import { validateUUID } from '../../../middleware/validateParams.js'
import { canWriteTest } from '../../../services/access-policy/index.js'
import { uploadImage } from '../../../services/assets/index.js'

const router = Router()

const upload = multer({
	storage: multer.memoryStorage(),
	limits: {
		fileSize: 5 * 1024 * 1024, // 5MB
	},
	fileFilter: (_req, file, cb) => {
		const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
		if (allowedMimes.includes(file.mimetype)) {
			cb(null, true)
		} else {
			cb(new Error('Недопустимый тип файла. Разрешены только изображения (JPEG, PNG, GIF, WebP)'))
		}
	},
})

async function requireTestWrite(req: Request, res: Response, next: NextFunction) {
	try {
		if (!(await canWriteTest(req, req.params.id as string))) return res.status(403).json({ error: 'Forbidden' })
		return next()
	} catch (e) {
		return next(e)
	}
}

router.post(
	'/:id/assets',
	validateUUID('id'),
	sessionRequired(),
	requireTestWrite,
	upload.single('file') as any,
	async (req, res, next) => {
		try {
			const file = req.file as Express.Multer.File | undefined
			if (!file || !file.buffer) return res.status(400).json({ error: 'No file uploaded' })

			const testId = req.params.id as string
			const test = await db.query.tests.findFirst({ where: eq(tests.id, testId) })
			if (!test) return res.status(404).json({ error: ERROR_MESSAGES.TEST_NOT_FOUND })

			const topic = await db.query.topics.findFirst({ where: eq(topics.id, test.topicId) })
			if (!topic) return res.status(404).json({ error: ERROR_MESSAGES.TOPIC_NOT_FOUND })

			const { path: key } = await uploadImage(file.buffer)
			return res.status(201).json({ url: key })
		} catch (e) {
			return next(e)
		}
	}
)

export { router as assetsRouter }

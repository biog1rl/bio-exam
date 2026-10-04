import { Router, type Response } from 'express'
import multer from 'multer'

import { isApiError } from '../../lib/errors.js'
import { requirePerm } from '../../middleware/auth/requirePerm.js'
import { sessionRequired } from '../../middleware/auth/session.js'
import { AssetInUseError } from '../../services/assets/images.js'
import {
	deleteImage,
	IMAGE_TYPE_ERROR,
	isAllowedImageMime,
	listImages,
	readServableImage,
	resolveImageUrl,
	uploadImage,
} from '../../services/assets/index.js'

const router = Router()

const upload = multer({
	storage: multer.memoryStorage(),
	limits: {
		fileSize: 5 * 1024 * 1024,
	},
	fileFilter: (_req, file, cb) => {
		if (isAllowedImageMime(file.mimetype)) {
			cb(null, true)
		} else {
			cb(new Error(IMAGE_TYPE_ERROR))
		}
	},
})

function replyError(res: Response, error: unknown, context: string, message: string) {
	if (isApiError(error) && error.statusCode < 500) return res.status(error.statusCode).json({ error: error.message })
	console.error(`[docs/assets] ${context}:`, error)
	return res.status(500).json({ error: message })
}

router.get('/', sessionRequired(), requirePerm('tests', 'write'), async (req, res) => {
	try {
		const limit = Math.min(Math.max(parseInt(String(req.query.limit)) || 20, 1), 100)
		const offset = Math.max(parseInt(String(req.query.offset)) || 0, 0)
		return res.json(await listImages({ limit, offset }))
	} catch (error) {
		return replyError(res, error, 'Error listing assets', 'Не удалось получить список изображений')
	}
})

router.delete('/', sessionRequired(), requirePerm('tests', 'write'), async (req, res) => {
	try {
		await deleteImage(req.body?.path)
		return res.json({ success: true })
	} catch (error) {
		if (error instanceof AssetInUseError) return res.status(409).json({ error: error.message, usage: error.usage })
		return replyError(res, error, 'Error deleting asset', 'Не удалось удалить изображение')
	}
})

router.post('/', sessionRequired(), requirePerm('tests', 'write'), upload.single('file'), async (req, res) => {
	try {
		if (!req.file) {
			return res.status(400).json({ error: 'Файл не передан' })
		}
		const { path, filename } = await uploadImage(req.file.buffer)
		return res.json({ success: true, path, filename })
	} catch (error) {
		return replyError(res, error, 'Error uploading image', 'Ошибка при загрузке изображения')
	}
})

router.get('/proxy', sessionRequired(), async (req, res) => {
	try {
		const { data, contentType } = await readServableImage(req.query.path)
		res.setHeader('Content-Type', contentType)
		res.setHeader('Content-Length', String(data.length))
		res.setHeader('Cache-Control', 'private, max-age=3600')
		res.setHeader('X-Content-Type-Options', 'nosniff')
		return res.send(data)
	} catch (error) {
		return replyError(res, error, 'Error proxying asset', 'Не удалось загрузить изображение')
	}
})

router.get('/signed', sessionRequired(), async (req, res) => {
	try {
		return res.json({ signedUrl: resolveImageUrl(req.query.path) })
	} catch (error) {
		return replyError(res, error, 'Error generating signed URL', 'Не удалось получить URL изображения')
	}
})

export default router

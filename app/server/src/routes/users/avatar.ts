import { Router, type Request, type Response } from 'express'
import multer from 'multer'

import { ApiError, isApiError } from '../../lib/errors.js'
import { sessionRequired } from '../../middleware/auth/session.js'
import { deleteAvatar, recropAvatar, saveAvatar, type AvatarCrop } from '../../services/assets/index.js'

const router = Router()

const upload = multer({
	storage: multer.memoryStorage(),
	limits: {
		fileSize: 5 * 1024 * 1024,
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

const INVALID_CROP_MESSAGE = 'Некорректные параметры кропа'

function numberField(body: Record<string, unknown>, name: string): number | null {
	const value = body[name]
	if (!value) return null
	const parsed = parseFloat(String(value))
	if (!Number.isFinite(parsed)) throw new ApiError(400, INVALID_CROP_MESSAGE)
	return parsed
}

function cropFromBody(body: unknown): AvatarCrop {
	const fields = (body ?? {}) as Record<string, unknown>
	return {
		x: numberField(fields, 'cropX'),
		y: numberField(fields, 'cropY'),
		width: numberField(fields, 'cropWidth'),
		height: numberField(fields, 'cropHeight'),
		zoom: numberField(fields, 'cropZoom'),
		rotation: numberField(fields, 'cropRotation'),
		viewX: numberField(fields, 'cropViewX'),
		viewY: numberField(fields, 'cropViewY'),
	}
}

function sendError(res: Response, error: unknown, fallback: string): void {
	if (isApiError(error) && error.statusCode < 500) {
		res.status(error.statusCode).json({ error: error.message })
		return
	}
	console.error(fallback, error)
	res.status(500).json({ error: fallback })
}

router.post('/', sessionRequired(), upload.single('avatar') as any, async (req: Request, res: Response) => {
	try {
		const userId = req.authUser?.id
		if (!userId) {
			return res.status(401).json({ error: 'Не авторизован' })
		}
		const crop = cropFromBody(req.body)
		const result = req.file
			? await saveAvatar({ userId, buffer: req.file.buffer, crop })
			: await recropAvatar({ userId, crop })
		res.json(result)
	} catch (error) {
		sendError(res, error, 'Ошибка при загрузке аватара')
	}
})

router.delete('/', sessionRequired(), async (req: Request, res: Response) => {
	try {
		const userId = req.authUser?.id
		if (!userId) {
			return res.status(401).json({ error: 'Не авторизован' })
		}
		await deleteAvatar(userId)
		res.json({ message: 'Аватар удален' })
	} catch (error) {
		sendError(res, error, 'Ошибка при удалении аватара')
	}
})

export default router

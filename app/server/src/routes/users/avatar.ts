import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

import { eq } from 'drizzle-orm'
import { Router } from 'express'
import multer from 'multer'
import sharp from 'sharp'

import { db } from '../../db/index.js'
import { users } from '../../db/schema.js'
import { sessionRequired } from '../../middleware/auth/session.js'

const router = Router()

// Путь к папке для сохранения аватаров
const UPLOAD_DIR = path.join(process.cwd(), '../web/public/uploads/avatars')

// Создаем папку, если она не существует
if (!fs.existsSync(UPLOAD_DIR)) {
	fs.mkdirSync(UPLOAD_DIR, { recursive: true })
}

// Настройка multer для загрузки файлов
const storage = multer.diskStorage({
	destination: (_req, _file, cb) => {
		cb(null, UPLOAD_DIR)
	},
	filename: (_req, file, cb) => {
		// Генерируем уникальное имя файла
		const uniqueSuffix = crypto.randomBytes(16).toString('hex')
		const ext = path.extname(file.originalname)
		cb(null, `${uniqueSuffix}${ext}`)
	},
})

const upload = multer({
	storage,
	limits: {
		fileSize: 5 * 1024 * 1024, // 5MB
	},
	fileFilter: (_req, file, cb) => {
		// Разрешаем только изображения
		const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
		if (allowedMimes.includes(file.mimetype)) {
			cb(null, true)
		} else {
			cb(new Error('Недопустимый тип файла. Разрешены только изображения (JPEG, PNG, GIF, WebP)'))
		}
	},
})

/**
 * Создает кропнутую версию изображения
 * @param originalPath Путь к оригинальному изображению
 * @param cropParams Параметры кропа (x, y, width, height в пикселях, rotation)
 * @returns Путь к кропнутому изображению
 */
async function createCroppedImage(
	originalPath: string,
	cropParams: { x: number; y: number; width: number; height: number; rotation: number }
): Promise<string> {
	const { x, y, width, height, rotation } = cropParams

	// Генерируем имя для кропнутого файла
	const originalFilename = path.basename(originalPath)
	const ext = path.extname(originalFilename)
	const basename = path.basename(originalFilename, ext)
	const croppedFilename = `${basename}_cropped${ext}`
	const croppedPath = path.join(UPLOAD_DIR, croppedFilename)

	// Читаем изображение и получаем его метаданные
	let image = sharp(originalPath)
	let metadata = await image.metadata()

	if (!metadata.width || !metadata.height) {
		throw new Error('Не удалось получить размеры изображения')
	}

	// Применяем поворот сначала, если есть
	if (rotation !== 0) {
		image = sharp(originalPath).rotate(rotation, { background: { r: 255, g: 255, b: 255, alpha: 0 } })
		// Получаем новые размеры после поворота
		const rotatedBuffer = await image.toBuffer()
		image = sharp(rotatedBuffer)
		metadata = await image.metadata()
		if (!metadata.width || !metadata.height) {
			throw new Error('Не удалось получить размеры повернутого изображения')
		}
	}

	// Размер круглого аватара (выходное изображение)
	const outputSize = 256

	// x, y, width, height уже приходят в пикселях из react-easy-crop
	let left = Math.round(x)
	let top = Math.round(y)
	let cropWidth = Math.round(width)
	let cropHeight = Math.round(height)

	// Корректируем границы, чтобы не выйти за пределы изображения
	if (left < 0) left = 0
	if (top < 0) top = 0
	if (left + cropWidth > metadata.width) cropWidth = metadata.width - left
	if (top + cropHeight > metadata.height) cropHeight = metadata.height - top

	// Извлекаем нужную область и изменяем размер
	await image.extract({ left, top, width: cropWidth, height: cropHeight }).resize(outputSize, outputSize).toFile(croppedPath)

	// Возвращаем относительный путь
	return `/uploads/avatars/${croppedFilename}`
}

// POST /api/users/avatar - загрузка аватара или обновление параметров кропа
router.post('/', sessionRequired(), upload.single('avatar') as any, async (req, res) => {
	try {
		const userId = req.authUser?.id
		if (!userId) {
			return res.status(401).json({ error: 'Не авторизован' })
		}

		// Получаем параметры кропа из body
		const cropX = req.body.cropX ? parseFloat(req.body.cropX) : null
		const cropY = req.body.cropY ? parseFloat(req.body.cropY) : null
		const cropWidth = req.body.cropWidth ? parseFloat(req.body.cropWidth) : null
		const cropHeight = req.body.cropHeight ? parseFloat(req.body.cropHeight) : null
		const cropZoom = req.body.cropZoom ? parseFloat(req.body.cropZoom) : null
		const cropRotation = req.body.cropRotation ? parseFloat(req.body.cropRotation) : null
		
		// Новые параметры view
		const cropViewX = req.body.cropViewX ? parseFloat(req.body.cropViewX) : null
		const cropViewY = req.body.cropViewY ? parseFloat(req.body.cropViewY) : null

		let avatarUrl: string | null = null
		let avatarCroppedUrl: string | null = null

		if (req.file) {
			// Новый файл загружен - обновляем аватар
			avatarUrl = `/uploads/avatars/${req.file.filename}`

			// Получаем старый аватар пользователя
			const user = await db
				.select({ avatar: users.avatar, avatarCropped: users.avatarCropped })
				.from(users)
				.where(eq(users.id, userId))
				.limit(1)

			// Удаляем старые файлы аватара, если они существуют
			if (user.length > 0) {
				if (user[0].avatar) {
					const oldAvatarPath = path.join(process.cwd(), '../web/public', user[0].avatar)
					if (fs.existsSync(oldAvatarPath)) {
						fs.unlinkSync(oldAvatarPath)
					}
				}
				if (user[0].avatarCropped) {
					const oldCroppedPath = path.join(process.cwd(), '../web/public', user[0].avatarCropped)
					if (fs.existsSync(oldCroppedPath)) {
						fs.unlinkSync(oldCroppedPath)
					}
				}
			}

			// Создаем кропнутое изображение, если есть параметры кропа
			if (cropX !== null && cropY !== null && cropWidth !== null && cropHeight !== null && cropRotation !== null) {
				const originalPath = path.join(process.cwd(), '../web/public', avatarUrl)
				avatarCroppedUrl = await createCroppedImage(originalPath, {
					x: cropX,
					y: cropY,
					width: cropWidth,
					height: cropHeight,
					rotation: cropRotation,
				})
			}

			// Обновляем путь к аватару и параметры кропа
			await db
				.update(users)
				.set({
					avatar: avatarUrl,
					avatarCropped: avatarCroppedUrl,
					avatarCropX: cropX,
					avatarCropY: cropY,
					avatarCropZoom: cropZoom,
					avatarCropRotation: cropRotation,
					avatarCropViewX: cropViewX,
					avatarCropViewY: cropViewY,
				})
				.where(eq(users.id, userId))
		} else {
			// Файл не загружен - обновляем только параметры кропа
			const user = await db
				.select({ avatar: users.avatar, avatarCropped: users.avatarCropped })
				.from(users)
				.where(eq(users.id, userId))
				.limit(1)

			if (user.length === 0 || !user[0].avatar) {
				return res.status(400).json({ error: 'Нет загруженного аватара для редактирования' })
			}

			avatarUrl = user[0].avatar

			// Удаляем старое кропнутое изображение, если есть
			if (user[0].avatarCropped) {
				const oldCroppedPath = path.join(process.cwd(), '../web/public', user[0].avatarCropped)
				if (fs.existsSync(oldCroppedPath)) {
					fs.unlinkSync(oldCroppedPath)
				}
			}

			// Создаем новое кропнутое изображение
			if (cropX !== null && cropY !== null && cropWidth !== null && cropHeight !== null && cropRotation !== null) {
				const originalPath = path.join(process.cwd(), '../web/public', avatarUrl)
				avatarCroppedUrl = await createCroppedImage(originalPath, {
					x: cropX,
					y: cropY,
					width: cropWidth,
					height: cropHeight,
					rotation: cropRotation,
				})
			}

			// Обновляем параметры кропа и путь к кропнутому изображению
			await db
				.update(users)
				.set({
					avatarCropped: avatarCroppedUrl,
					avatarCropX: cropX,
					avatarCropY: cropY,
					avatarCropZoom: cropZoom,
					avatarCropRotation: cropRotation,
					avatarCropViewX: cropViewX,
					avatarCropViewY: cropViewY,
				})
				.where(eq(users.id, userId))
		}

		res.json({
			avatarUrl,
			avatarCroppedUrl,
			cropParams: {
				x: cropX,
				y: cropY,
				zoom: cropZoom,
				rotation: cropRotation,
				viewX: cropViewX,
				viewY: cropViewY,
			},
		})
	} catch (error) {
		console.error('Error uploading avatar:', error)
		res.status(500).json({ error: 'Ошибка при загрузке аватара' })
	}
})

// DELETE /api/users/avatar - удаление аватара
router.delete('/', sessionRequired(), async (req, res) => {
	try {
		const userId = req.authUser?.id
		if (!userId) {
			return res.status(401).json({ error: 'Не авторизован' })
		}

		// Получаем текущие аватары пользователя
		const user = await db
			.select({ avatar: users.avatar, avatarCropped: users.avatarCropped })
			.from(users)
			.where(eq(users.id, userId))
			.limit(1)

		if (user.length > 0) {
			// Удаляем оригинальный файл
			if (user[0].avatar) {
				const avatarPath = path.join(process.cwd(), '../web/public', user[0].avatar)
				if (fs.existsSync(avatarPath)) {
					fs.unlinkSync(avatarPath)
				}
			}

			// Удаляем кропнутый файл
			if (user[0].avatarCropped) {
				const croppedPath = path.join(process.cwd(), '../web/public', user[0].avatarCropped)
				if (fs.existsSync(croppedPath)) {
					fs.unlinkSync(croppedPath)
				}
			}

			// Удаляем записи из базы данных и параметры кропа
			await db
				.update(users)
				.set({
					avatar: null,
					avatarCropped: null,
					avatarCropX: null,
					avatarCropY: null,
					avatarCropZoom: null,
					avatarCropRotation: null,
					avatarCropViewX: null,
					avatarCropViewY: null,
				})
				.where(eq(users.id, userId))
		}

		res.json({ message: 'Аватар удален' })
	} catch (error) {
		console.error('Error deleting avatar:', error)
		res.status(500).json({ error: 'Ошибка при удалении аватара' })
	}
})

export default router

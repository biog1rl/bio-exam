import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

import { Router } from 'express'
import { fileTypeFromBuffer } from 'file-type'
import multer from 'multer'
import sharp from 'sharp'

import { sessionRequired } from '../../middleware/auth/session.js'
import { storageService } from '../../services/storage/storage.js'

const router = Router()

const LOCAL_UPLOAD_DIR = path.join(process.cwd(), '../web/public/uploads/images')

const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp'])

// Multer storage: memory when Supabase configured, disk otherwise
const multerStorage = storageService.isConfigured()
	? multer.memoryStorage()
	: multer.diskStorage({
			destination: (_req, _file, cb) => {
				fs.mkdirSync(LOCAL_UPLOAD_DIR, { recursive: true })
				cb(null, LOCAL_UPLOAD_DIR)
			},
			filename: (_req, _file, cb) => {
				cb(null, crypto.randomBytes(16).toString('hex') + '.webp')
			},
		})

const upload = multer({
	storage: multerStorage,
	limits: {
		fileSize: 5 * 1024 * 1024, // 5 MB
	},
	fileFilter: (_req, file, cb) => {
		if (ALLOWED_MIMES.has(file.mimetype)) {
			cb(null, true)
		} else {
			cb(new Error('Поддерживаются только JPEG, PNG и WebP'))
		}
	},
})

// POST /api/docs/assets — upload image, compress to WebP, store
router.post('/', sessionRequired(), upload.single('file') as any, async (req, res) => {
	try {
		if (!req.file) {
			return res.status(400).json({ error: 'Файл не передан' })
		}

		// Read buffer: memoryStorage provides buffer, diskStorage requires reading from disk
		const originalBuffer: Buffer = (req.file as any).buffer
			? (req.file as any).buffer
			: fs.readFileSync((req.file as any).path)

		// Magic bytes validation
		const detected = await fileTypeFromBuffer(originalBuffer)
		if (!detected || !ALLOWED_MIMES.has(detected.mime)) {
			// Clean up disk file if present
			if ((req.file as any).path) {
				fs.unlink((req.file as any).path, () => {})
			}
			return res.status(400).json({ error: 'Поддерживаются только JPEG, PNG и WebP' })
		}

		// Process with sharp: resize to max 1920px, convert to WebP quality 85
		const processedBuffer = await sharp(originalBuffer)
			.resize(1920, 1920, { fit: 'inside', withoutEnlargement: true })
			.webp({ quality: 85 })
			.toBuffer()

		const filename = crypto.randomBytes(16).toString('hex') + '.webp'
		const storagePath = 'images/' + filename

		if (storageService.isConfigured()) {
			// Upload to Supabase Storage
			await storageService.uploadBuffer(storagePath, processedBuffer, 'image/webp')
		} else {
			// Local fallback: save to web/public/uploads/images
			fs.mkdirSync(LOCAL_UPLOAD_DIR, { recursive: true })
			fs.writeFileSync(path.join(LOCAL_UPLOAD_DIR, filename), processedBuffer)

			// Clean up temporary disk file from multer diskStorage
			if ((req.file as any).path) {
				fs.unlink((req.file as any).path, () => {})
			}
		}

		return res.json({ success: true, path: storagePath, filename })
	} catch (error) {
		console.error('[docs/assets] Error uploading image:', error)
		return res.status(500).json({ error: 'Ошибка при загрузке изображения' })
	}
})

// GET /api/docs/assets/signed?path=images/xxx.webp — get signed URL
router.get('/signed', sessionRequired(), async (req, res) => {
	try {
		const filePath = req.query.path

		if (!filePath || typeof filePath !== 'string') {
			return res.status(400).json({ error: 'path is required' })
		}

		if (!storageService.isConfigured()) {
			// Local fallback: return static path
			return res.json({ signedUrl: '/uploads/' + filePath })
		}

		const signedUrl = await storageService.createSignedUrl(filePath, 3600)
		return res.json({ signedUrl })
	} catch (error) {
		console.error('[docs/assets] Error generating signed URL:', error)
		return res.status(500).json({ error: 'Не удалось получить URL изображения' })
	}
})

export default router

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
const LOCAL_UPLOAD_ROOT = path.join(process.cwd(), '../web/public/uploads')

const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp'])

function isSafeStoragePath(filePath: string): boolean {
	return Boolean(filePath) && !filePath.startsWith('/') && !filePath.includes('\0') && !filePath.split('/').includes('..')
}

function buildProxyUrl(filePath: string): string {
	return `/api/docs/assets/proxy?path=${encodeURIComponent(filePath)}&cacheNonce=${Date.now()}`
}

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

// GET /api/docs/assets?limit=20&offset=0 — list uploaded images with signed URLs
router.get('/', sessionRequired(), async (req, res) => {
	try {
		const limit = Math.min(Math.max(parseInt(String(req.query.limit)) || 20, 1), 100)
		const offset = Math.max(parseInt(String(req.query.offset)) || 0, 0)

		if (!storageService.isConfigured()) {
			// Local fallback: read from disk
			const dir = LOCAL_UPLOAD_DIR
			if (!fs.existsSync(dir)) {
				return res.json({ assets: [], total: 0 })
			}
			const allFiles = fs
				.readdirSync(dir)
				.filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
				.sort()
			const total = allFiles.length
			const pageFiles = allFiles.slice(offset, offset + limit)
			const assets = pageFiles.map((f) => ({
				filename: f,
				path: 'images/' + f,
				signedUrl: '/uploads/images/' + f,
				size: fs.statSync(path.join(dir, f)).size,
				createdAt: fs.statSync(path.join(dir, f)).mtime.toISOString(),
			}))
			return res.json({ assets, total })
		}

		const { files, total } = await storageService.listFilesWithMeta('images', { limit, offset })

		const assets = await Promise.all(
			files.map(async (f) => {
				const storagePath = 'images/' + f.name
				return {
					filename: f.name,
					path: storagePath,
					signedUrl: buildProxyUrl(storagePath),
					size: (f.metadata?.size as number) ?? 0,
					createdAt: f.created_at ?? '',
				}
			})
		)

		return res.json({ assets, total })
	} catch (error) {
		console.error('[docs/assets] Error listing assets:', error)
		return res.status(500).json({ error: 'Не удалось получить список изображений' })
	}
})

// DELETE /api/docs/assets — delete image by path (passed in request body)
router.delete('/', sessionRequired(), async (req, res) => {
	try {
		const filePath = req.body?.path
		if (!filePath || typeof filePath !== 'string') {
			return res.status(400).json({ error: 'path is required' })
		}

		// Validate path starts with "images/" to prevent arbitrary deletion
		if (!filePath.startsWith('images/')) {
			return res.status(400).json({ error: 'Invalid path' })
		}

		if (!storageService.isConfigured()) {
			// Local fallback: delete from disk
			const localPath = path.join(process.cwd(), '../web/public/uploads', filePath)
			if (fs.existsSync(localPath)) {
				fs.unlinkSync(localPath)
			}
			return res.json({ success: true })
		}

		await storageService.deleteFiles([filePath])
		return res.json({ success: true })
	} catch (error) {
		console.error('[docs/assets] Error deleting asset:', error)
		return res.status(500).json({ error: 'Не удалось удалить изображение' })
	}
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
			await storageService.uploadBuffer(storagePath, processedBuffer, 'image/webp', {
				cacheControl: '3600',
				upsert: false,
			})
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

// GET /api/docs/assets/proxy?path=images/xxx.webp — stream image through this app
router.get('/proxy', sessionRequired(), async (req, res) => {
	try {
		const filePath = req.query.path

		if (!filePath || typeof filePath !== 'string') {
			return res.status(400).json({ error: 'path is required' })
		}

		if (!isSafeStoragePath(filePath)) {
			return res.status(400).json({ error: 'Invalid path' })
		}

		if (!storageService.isConfigured()) {
			const localPath = path.resolve(LOCAL_UPLOAD_ROOT, filePath)
			if (!localPath.startsWith(LOCAL_UPLOAD_ROOT + path.sep)) {
				return res.status(400).json({ error: 'Invalid path' })
			}
			return res.sendFile(localPath)
		}

		const { buffer, contentType } = await storageService.downloadBuffer(filePath)
		res.setHeader('Content-Type', contentType)
		res.setHeader('Content-Length', String(buffer.length))
		res.setHeader('Cache-Control', 'private, max-age=3600')
		return res.send(buffer)
	} catch (error) {
		console.error('[docs/assets] Error proxying asset:', error)
		return res.status(500).json({ error: 'Не удалось загрузить изображение' })
	}
})

// GET /api/docs/assets/signed?path=images/xxx.webp — get signed URL
router.get('/signed', sessionRequired(), async (req, res) => {
	try {
		const filePath = req.query.path

		if (!filePath || typeof filePath !== 'string') {
			return res.status(400).json({ error: 'path is required' })
		}

		if (!isSafeStoragePath(filePath)) {
			return res.status(400).json({ error: 'Invalid path' })
		}

		if (!storageService.isConfigured()) {
			// Local fallback: return static path
			return res.json({ signedUrl: '/uploads/' + filePath })
		}

		return res.json({ signedUrl: buildProxyUrl(filePath) })
	} catch (error) {
		console.error('[docs/assets] Error generating signed URL:', error)
		return res.status(500).json({ error: 'Не удалось получить URL изображения' })
	}
})

export default router

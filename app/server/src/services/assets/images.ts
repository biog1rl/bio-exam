import { fileTypeFromBuffer } from 'file-type'
import crypto from 'node:crypto'
import sharp from 'sharp'

import { ApiError } from '../../lib/errors.js'
import {
	isMediaLibraryKey,
	isServableImageKey,
	storage,
	StorageKeyError,
	storageUrl,
	type StorageReadResult,
} from '../storage/index.js'
import { resolveImageLink } from '../storage/links.js'

export const IMAGE_TYPE_ERROR = 'Поддерживаются только JPEG, PNG и WebP'

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MEDIA_PREFIX = 'images'
const MAX_DIMENSION = 1920
const WEBP_QUALITY = 85

export type MediaAsset = {
	filename: string
	path: string
	signedUrl: string
	size: number
	createdAt: string
}

function requirePath(input: unknown): string {
	if (typeof input !== 'string' || input === '') throw new ApiError(400, 'path is required')
	return input
}

function invalidPath(): ApiError {
	return new ApiError(400, 'Invalid path')
}

export function isAllowedImageMime(mime: string): boolean {
	return ALLOWED_IMAGE_TYPES.has(mime)
}

export async function uploadImage(buffer: Buffer): Promise<{ path: string; filename: string }> {
	const detected = await fileTypeFromBuffer(buffer)
	if (!detected || !ALLOWED_IMAGE_TYPES.has(detected.mime)) throw new ApiError(400, IMAGE_TYPE_ERROR)
	const processed = await sharp(buffer)
		.resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
		.webp({ quality: WEBP_QUALITY })
		.toBuffer()
	const filename = `${crypto.randomBytes(16).toString('hex')}.webp`
	const path = `${MEDIA_PREFIX}/${filename}`
	await storage().write(path, processed, { contentType: 'image/webp', cacheControl: '3600', upsert: false })
	return { path, filename }
}

export async function listImages(options: { limit: number; offset: number }): Promise<{
	assets: MediaAsset[]
	total: number
}> {
	const page = await storage().listPage(MEDIA_PREFIX, options)
	const assets = page.objects.map((object) => ({
		filename: object.key.slice(MEDIA_PREFIX.length + 1),
		path: object.key,
		signedUrl: storageUrl(object.key),
		size: object.size,
		createdAt: object.createdAt,
	}))
	return { assets, total: page.total }
}

export async function deleteImage(input: unknown): Promise<void> {
	const path = requirePath(input)
	if (!isMediaLibraryKey(path)) throw invalidPath()
	await storage().remove([path])
}

export async function readServableImage(input: unknown): Promise<StorageReadResult> {
	const path = requirePath(input)
	if (!isServableImageKey(path)) throw invalidPath()
	const result = await storage().read(path)
	if (result === null) throw new ApiError(404, 'Изображение не найдено')
	return result
}

export function resolveImageUrl(input: unknown): string {
	const path = requirePath(input)
	try {
		return resolveImageLink(path)
	} catch (error) {
		if (error instanceof StorageKeyError) throw invalidPath()
		throw error
	}
}

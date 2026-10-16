import crypto from 'node:crypto'

import { db } from '../../db/index.js'
import { ApiError } from '../../lib/errors.js'
import { assetUsage, isAssetIndexComplete, lockAssetKey, type AssetUsage } from '../question-content/asset-index.js'
import {
	isMediaLibraryKey,
	isServableImageKey,
	storage,
	StorageKeyError,
	storageUrl,
	type StorageReadResult,
} from '../storage/index.js'
import { resolveImageLink } from '../storage/links.js'
import { acceptImage, IMAGE_PROFILES } from './image-intake.js'

export { IMAGE_TYPE_ERROR } from './image-intake.js'

export const ASSET_IN_USE_MESSAGE = 'Изображение используется в вопросах'

export const ASSET_INDEX_INCOMPLETE_MESSAGE = 'Удаление недоступно: ссылки на изображения ещё не проиндексированы'

const MEDIA_PREFIX = 'images'

export type MediaAsset = {
	filename: string
	path: string
	signedUrl: string
	size: number
	createdAt: string
}

export class AssetInUseError extends ApiError {
	readonly usage: AssetUsage

	constructor(usage: AssetUsage) {
		super(409, ASSET_IN_USE_MESSAGE)
		this.name = 'AssetInUseError'
		this.usage = usage
	}
}

function requirePath(input: unknown): string {
	if (typeof input !== 'string' || input === '') throw new ApiError(400, 'path is required')
	return input
}

function invalidPath(): ApiError {
	return new ApiError(400, 'Invalid path')
}

export async function uploadImage(buffer: Buffer): Promise<{ path: string; filename: string }> {
	const accepted = await acceptImage(buffer, IMAGE_PROFILES.mediaLibrary)
	const filename = `${crypto.randomBytes(16).toString('hex')}.webp`
	const path = `${MEDIA_PREFIX}/${filename}`
	await storage().write(path, accepted.full, { contentType: accepted.mime, cacheControl: '3600', upsert: false })
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
	if (!(await isAssetIndexComplete())) throw new ApiError(409, ASSET_INDEX_INCOMPLETE_MESSAGE)
	await db.transaction(async (tx) => {
		await lockAssetKey(tx, path)
		const usage = await assetUsage(path, tx)
		if (usage.questions > 0 || usage.drafts > 0) throw new AssetInUseError(usage)
		await storage().remove([path])
	})
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

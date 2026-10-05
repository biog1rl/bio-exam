import { fileTypeFromBuffer } from 'file-type'
import crypto from 'node:crypto'
import sharp from 'sharp'

import { storage } from '../storage/index.js'

export type StoredInlineImages = {
	text: string
	keys: string[]
	failed: number
	bytesBefore: number
	bytesAfter: number
}

const INLINE_IMAGE = /data:image\/(?:png|jpe?g|gif|webp);base64,[A-Za-z0-9+/]+=*/g
const INLINE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const MEDIA_PREFIX = 'images'
const MAX_DIMENSION = 1920
const WEBP_QUALITY = 85

export function hasInlineImages(text: string | null | undefined): boolean {
	return typeof text === 'string' && text.search(INLINE_IMAGE) !== -1
}

export function inlineImageUris(text: string | null | undefined): string[] {
	return typeof text === 'string' ? (text.match(INLINE_IMAGE) ?? []) : []
}

async function storeImage(uri: string): Promise<string | null> {
	const payload = Buffer.from(uri.slice(uri.indexOf(',') + 1), 'base64')
	const detected = await fileTypeFromBuffer(payload)
	if (!detected || !INLINE_IMAGE_TYPES.has(detected.mime)) return null
	const digest = crypto.createHash('sha256').update(payload).digest('hex').slice(0, 32)
	const key = `${MEDIA_PREFIX}/${digest}.webp`
	const module = storage()
	if (await module.exists(key)) return key
	const processed = await sharp(payload, { animated: detected.mime === 'image/gif' })
		.resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
		.webp({ quality: WEBP_QUALITY })
		.toBuffer()
	await module.write(key, processed, { contentType: 'image/webp', cacheControl: '3600', upsert: true })
	return key
}

export async function storeInlineImages(text: string): Promise<StoredInlineImages> {
	const uris = [...new Set(inlineImageUris(text))]
	const result: StoredInlineImages = { text, keys: [], failed: 0, bytesBefore: text.length, bytesAfter: text.length }
	if (uris.length === 0) return result
	const replacements = new Map<string, string>()
	for (const uri of uris) {
		try {
			const key = await storeImage(uri)
			if (key === null) {
				result.failed += 1
				continue
			}
			replacements.set(uri, key)
			if (!result.keys.includes(key)) result.keys.push(key)
		} catch {
			result.failed += 1
		}
	}
	result.text = text.replace(INLINE_IMAGE, (uri) => replacements.get(uri) ?? uri)
	result.bytesAfter = result.text.length
	return result
}

export async function withStoredInlineImages<T extends { promptText: string; explanationText?: string | null }>(
	data: T
): Promise<T> {
	if (!hasInlineImages(data.promptText) && !hasInlineImages(data.explanationText)) return data
	const prompt = await storeInlineImages(data.promptText)
	const explanation =
		typeof data.explanationText === 'string'
			? (await storeInlineImages(data.explanationText)).text
			: data.explanationText
	return { ...data, promptText: prompt.text, explanationText: explanation }
}

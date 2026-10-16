import crypto from 'node:crypto'

import { storage } from '../storage/index.js'
import { acceptImage, IMAGE_PROFILES, ImageRejectedError } from './image-intake.js'

export type StoredInlineImages = {
	text: string
	keys: string[]
	failed: number
	bytesBefore: number
	bytesAfter: number
}

const INLINE_IMAGE = /data:image\/(?:png|jpe?g|gif|webp);base64,[A-Za-z0-9+/]+=*/g
const MEDIA_PREFIX = 'images'

export function hasInlineImages(text: string | null | undefined): boolean {
	return typeof text === 'string' && text.search(INLINE_IMAGE) !== -1
}

export function inlineImageUris(text: string | null | undefined): string[] {
	return typeof text === 'string' ? (text.match(INLINE_IMAGE) ?? []) : []
}

async function storeImage(uri: string): Promise<string | null> {
	const payload = Buffer.from(uri.slice(uri.indexOf(',') + 1), 'base64')
	const digest = crypto.createHash('sha256').update(payload).digest('hex').slice(0, 32)
	const key = `${MEDIA_PREFIX}/${digest}.webp`
	const module = storage()
	if (await module.exists(key)) return key
	const accepted = await acceptImage(payload, IMAGE_PROFILES.inlineImage).catch((error: unknown) => {
		if (error instanceof ImageRejectedError) return null
		throw error
	})
	if (accepted === null) return null
	await module.write(key, accepted.full, { contentType: accepted.mime, cacheControl: '3600', upsert: true })
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

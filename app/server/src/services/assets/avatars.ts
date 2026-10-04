import { eq } from 'drizzle-orm'
import { fileTypeFromBuffer } from 'file-type'
import crypto from 'node:crypto'
import sharp from 'sharp'

import { db } from '../../db/index.js'
import { users } from '../../db/schema.js'
import { ApiError } from '../../lib/errors.js'
import { storage } from '../storage/index.js'
import { avatarUrl, ownStorageKey } from '../storage/links.js'

export const AVATAR_TYPE_ERROR =
	'Недопустимый тип файла. Файл не является допустимым изображением (JPEG, PNG, GIF, WebP)'
export const NO_AVATAR_ERROR = 'Нет загруженного аватара для редактирования'

const AVATAR_PREFIX = 'avatars'
const OUTPUT_SIZE = 256
const TRANSPARENT = { r: 255, g: 255, b: 255, alpha: 0 }
const AVATAR_TYPES = new Map<string, string>([
	['image/jpeg', 'jpg'],
	['image/png', 'png'],
	['image/webp', 'webp'],
	['image/gif', 'gif'],
])

export type AvatarCrop = {
	x: number | null
	y: number | null
	width: number | null
	height: number | null
	zoom: number | null
	rotation: number | null
	viewX: number | null
	viewY: number | null
}

export type AvatarCropParams = {
	x: number | null
	y: number | null
	zoom: number | null
	rotation: number | null
	viewX: number | null
	viewY: number | null
}

export type AvatarResult = {
	avatarUrl: string | null
	avatarCroppedUrl: string | null
	cropParams: AvatarCropParams
}

type CropBox = { x: number; y: number; width: number; height: number; rotation: number }

type AvatarRow = { avatar: string | null; avatarCropped: string | null }

function userPrefix(userId: string): string {
	return `${AVATAR_PREFIX}/${userId}/`
}

function newName(): string {
	return crypto.randomBytes(12).toString('hex')
}

function cropBox(crop: AvatarCrop): CropBox | null {
	const { x, y, width, height, rotation } = crop
	if (x === null || y === null || width === null || height === null || rotation === null) return null
	return { x, y, width, height, rotation }
}

function cropParams(crop: AvatarCrop): AvatarCropParams {
	return {
		x: crop.x,
		y: crop.y,
		zoom: crop.zoom,
		rotation: crop.rotation,
		viewX: crop.viewX,
		viewY: crop.viewY,
	}
}

function cropColumns(crop: AvatarCrop) {
	return {
		avatarCropX: crop.x,
		avatarCropY: crop.y,
		avatarCropZoom: crop.zoom,
		avatarCropRotation: crop.rotation,
		avatarCropViewX: crop.viewX,
		avatarCropViewY: crop.viewY,
	}
}

async function renderCrop(source: Buffer, box: CropBox): Promise<Buffer> {
	let image = sharp(source)
	if (box.rotation !== 0) {
		const rotated = await image.rotate(box.rotation, { background: TRANSPARENT }).toBuffer()
		image = sharp(rotated)
	}
	const metadata = await image.metadata()
	if (!metadata.width || !metadata.height) throw new Error('Не удалось получить размеры изображения')
	const left = Math.max(0, Math.round(box.x))
	const top = Math.max(0, Math.round(box.y))
	const width = Math.min(Math.round(box.width), metadata.width - left)
	const height = Math.min(Math.round(box.height), metadata.height - top)
	if (width <= 0 || height <= 0) throw new ApiError(400, 'Некорректная область кропа')
	return image.extract({ left, top, width, height }).resize(OUTPUT_SIZE, OUTPUT_SIZE).png().toBuffer()
}

async function writeCrop(userId: string, source: Buffer, box: CropBox): Promise<string> {
	const cropped = await renderCrop(source, box)
	const key = `${userPrefix(userId)}${newName()}_cropped.png`
	await storage().write(key, cropped, { contentType: 'image/png', upsert: false })
	return key
}

async function currentAvatar(userId: string): Promise<AvatarRow | null> {
	const [row] = await db
		.select({ avatar: users.avatar, avatarCropped: users.avatarCropped })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1)
	return row ?? null
}

function ownedKeys(userId: string, values: Array<string | null | undefined>, keep: string[] = []): string[] {
	const prefix = userPrefix(userId)
	const keys = new Set<string>()
	for (const value of values) {
		const key = ownStorageKey(value)
		if (key !== null && key.startsWith(prefix) && !keep.includes(key)) keys.add(key)
	}
	return [...keys]
}

async function removeQuietly(keys: string[]): Promise<void> {
	if (keys.length === 0) return
	try {
		await storage().remove(keys)
	} catch (error) {
		console.warn('[assets] orphan objects', keys, error)
	}
}

export async function saveAvatar(input: { userId: string; buffer: Buffer; crop: AvatarCrop }): Promise<AvatarResult> {
	const { userId, buffer, crop } = input
	const detected = await fileTypeFromBuffer(buffer)
	const ext = detected ? AVATAR_TYPES.get(detected.mime) : undefined
	if (!detected || !ext) throw new ApiError(400, AVATAR_TYPE_ERROR)

	const previous = await currentAvatar(userId)
	const box = cropBox(crop)
	const key = `${userPrefix(userId)}${newName()}.${ext}`
	const written: string[] = []
	let croppedKey: string | null = null
	try {
		await storage().write(key, buffer, { contentType: detected.mime, upsert: false })
		written.push(key)
		if (box) {
			croppedKey = await writeCrop(userId, buffer, box)
			written.push(croppedKey)
		}
		await db
			.update(users)
			.set({ avatar: key, avatarCropped: croppedKey, ...cropColumns(crop) })
			.where(eq(users.id, userId))
	} catch (error) {
		await removeQuietly(written)
		throw error
	}

	await removeQuietly(ownedKeys(userId, [previous?.avatar, previous?.avatarCropped], written))

	return { avatarUrl: avatarUrl(key), avatarCroppedUrl: avatarUrl(croppedKey), cropParams: cropParams(crop) }
}

export async function recropAvatar(input: { userId: string; crop: AvatarCrop }): Promise<AvatarResult> {
	const { userId, crop } = input
	const previous = await currentAvatar(userId)
	const originalKey = ownStorageKey(previous?.avatar)
	if (!previous?.avatar || originalKey === null) throw new ApiError(400, NO_AVATAR_ERROR)
	const original = await storage().read(originalKey)
	if (original === null) throw new ApiError(400, NO_AVATAR_ERROR)

	const box = cropBox(crop)
	let croppedKey: string | null = null
	try {
		if (box) croppedKey = await writeCrop(userId, original.data, box)
		await db
			.update(users)
			.set({ avatarCropped: croppedKey, ...cropColumns(crop) })
			.where(eq(users.id, userId))
	} catch (error) {
		if (croppedKey) await removeQuietly([croppedKey])
		throw error
	}

	const keep = croppedKey ? [croppedKey, originalKey] : [originalKey]
	await removeQuietly(ownedKeys(userId, [previous.avatarCropped], keep))

	return {
		avatarUrl: avatarUrl(previous.avatar),
		avatarCroppedUrl: avatarUrl(croppedKey),
		cropParams: cropParams(crop),
	}
}

export async function deleteAvatar(userId: string): Promise<void> {
	const previous = await currentAvatar(userId)
	if (!previous) return
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
	await removeQuietly(ownedKeys(userId, [previous.avatar, previous.avatarCropped]))
}

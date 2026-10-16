import { ANSWER_PHOTO_MAX_SIDE } from '@bio-exam/exam-core'

import { fileTypeFromBuffer } from 'file-type'
import sharp, { type Metadata, type Sharp } from 'sharp'

import { ApiError } from '../../lib/errors.js'

sharp.cache(false)
sharp.concurrency(1)

export const IMAGE_MAX_PIXELS = 50_000_000
export const IMAGE_INTAKE_CONCURRENCY = 1
export const IMAGE_INTAKE_QUEUE_LIMIT = 8

export const IMAGE_TYPE_ERROR = 'Поддерживаются только JPEG, PNG и WebP'
export const AVATAR_TYPE_ERROR =
	'Недопустимый тип файла. Файл не является допустимым изображением (JPEG, PNG, GIF, WebP)'
export const ANSWER_PHOTO_TYPE_MESSAGE = 'Поддерживаются фото в форматах JPEG, PNG и WebP'
export const HEIC_MESSAGE = 'Формат HEIC не поддерживается: сохраните фото как JPEG или сфотографируйте через сайт'
export const IMAGE_TOO_LARGE_MESSAGE = 'Слишком большое изображение. Уменьшите фото и попробуйте ещё раз'
export const IMAGE_CORRUPT_MESSAGE = 'Файл повреждён или не является изображением'
export const IMAGE_BUSY_MESSAGE = 'Сервер занят обработкой фото. Повторите через несколько секунд'

export type ImageRejectionStatus = 400 | 413 | 415 | 503

export class ImageRejectedError extends ApiError {
	override readonly statusCode: ImageRejectionStatus

	constructor(statusCode: ImageRejectionStatus, message: string) {
		super(statusCode, message)
		this.statusCode = statusCode
		this.name = 'ImageRejectedError'
	}
}

export type ImageOutput = { format: 'webp'; maxSide: number; quality: number } | { format: 'source' }

export type ImageProfile = {
	types: ReadonlyMap<string, string>
	typeMessage: string
	heicMessage: string | null
	maxPixels: number
	output: ImageOutput
	thumb: { side: number; quality: number } | null
	rejectWhenBusy: boolean
}

export type AcceptedImage = {
	full: Buffer
	thumb: Buffer | null
	mime: string
	ext: string
	width: number
	height: number
}

export type SlotLimiter = {
	run<T>(task: () => Promise<T>, options: { rejectWhenBusy: boolean }): Promise<T>
}

export type ImageIntake = {
	acceptImage(buffer: Buffer, profile: ImageProfile): Promise<AcceptedImage>
}

const PHOTO_TYPES: ReadonlyMap<string, string> = new Map([
	['image/jpeg', 'jpg'],
	['image/png', 'png'],
	['image/webp', 'webp'],
])

const PHOTO_AND_GIF_TYPES: ReadonlyMap<string, string> = new Map([...PHOTO_TYPES, ['image/gif', 'gif']])

const HEIC_TYPES: ReadonlySet<string> = new Set([
	'image/heic',
	'image/heif',
	'image/heic-sequence',
	'image/heif-sequence',
])

export const IMAGE_PROFILES = {
	answerPhoto: {
		types: PHOTO_TYPES,
		typeMessage: ANSWER_PHOTO_TYPE_MESSAGE,
		heicMessage: HEIC_MESSAGE,
		maxPixels: IMAGE_MAX_PIXELS,
		output: { format: 'webp', maxSide: ANSWER_PHOTO_MAX_SIDE, quality: 82 },
		thumb: { side: 400, quality: 75 },
		rejectWhenBusy: true,
	},
	mediaLibrary: {
		types: PHOTO_TYPES,
		typeMessage: IMAGE_TYPE_ERROR,
		heicMessage: null,
		maxPixels: IMAGE_MAX_PIXELS,
		output: { format: 'webp', maxSide: 1920, quality: 85 },
		thumb: null,
		rejectWhenBusy: false,
	},
	inlineImage: {
		types: PHOTO_AND_GIF_TYPES,
		typeMessage: IMAGE_TYPE_ERROR,
		heicMessage: null,
		maxPixels: IMAGE_MAX_PIXELS,
		output: { format: 'webp', maxSide: 1920, quality: 85 },
		thumb: null,
		rejectWhenBusy: false,
	},
	avatar: {
		types: PHOTO_AND_GIF_TYPES,
		typeMessage: AVATAR_TYPE_ERROR,
		heicMessage: null,
		maxPixels: IMAGE_MAX_PIXELS,
		output: { format: 'source' },
		thumb: null,
		rejectWhenBusy: false,
	},
} as const satisfies Record<string, ImageProfile>

export async function detectImageType(buffer: Buffer): Promise<string | null> {
	const detected = await fileTypeFromBuffer(buffer)
	return detected?.mime ?? null
}

export function createSlotLimiter(options: { concurrency: number; queueLimit: number }): SlotLimiter {
	let active = 0
	const waiting: Array<() => void> = []

	function release(): void {
		const next = waiting.shift()
		if (next) next()
		else active -= 1
	}

	return {
		async run<T>(task: () => Promise<T>, runOptions: { rejectWhenBusy: boolean }): Promise<T> {
			if (active < options.concurrency) {
				active += 1
			} else {
				if (runOptions.rejectWhenBusy && waiting.length >= options.queueLimit) {
					throw new ImageRejectedError(503, IMAGE_BUSY_MESSAGE)
				}
				await new Promise<void>((resolve) => waiting.push(resolve))
			}
			try {
				return await task()
			} finally {
				release()
			}
		},
	}
}

function decodeFailure(error: unknown): ImageRejectedError {
	if (error instanceof ImageRejectedError) return error
	const message = error instanceof Error ? error.message : ''
	if (message.includes('exceeds pixel limit')) return new ImageRejectedError(413, IMAGE_TOO_LARGE_MESSAGE)
	return new ImageRejectedError(400, IMAGE_CORRUPT_MESSAGE)
}

async function readPixels(buffer: Buffer): Promise<number> {
	let metadata: Metadata
	try {
		metadata = await sharp(buffer).metadata()
	} catch (error) {
		throw decodeFailure(error)
	}
	if (!metadata.width || !metadata.height) throw new ImageRejectedError(400, IMAGE_CORRUPT_MESSAGE)
	return metadata.width * metadata.height
}

function encodeAsSource(pipeline: Sharp, mime: string): Sharp {
	if (mime === 'image/jpeg') return pipeline.jpeg({ quality: 90 })
	if (mime === 'image/webp') return pipeline.webp({ quality: 90 })
	if (mime === 'image/gif') return pipeline.gif()
	return pipeline.png()
}

async function processImage(buffer: Buffer, mime: string, ext: string, profile: ImageProfile): Promise<AcceptedImage> {
	try {
		const pipeline = sharp(buffer, {
			limitInputPixels: profile.maxPixels,
			failOn: 'error',
			animated: mime === 'image/gif',
		}).autoOrient()
		const output = profile.output
		const encoded =
			output.format === 'webp'
				? pipeline
						.resize(output.maxSide, output.maxSide, { fit: 'inside', withoutEnlargement: true })
						.webp({ quality: output.quality })
				: encodeAsSource(pipeline, mime)
		const { data, info } = await encoded.toBuffer({ resolveWithObject: true })
		return {
			full: data,
			thumb: null,
			mime: output.format === 'webp' ? 'image/webp' : mime,
			ext: output.format === 'webp' ? 'webp' : ext,
			width: info.width,
			height: info.pageHeight ?? info.height,
		}
	} catch (error) {
		throw decodeFailure(error)
	}
}

async function makeThumb(data: Buffer, thumb: NonNullable<ImageProfile['thumb']>): Promise<Buffer> {
	return sharp(data)
		.resize(thumb.side, thumb.side, { fit: 'inside', withoutEnlargement: true })
		.webp({ quality: thumb.quality })
		.toBuffer()
}

export function createImageIntake(options: { concurrency: number; queueLimit: number }): ImageIntake {
	const limiter = createSlotLimiter(options)

	async function acceptImage(buffer: Buffer, profile: ImageProfile): Promise<AcceptedImage> {
		const mime = await detectImageType(buffer)
		if (mime === null) throw new ImageRejectedError(400, profile.typeMessage)
		const ext = profile.types.get(mime)
		if (ext === undefined) {
			const message = profile.heicMessage !== null && HEIC_TYPES.has(mime) ? profile.heicMessage : profile.typeMessage
			throw new ImageRejectedError(415, message)
		}
		if ((await readPixels(buffer)) > profile.maxPixels) throw new ImageRejectedError(413, IMAGE_TOO_LARGE_MESSAGE)
		return limiter.run(
			async () => {
				const image = await processImage(buffer, mime, ext, profile)
				return profile.thumb ? { ...image, thumb: await makeThumb(image.full, profile.thumb) } : image
			},
			{ rejectWhenBusy: profile.rejectWhenBusy }
		)
	}

	return { acceptImage }
}

export const acceptImage: ImageIntake['acceptImage'] = createImageIntake({
	concurrency: IMAGE_INTAKE_CONCURRENCY,
	queueLimit: IMAGE_INTAKE_QUEUE_LIMIT,
}).acceptImage

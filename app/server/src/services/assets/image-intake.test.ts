import assert from 'node:assert/strict'
import sharp, { type Sharp } from 'sharp'
import { describe, test } from 'vitest'

import {
	acceptImage,
	ANSWER_PHOTO_TYPE_MESSAGE,
	createSlotLimiter,
	HEIC_MESSAGE,
	IMAGE_BUSY_MESSAGE,
	IMAGE_CORRUPT_MESSAGE,
	IMAGE_PROFILES,
	IMAGE_TOO_LARGE_MESSAGE,
	IMAGE_TYPE_ERROR,
	ImageRejectedError,
} from './image-intake.js'

function solid(width: number, height: number): Sharp {
	return sharp({ create: { width, height, channels: 3, background: { r: 10, g: 120, b: 200 } } })
}

function heic(): Buffer {
	return Buffer.concat([
		Buffer.from([0, 0, 0, 0x18]),
		Buffer.from('ftypheic'),
		Buffer.from([0, 0, 0, 0]),
		Buffer.from('mif1heic'),
		Buffer.alloc(32),
	])
}

async function rotatedJpeg(orientation: number): Promise<Buffer> {
	return sharp({ create: { width: 800, height: 400, channels: 3, background: { r: 200, g: 100, b: 50 } } })
		.jpeg()
		.withMetadata({
			orientation,
			exif: {
				IFD0: { Make: 'Apple', Model: 'iPhone' },
				IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '55/1 45/1 0/1' },
			},
		})
		.toBuffer()
}

describe('acceptImage: фото ответа', () => {
	test('JPEG с Orientation 6 и GPS становится вертикальным WebP без EXIF и миниатюрой до 400 px', async () => {
		const accepted = await acceptImage(await rotatedJpeg(6), IMAGE_PROFILES.answerPhoto)
		assert.equal(accepted.mime, 'image/webp')
		assert.equal(accepted.ext, 'webp')
		const full = await sharp(accepted.full).metadata()
		assert.equal(full.format, 'webp')
		assert.ok(full.width < full.height)
		assert.equal(full.exif, undefined)
		assert.equal(full.orientation, undefined)
		assert.equal(accepted.width, full.width)
		assert.equal(accepted.height, full.height)
		assert.ok(accepted.thumb)
		const thumb = await sharp(accepted.thumb).metadata()
		assert.equal(thumb.format, 'webp')
		assert.ok(Math.max(thumb.width, thumb.height) <= 400)
		assert.equal(thumb.exif, undefined)
	})

	test.each([6, 8])('Orientation %i с GPS выпрямляется, EXIF и тег ориентации снимаются', async (orientation) => {
		const input = await rotatedJpeg(orientation)
		const source = await sharp(input).metadata()
		assert.equal(source.orientation, orientation)
		assert.ok(source.exif)
		const full = await sharp((await acceptImage(input, IMAGE_PROFILES.answerPhoto)).full).metadata()
		assert.ok(full.width < full.height)
		assert.equal(full.exif, undefined)
		assert.equal(full.orientation, undefined)
	})

	test.each<{ name: string; input: () => Promise<Buffer>; status: number; message: string }>([
		{
			name: 'текст под видом PNG',
			input: async () => Buffer.from('это не картинка, а обычный текст'),
			status: 400,
			message: ANSWER_PHOTO_TYPE_MESSAGE,
		},
		{ name: 'GIF', input: () => solid(20, 20).gif().toBuffer(), status: 415, message: ANSWER_PHOTO_TYPE_MESSAGE },
		{ name: 'HEIC', input: async () => heic(), status: 415, message: HEIC_MESSAGE },
		{ name: 'AVIF', input: () => solid(20, 20).avif().toBuffer(), status: 415, message: ANSWER_PHOTO_TYPE_MESSAGE },
		{
			name: 'PNG 8000×7000',
			input: () => solid(8000, 7000).png().toBuffer(),
			status: 413,
			message: IMAGE_TOO_LARGE_MESSAGE,
		},
		{
			name: 'сигнатура JPEG и мусор вместо данных',
			input: async () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]),
			status: 400,
			message: IMAGE_CORRUPT_MESSAGE,
		},
	])('$name: отказ $status', async ({ input, status, message }) => {
		const buffer = await input()
		await assert.rejects(acceptImage(buffer, IMAGE_PROFILES.answerPhoto), (error: unknown) => {
			assert.ok(error instanceof ImageRejectedError)
			assert.equal(error.statusCode, status)
			assert.equal(error.message, message)
			return true
		})
	})
})

describe('acceptImage: профили медиатеки и аватара', () => {
	test('медиатека принимает PNG и отдаёт WebP не больше 1920 px', async () => {
		const accepted = await acceptImage(await solid(3000, 1000).png().toBuffer(), IMAGE_PROFILES.mediaLibrary)
		const meta = await sharp(accepted.full).metadata()
		assert.equal(meta.format, 'webp')
		assert.equal(meta.width, 1920)
		assert.equal(accepted.thumb, null)
	})

	test('медиатека отказывает GIF кодом 415 с прежним текстом', async () => {
		await assert.rejects(
			acceptImage(await solid(20, 20).gif().toBuffer(), IMAGE_PROFILES.mediaLibrary),
			(error: unknown) => {
				assert.ok(error instanceof ImageRejectedError)
				assert.equal(error.statusCode, 415)
				assert.equal(error.message, IMAGE_TYPE_ERROR)
				return true
			}
		)
	})

	test('аватар принимает GIF и оставляет его GIF', async () => {
		const accepted = await acceptImage(await solid(40, 30).gif().toBuffer(), IMAGE_PROFILES.avatar)
		assert.equal(accepted.mime, 'image/gif')
		assert.equal(accepted.ext, 'gif')
		assert.equal((await sharp(accepted.full).metadata()).format, 'gif')
		assert.equal(accepted.width, 40)
		assert.equal(accepted.height, 30)
	})

	test('аватар из JPEG с Orientation 6 и GPS остаётся JPEG, вертикальным и без EXIF', async () => {
		const accepted = await acceptImage(await rotatedJpeg(6), IMAGE_PROFILES.avatar)
		assert.equal(accepted.mime, 'image/jpeg')
		assert.equal(accepted.ext, 'jpg')
		const meta = await sharp(accepted.full).metadata()
		assert.equal(meta.format, 'jpeg')
		assert.ok(meta.width < meta.height)
		assert.equal(meta.exif, undefined)
		assert.equal(meta.orientation, undefined)
	})
})

describe('createSlotLimiter', () => {
	function deferred(): { promise: Promise<void>; resolve: () => void } {
		let resolve: () => void = () => {}
		const promise = new Promise<void>((done) => {
			resolve = done
		})
		return { promise, resolve }
	}

	test('выполняет по одной задаче, при полной очереди фото ответа получает 503, остальные ждут по порядку', async () => {
		const limiter = createSlotLimiter({ concurrency: 1, queueLimit: 1 })
		const finished: string[] = []
		let running = 0
		let peak = 0
		const gates = { a: deferred(), b: deferred(), d: deferred() }
		function task(name: keyof typeof gates): () => Promise<string> {
			return async () => {
				running += 1
				peak = Math.max(peak, running)
				await gates[name].promise
				running -= 1
				finished.push(name)
				return name
			}
		}
		const a = limiter.run(task('a'), { rejectWhenBusy: true })
		const b = limiter.run(task('b'), { rejectWhenBusy: true })
		await assert.rejects(limiter.run(task('a'), { rejectWhenBusy: true }), (error: unknown) => {
			assert.ok(error instanceof ImageRejectedError)
			assert.equal(error.statusCode, 503)
			assert.equal(error.message, IMAGE_BUSY_MESSAGE)
			return true
		})
		const d = limiter.run(task('d'), { rejectWhenBusy: false })
		gates.d.resolve()
		gates.b.resolve()
		await new Promise((done) => setTimeout(done, 10))
		assert.deepEqual(finished, [])
		gates.a.resolve()
		assert.deepEqual(await Promise.all([a, b, d]), ['a', 'b', 'd'])
		assert.deepEqual(finished, ['a', 'b', 'd'])
		assert.equal(peak, 1)
	})
})

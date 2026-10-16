import { ANSWER_PHOTO_MAX_SIDE } from '@bio-exam/exam-core'

import type { PreparedPhoto } from './upload-queue'

const JPEG_QUALITY = 0.8

function jpegName(name: string): string {
	const base = name.replace(/\.[^./\\]*$/, '')
	return `${base || 'photo'}.jpg`
}

function toJpeg(canvas: HTMLCanvasElement): Promise<Blob | null> {
	return new Promise((resolve) => {
		canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY)
	})
}

export async function prepareForUpload(file: File): Promise<PreparedPhoto> {
	const original: PreparedPhoto = { blob: file, fileName: file.name }
	let bitmap: ImageBitmap | null = null
	let canvas: HTMLCanvasElement | null = null
	try {
		bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
		const longSide = Math.max(bitmap.width, bitmap.height)
		if (longSide === 0) return original
		const scale = Math.min(1, ANSWER_PHOTO_MAX_SIDE / longSide)
		canvas = document.createElement('canvas')
		canvas.width = Math.max(1, Math.round(bitmap.width * scale))
		canvas.height = Math.max(1, Math.round(bitmap.height * scale))
		const context = canvas.getContext('2d')
		if (!context) return original
		context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
		const blob = await toJpeg(canvas)
		if (!blob) return original
		return { blob, fileName: jpegName(file.name) }
	} catch {
		return original
	} finally {
		bitmap?.close()
		if (canvas) {
			canvas.width = 0
			canvas.height = 0
		}
	}
}

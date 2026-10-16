import type { RequestHandler } from 'express'
import multer from 'multer'

import { ApiError } from '../lib/errors.js'

export const UPLOAD_READ_ERROR = 'Не удалось прочитать файл из запроса'

const MEGABYTE = 1024 * 1024

export function uploadTooLargeMessage(maxBytes: number): string {
	return `Файл больше ${Math.round((maxBytes / MEGABYTE) * 10) / 10} МБ`
}

function uploadRefusal(error: unknown, maxBytes: number): ApiError {
	if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
		return new ApiError(413, uploadTooLargeMessage(maxBytes))
	}
	return new ApiError(400, UPLOAD_READ_ERROR)
}

export function singleFileUpload(options: { field: string; maxBytes: number }): RequestHandler {
	const upload = multer({
		storage: multer.memoryStorage(),
		limits: { fileSize: options.maxBytes, files: 1, fields: 10, parts: 12 },
	}).single(options.field)
	return function singleFileUpload(req, res, next) {
		upload(req, res, (error?: unknown) => {
			next(error ? uploadRefusal(error, options.maxBytes) : undefined)
		})
	}
}

import { z } from 'zod'

export const UPLOAD_WINDOW_ERROR_CODES = {
	closed: 'UPLOAD_WINDOW_CLOSED',
	none: 'UPLOAD_WINDOW_NONE',
} as const

export const UPLOAD_WINDOW_REFUSAL_STATUS = 422

export const PHOTO_UPLOAD_WINDOW_DEFAULT_MINUTES = 15

export const PHOTO_UPLOAD_WINDOW_MAX_MINUTES = 120

export const UploadWindowRefusalSchema = z.object({
	error: z.enum([UPLOAD_WINDOW_ERROR_CODES.closed, UPLOAD_WINDOW_ERROR_CODES.none]),
	uploadClosesAt: z.string().nullable(),
})

export type UploadWindowErrorCode = (typeof UPLOAD_WINDOW_ERROR_CODES)[keyof typeof UPLOAD_WINDOW_ERROR_CODES]
export type UploadWindowRefusal = z.infer<typeof UploadWindowRefusalSchema>

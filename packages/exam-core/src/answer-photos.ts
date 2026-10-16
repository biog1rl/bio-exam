import { z } from 'zod'

export const ANSWER_PHOTO_MAX_COUNT = 5

export const ANSWER_PHOTO_MAX_BYTES = 10 * 1024 * 1024

export const ANSWER_PHOTO_MAX_SIDE = 2560

export const ANSWER_PHOTO_VARIANTS = ['thumb', 'full'] as const

export const ANSWER_PHOTO_LIMIT_MESSAGE = `К ответу можно прикрепить не больше ${ANSWER_PHOTO_MAX_COUNT} фото`

export const AnswerPhotoSchema = z.object({
	id: z.string().uuid(),
	questionId: z.string().uuid(),
	uploadedAt: z.string(),
})

export const AnswerPhotoUploadResponseSchema = z.object({
	photo: AnswerPhotoSchema,
	count: z.number().int().min(0).max(ANSWER_PHOTO_MAX_COUNT),
})

export const AnswerPhotoListResponseSchema = z.object({
	photos: z.array(AnswerPhotoSchema),
})

export const AnswerPhotoDeleteResponseSchema = z.object({
	count: z.number().int().nonnegative(),
})

export type AnswerPhotoVariant = (typeof ANSWER_PHOTO_VARIANTS)[number]
export type AnswerPhoto = z.infer<typeof AnswerPhotoSchema>
export type AnswerPhotoUploadResponse = z.infer<typeof AnswerPhotoUploadResponseSchema>
export type AnswerPhotoListResponse = z.infer<typeof AnswerPhotoListResponseSchema>
export type AnswerPhotoDeleteResponse = z.infer<typeof AnswerPhotoDeleteResponseSchema>

import { z } from 'zod'

export const ANSWER_PHOTO_MAX_COUNT = 5

export const ANSWER_PHOTO_MAX_COUNT_LIMIT = 10

export const ANSWER_PHOTO_MAX_BYTES = 10 * 1024 * 1024

export const ANSWER_PHOTO_MAX_SIDE = 2560

export const ANSWER_PHOTO_VARIANTS = ['thumb', 'full'] as const

export function answerPhotoLimitMessage(max: number): string {
	return `К ответу можно прикрепить не больше ${max} фото`
}

export const ANSWER_PHOTO_LIMIT_MESSAGE = answerPhotoLimitMessage(ANSWER_PHOTO_MAX_COUNT)

export const ANSWER_PHOTO_FORBIDDEN_MESSAGE = 'К ответу на этот вопрос нельзя прикрепить фото'

export const UPLOAD_TOKEN_HEADER = 'X-Upload-Token'

export const UPLOAD_LINK_INVALID_MESSAGE = 'Ссылка недействительна'

export const QuestionPhotoSettingsSchema = z.object({
	allowPhotos: z.boolean(),
	maxPhotos: z.number().int().min(1).max(ANSWER_PHOTO_MAX_COUNT_LIMIT),
})

export const AnswerPhotoSchema = z.object({
	id: z.string().uuid(),
	questionId: z.string().uuid(),
	uploadedAt: z.string(),
})

export const AnswerPhotoUploadResponseSchema = z.object({
	photo: AnswerPhotoSchema,
	count: z.number().int().min(0).max(ANSWER_PHOTO_MAX_COUNT_LIMIT),
})

export const AnswerPhotoListResponseSchema = z.object({
	photos: z.array(AnswerPhotoSchema),
})

export const AnswerPhotoDeleteResponseSchema = z.object({
	count: z.number().int().nonnegative(),
})

export const UploadLinkIssueResponseSchema = z.object({
	token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
	uploadClosesAt: z.string().nullable(),
	serverNow: z.string(),
})

export const UploadLinkContextSchema = z.object({
	testTitle: z.string(),
	questionNumber: z.number().int().min(1),
	promptText: z.string(),
	allowPhotos: z.boolean(),
	maxPhotos: z.number().int().min(1).max(ANSWER_PHOTO_MAX_COUNT_LIMIT),
	uploadClosesAt: z.string().nullable(),
	serverNow: z.string(),
})

export type QuestionPhotoSettings = z.infer<typeof QuestionPhotoSettingsSchema>
export type AnswerPhotoVariant = (typeof ANSWER_PHOTO_VARIANTS)[number]
export type AnswerPhoto = z.infer<typeof AnswerPhotoSchema>
export type AnswerPhotoUploadResponse = z.infer<typeof AnswerPhotoUploadResponseSchema>
export type AnswerPhotoListResponse = z.infer<typeof AnswerPhotoListResponseSchema>
export type AnswerPhotoDeleteResponse = z.infer<typeof AnswerPhotoDeleteResponseSchema>
export type UploadLinkIssueResponse = z.infer<typeof UploadLinkIssueResponseSchema>
export type UploadLinkContext = z.infer<typeof UploadLinkContextSchema>

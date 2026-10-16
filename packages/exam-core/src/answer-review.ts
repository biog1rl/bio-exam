import { z } from 'zod'

import { REVIEW_STATUSES } from './outcome'
import { OPEN_QUESTION_MAX_POINTS } from './registry'

export const OPEN_REVIEW_COMMENT_MAX_LENGTH = 2000

export const OPEN_REVIEW_NO_ANSWER_COMMENT = 'нет ответа'

export const REVIEW_ERROR_CODES = {
	notReady: 'REVIEW_NOT_READY',
} as const

export const OpenReviewRequestSchema = z.object({
	score: z.number().int().min(0).max(OPEN_QUESTION_MAX_POINTS),
	comment: z.string().trim().max(OPEN_REVIEW_COMMENT_MAX_LENGTH).optional(),
})

export const OpenReviewSchema = z.object({
	score: z.number().int().min(0).max(OPEN_QUESTION_MAX_POINTS),
	comment: z.string().nullable(),
	reviewedAt: z.string(),
	reviewerName: z.string().nullable(),
})

export const SavedOpenReviewSchema = OpenReviewSchema.extend({
	questionId: z.string().uuid(),
})

export const OpenReviewResponseSchema = z.object({
	review: SavedOpenReviewSchema,
	attempt: z.object({
		reviewStatus: z.enum(REVIEW_STATUSES),
		finalScorePercentage: z.number().nullable(),
		finalPassed: z.boolean().nullable(),
	}),
})

export const OpenAnswerPhotoSchema = z.object({
	id: z.string().uuid(),
	uploadedAt: z.string(),
})

export const AdminOpenAnswerSchema = z.object({
	text: z.string(),
	photos: z.array(OpenAnswerPhotoSchema),
	review: OpenReviewSchema.nullable(),
	referenceText: z.string().nullable(),
})

export const StudentOpenReviewSchema = z.object({
	score: z.number().int().min(0).max(OPEN_QUESTION_MAX_POINTS),
	comment: z.string().nullable(),
})

export type OpenReviewRequest = z.infer<typeof OpenReviewRequestSchema>
export type OpenReview = z.infer<typeof OpenReviewSchema>
export type SavedOpenReview = z.infer<typeof SavedOpenReviewSchema>
export type OpenReviewResponse = z.infer<typeof OpenReviewResponseSchema>
export type AdminOpenAnswer = z.infer<typeof AdminOpenAnswerSchema>
export type StudentOpenReview = z.infer<typeof StudentOpenReviewSchema>

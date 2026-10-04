import { z } from 'zod'

import { TelemetryMapSchema } from './telemetry'

export const AnswerValueSchema = z.union([z.string(), z.array(z.string()), z.record(z.string(), z.string())])

export const SubmitResultItemSchema = z.object({
	questionId: z.string().uuid(),
	isCorrect: z.boolean(),
	points: z.number(),
	earnedPoints: z.number(),
	userAnswer: z.unknown(),
	correctAnswer: z.unknown(),
	explanationText: z.string().nullable(),
})

export const SubmitResultSchema = z.object({
	attemptId: z.string().uuid(),
	submittedAt: z.string(),
	earnedPoints: z.number(),
	totalPoints: z.number(),
	scorePercentage: z.number(),
	passed: z.boolean(),
	results: z.array(SubmitResultItemSchema),
})

export const ATTEMPT_GRACE_PERIOD_MINUTES = 2

export const SUBMIT_ERROR_CODES = {
	alreadySubmitted: 'ATTEMPT_ALREADY_SUBMITTED',
	timeExpired: 'TIME_EXPIRED',
} as const

export const SubmitAttemptRequestSchema = z.object({
	sessionId: z.string().uuid(),
	clientAttemptId: z.string().uuid(),
	answers: z.record(z.string().uuid(), AnswerValueSchema),
	telemetry: TelemetryMapSchema.optional(),
})

export const SubmitAttemptErrorSchema = z.object({
	error: z.enum([SUBMIT_ERROR_CODES.alreadySubmitted, SUBMIT_ERROR_CODES.timeExpired]),
	attemptId: z.string().uuid().nullable().optional(),
})

export type AnswerValue = z.infer<typeof AnswerValueSchema>
export type SubmitResultItem = z.infer<typeof SubmitResultItemSchema>
export type SubmitResult = z.infer<typeof SubmitResultSchema>
export type SubmitAttemptRequest = z.infer<typeof SubmitAttemptRequestSchema>
export type SubmitAttemptError = z.infer<typeof SubmitAttemptErrorSchema>

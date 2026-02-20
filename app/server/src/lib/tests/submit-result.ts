import { z } from 'zod'

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

export type SubmitResultItem = z.infer<typeof SubmitResultItemSchema>
export type SubmitResult = z.infer<typeof SubmitResultSchema>

import { z } from 'zod'

import { AnswerValueSchema } from './attempt-result'
import { TelemetryMapSchema } from './telemetry'

export const SaveAttemptDraftRequestSchema = z
	.object({
		questionId: z.string().uuid().optional(),
		value: AnswerValueSchema.optional(),
		telemetry: TelemetryMapSchema.optional(),
	})
	.superRefine((data, ctx) => {
		const hasQuestion = data.questionId !== undefined
		const hasValue = data.value !== undefined
		if (hasQuestion !== hasValue || (!hasQuestion && data.telemetry === undefined)) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'Provide questionId with value, telemetry, or both',
			})
		}
	})

export const AttemptSessionSchema = z.object({
	sessionId: z.string(),
	startedAt: z.string(),
	draftAnswers: z.record(z.string(), z.unknown()).nullable(),
	draftLastQuestionId: z.string().nullable(),
	draftTelemetry: TelemetryMapSchema.nullable(),
})

export type SaveAttemptDraftRequest = z.infer<typeof SaveAttemptDraftRequestSchema>
export type AttemptSession = z.infer<typeof AttemptSessionSchema>

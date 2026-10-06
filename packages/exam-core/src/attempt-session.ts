import { z } from 'zod'

import { AnswerValueSchema, AttemptViewSchema, ATTEMPT_SUBMIT_SOURCES } from './attempt-result'
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
	serverNow: z.string().optional(),
})

export const SessionFateSchema = z.discriminatedUnion('state', [
	z.object({
		state: z.literal('open'),
		sessionId: z.string(),
		startedAt: z.string(),
		serverNow: z.string(),
	}),
	z.object({
		state: z.literal('submitted'),
		attemptId: z.string().uuid(),
		submitSource: z.enum(ATTEMPT_SUBMIT_SOURCES),
		uploadClosesAt: z.string().nullable(),
		serverNow: z.string(),
		attempt: AttemptViewSchema,
	}),
	z.object({
		state: z.literal('expired'),
		serverNow: z.string(),
	}),
])

export type SaveAttemptDraftRequest = z.infer<typeof SaveAttemptDraftRequestSchema>
export type AttemptSession = z.infer<typeof AttemptSessionSchema>
export type SessionFate = z.infer<typeof SessionFateSchema>

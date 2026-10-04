import { z } from 'zod'

import type { QuestionVerdicts } from './adapters/types'
import { MISTAKE_METRICS, QUESTION_UI_TEMPLATES } from './registry'
import { TelemetryMapSchema } from './telemetry'

export const AnswerValueSchema = z.union([z.string(), z.array(z.string()), z.record(z.string(), z.string())])

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

const VerdictMistakesSchema = z.number().int().nonnegative()

const ChoiceOptionVerdictSchema = z.object({
	optionId: z.string(),
	kind: z.enum(['selected_correct', 'selected_wrong', 'missed', 'neutral']),
})

const MatchingPairVerdictSchema = z.object({
	leftId: z.string(),
	kind: z.enum(['correct', 'wrong']),
	given: z.string().nullable(),
	expected: z.string().nullable(),
})

const ShortTextVerdictSchema = z.object({
	kind: z.enum(['correct', 'wrong']),
})

const SequencePositionVerdictSchema = z.object({
	position: z.number().int(),
	kind: z.enum(['correct', 'wrong', 'missing', 'extra', 'swapped']),
	given: z.string().nullable(),
	expected: z.string().nullable(),
})

const QuestionVerdictsUnionSchema = z.discriminatedUnion('template', [
	z.object({
		template: z.literal('single_choice'),
		mistakes: VerdictMistakesSchema,
		parts: z.array(ChoiceOptionVerdictSchema),
	}),
	z.object({
		template: z.literal('multi_choice'),
		mistakes: VerdictMistakesSchema,
		parts: z.array(ChoiceOptionVerdictSchema),
	}),
	z.object({
		template: z.literal('matching'),
		mistakes: VerdictMistakesSchema,
		parts: z.array(MatchingPairVerdictSchema),
	}),
	z.object({
		template: z.literal('short_text'),
		mistakes: VerdictMistakesSchema,
		parts: z.array(ShortTextVerdictSchema),
	}),
	z.object({
		template: z.literal('sequence_digits'),
		mistakes: VerdictMistakesSchema,
		parts: z.array(SequencePositionVerdictSchema),
	}),
])

export const QuestionVerdictsSchema: z.ZodType<QuestionVerdicts> = QuestionVerdictsUnionSchema

export const QuestionStatusSchema = z.enum(['ungraded', 'correct', 'partial', 'wrong'])

export type QuestionStatus = z.infer<typeof QuestionStatusSchema>

export function questionStatus(input: { points: number; isCorrect: boolean; earnedPoints: number }): QuestionStatus {
	if (input.points === 0) return 'ungraded'
	if (input.isCorrect) return 'correct'
	if (input.earnedPoints > 0) return 'partial'
	return 'wrong'
}

export const ScoredQuestionFactSchema = z.object({
	questionId: z.string().uuid(),
	template: z.enum(QUESTION_UI_TEMPLATES),
	metric: z.enum(MISTAKE_METRICS),
	points: z.number(),
	earnedPoints: z.number(),
	isCorrect: z.boolean(),
	mistakes: z.number().int().nonnegative().nullable(),
	key: AnswerValueSchema.nullable(),
	keyVersion: z.number().int().positive().nullable(),
	verdicts: QuestionVerdictsSchema.nullable(),
	userAnswer: AnswerValueSchema.nullable(),
	explanationText: z.string().nullable(),
})

export const AttemptFactsSchema = z.array(ScoredQuestionFactSchema)

export const LegacyAttemptResultItemSchema = z
	.object({
		questionId: z.string(),
		isCorrect: z.boolean(),
		points: z.number(),
		earnedPoints: z.number(),
		userAnswer: z.unknown().optional(),
		correctAnswer: z.unknown().optional(),
		explanationText: z.string().nullable().optional(),
	})
	.passthrough()

export const LegacyAttemptResultsSchema = z.array(LegacyAttemptResultItemSchema)

export const AttemptQuestionViewSchema = z.object({
	questionId: z.string().uuid(),
	isCorrect: z.boolean(),
	points: z.number(),
	earnedPoints: z.number(),
	userAnswer: z.unknown(),
	correctAnswer: z.unknown(),
	explanationText: z.string().nullable(),
	status: QuestionStatusSchema,
	keyVisible: z.boolean(),
	mistakes: z.number().int().nonnegative().nullable(),
	verdicts: QuestionVerdictsSchema.nullable(),
})

export const AttemptViewSchema = z.object({
	attemptId: z.string().uuid(),
	submittedAt: z.string(),
	earnedPoints: z.number(),
	totalPoints: z.number(),
	scorePercentage: z.number(),
	passed: z.boolean(),
	results: z.array(AttemptQuestionViewSchema),
})

export const AdminAttemptViewSchema = AttemptViewSchema.extend({
	testId: z.string().uuid(),
	userId: z.string().uuid(),
	answers: z.record(z.string(), z.unknown()),
	telemetry: TelemetryMapSchema.nullable(),
})

export type AnswerValue = z.infer<typeof AnswerValueSchema>
export type ScoredQuestionFact = z.infer<typeof ScoredQuestionFactSchema>
export type AttemptFacts = z.infer<typeof AttemptFactsSchema>
export type LegacyAttemptResultItem = z.infer<typeof LegacyAttemptResultItemSchema>
export type AttemptQuestionView = z.infer<typeof AttemptQuestionViewSchema>
export type AttemptView = z.infer<typeof AttemptViewSchema>
export type AdminAttemptView = z.infer<typeof AdminAttemptViewSchema>
export type SubmitAttemptRequest = z.infer<typeof SubmitAttemptRequestSchema>
export type SubmitAttemptError = z.infer<typeof SubmitAttemptErrorSchema>

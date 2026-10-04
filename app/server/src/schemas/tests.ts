/**
 * Zod-схемы для эндпоинтов тестов
 */

import { MatchingPairsSchema, OptionSchema, QuestionKeyPayloadSchema } from '@bio-exam/exam-core'

import { z } from 'zod'

import { TestScoringRulesSchema } from '../lib/tests/scoring.js'

export { MatchingPairsSchema, OptionSchema }

export const QuestionSchema = z.object({
	id: z.string().uuid().optional(),
	type: z
		.string()
		.min(1)
		.max(100)
		.regex(/^[a-z0-9_]+$/),
	order: z.number().int().min(0),
	points: z.number().nonnegative().default(1),
	options: z.array(OptionSchema).optional().nullable(),
	matchingPairs: MatchingPairsSchema.optional().nullable(),
	promptText: z.string().min(1),
	explanationText: z.string().optional().nullable(),
	correct: QuestionKeyPayloadSchema,
})

export const SaveTestSchema = z
	.object({
		topicId: z.string().uuid(),
		title: z.string().min(1).max(200),
		slug: z
			.string()
			.regex(/^[a-z0-9-]+$/)
			.min(2)
			.max(100),
		description: z.string().optional().nullable(),
		isPublished: z.boolean().default(false),
		showCorrectAnswer: z.boolean().default(true),
		scoringRules: TestScoringRulesSchema.optional(),
		timeLimitMinutes: z.number().int().positive().optional().nullable(),
		redThresholdMinutes: z.number().int().positive().optional().nullable(),
		warningThresholdMinutes: z.number().int().positive().optional().nullable(),
		passingScore: z.number().min(0).max(100).optional().nullable(),
		order: z.number().int().min(0).default(0),
		questions: z.array(QuestionSchema),
	})
	.superRefine((value, ctx) => {
		if (value.isPublished && value.questions.length === 0) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['questions'],
				message: 'Для публикации добавьте хотя бы один вопрос',
			})
		}
	})

export const UpdateTestSettingsSchema = z.object({
	topicId: z.string().uuid(),
	title: z.string().min(1).max(200),
	slug: z
		.string()
		.regex(/^[a-z0-9-]+$/)
		.min(2)
		.max(100),
	description: z.string().optional().nullable(),
	isPublished: z.boolean().default(false),
	showCorrectAnswer: z.boolean().default(true),
	scoringRules: TestScoringRulesSchema.optional(),
	timeLimitMinutes: z.number().int().positive().optional().nullable(),
	redThresholdMinutes: z.number().int().positive().optional().nullable(),
	warningThresholdMinutes: z.number().int().positive().optional().nullable(),
	passingScore: z.number().min(0).max(100).optional().nullable(),
	order: z.number().int().min(0).default(0),
})

export const SaveQuestionSchema = z.object({
	type: z
		.string()
		.min(1)
		.max(100)
		.regex(/^[a-z0-9_]+$/),
	order: z.number().int().min(0).optional(),
	points: z.number().nonnegative().default(1),
	options: z.array(OptionSchema).optional().nullable(),
	matchingPairs: MatchingPairsSchema.optional().nullable(),
	promptText: z.string().min(1),
	explanationText: z.string().optional().nullable(),
	correct: QuestionKeyPayloadSchema,
})

export const ReorderQuestionsSchema = z
	.object({
		questionIds: z.array(z.string().uuid()).min(1),
	})
	.superRefine((value, ctx) => {
		if (new Set(value.questionIds).size !== value.questionIds.length) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['questionIds'],
				message: 'questionIds должны быть уникальными',
			})
		}
	})

export const TopicSchema = z.object({
	slug: z
		.string()
		.regex(/^[a-z0-9-]+$/)
		.min(2)
		.max(100),
	title: z.string().min(1).max(200),
	description: z.string().optional().nullable(),
	order: z.number().int().min(0).default(0),
	isActive: z.boolean().default(true),
})

export const MoveQuestionSchema = z
	.object({
		targetTestId: z.string().uuid().optional(),
		targetTopicId: z.string().uuid().optional(),
	})
	.refine((value) => Boolean(value.targetTestId || value.targetTopicId), {
		message: 'targetTestId или targetTopicId обязателен',
		path: ['targetTestId'],
	})

export const QuestionDraftPayloadSchema = z.record(z.unknown())

export const UpdateQuestionDraftSchema = z.object({
	payload: QuestionDraftPayloadSchema,
	lockVersion: z.number().int().min(0).optional(),
})

// Экспорт типов
export type Option = z.infer<typeof OptionSchema>
export type MatchingPairs = z.infer<typeof MatchingPairsSchema>
export type Question = z.infer<typeof QuestionSchema>
export type SaveTest = z.infer<typeof SaveTestSchema>
export type UpdateTestSettings = z.infer<typeof UpdateTestSettingsSchema>
export type SaveQuestion = z.infer<typeof SaveQuestionSchema>
export type ReorderQuestions = z.infer<typeof ReorderQuestionsSchema>
export type Topic = z.infer<typeof TopicSchema>
export type MoveQuestion = z.infer<typeof MoveQuestionSchema>
export type QuestionDraftPayload = z.infer<typeof QuestionDraftPayloadSchema>
export type UpdateQuestionDraft = z.infer<typeof UpdateQuestionDraftSchema>

/**
 * Zod-схемы для эндпоинтов тестов
 */

import { z } from 'zod'

export const OptionSchema = z.object({
	id: z.string(),
	text: z.string(),
})

export const MatchingPairsSchema = z.object({
	left: z.array(z.object({ id: z.string(), text: z.string() })),
	right: z.array(z.object({ id: z.string(), text: z.string() })),
})

export const QuestionSchema = z.object({
	id: z.string().uuid().optional(),
	type: z.enum(['radio', 'checkbox', 'matching']),
	order: z.number().int().min(0),
	points: z.number().positive().default(1),
	options: z.array(OptionSchema).optional().nullable(),
	matchingPairs: MatchingPairsSchema.optional().nullable(),
	promptText: z.string().min(1),
	explanationText: z.string().optional().nullable(),
	correct: z.union([z.string(), z.array(z.string()), z.record(z.string(), z.string())]),
})

export const SaveTestSchema = z.object({
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
	timeLimitMinutes: z.number().int().positive().optional().nullable(),
	passingScore: z.number().min(0).max(100).optional().nullable(),
	order: z.number().int().min(0).default(0),
	questions: z.array(QuestionSchema).min(1),
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

// Экспорт типов
export type Option = z.infer<typeof OptionSchema>
export type MatchingPairs = z.infer<typeof MatchingPairsSchema>
export type Question = z.infer<typeof QuestionSchema>
export type SaveTest = z.infer<typeof SaveTestSchema>
export type Topic = z.infer<typeof TopicSchema>
export type MoveQuestion = z.infer<typeof MoveQuestionSchema>

/**
 * Zod-схемы для эндпоинтов тестов
 */

import { z } from 'zod'

import { TestScoringRulesSchema } from '../lib/tests/scoring.js'

const IdSchema = z.union([z.string(), z.number()]).transform((value) => String(value))

export const OptionSchema = z.object({
	id: IdSchema,
	text: z.string(),
})

export const MatchingPairsSchema = z.object({
	left: z.array(z.object({ id: IdSchema, text: z.string() })),
	right: z.array(z.object({ id: IdSchema, text: z.string() })),
})

const CorrectAnswerSchema = z.union([
	IdSchema,
	z.array(IdSchema),
	z.record(IdSchema),
])

function hasDuplicateIds(values: string[]): boolean {
	return new Set(values).size !== values.length
}

export const QuestionSchema = z
	.object({
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
		correct: CorrectAnswerSchema,
	})
	.superRefine((value, ctx) => {
		if (value.type === 'radio' || value.type === 'checkbox') {
			const options = value.options ?? []
			if (options.length < 2) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['options'],
					message: 'Для вопросов с вариантами нужно минимум 2 варианта',
				})
				return
			}

			const optionIds = options.map((option) => option.id)
			if (hasDuplicateIds(optionIds)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['options'],
					message: 'ID вариантов должны быть уникальными',
				})
			}

			if (value.type === 'radio') {
				if (typeof value.correct !== 'string' || !optionIds.includes(value.correct)) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						path: ['correct'],
						message: 'Для radio укажите один корректный вариант из списка',
					})
				}
			} else {
				if (!Array.isArray(value.correct) || value.correct.length === 0) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						path: ['correct'],
						message: 'Для checkbox нужен список корректных вариантов',
					})
					return
				}

				if (hasDuplicateIds(value.correct)) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						path: ['correct'],
						message: 'В correct не должно быть дубликатов',
					})
				}

				const hasUnknownOption = value.correct.some((optionId) => !optionIds.includes(optionId))
				if (hasUnknownOption) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						path: ['correct'],
						message: 'Все правильные варианты должны существовать в options',
					})
				}
			}
		}

		if (value.type === 'matching') {
			const pairs = value.matchingPairs
			if (!pairs || pairs.left.length < 2 || pairs.right.length < 2) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['matchingPairs'],
					message: 'Для matching нужно минимум 2 элемента слева и справа',
				})
				return
			}

			const leftIds = pairs.left.map((item) => item.id)
			const rightIds = pairs.right.map((item) => item.id)
			if (hasDuplicateIds(leftIds) || hasDuplicateIds(rightIds)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['matchingPairs'],
					message: 'ID элементов matching должны быть уникальными',
				})
			}

			if (typeof value.correct !== 'object' || Array.isArray(value.correct)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['correct'],
					message: 'Для matching correct должен быть объектом соответствий',
				})
				return
			}

			for (const leftId of leftIds) {
				const mapped = value.correct[leftId]
				if (!mapped || !rightIds.includes(mapped)) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						path: ['correct', leftId],
						message: 'Для каждого элемента слева нужно выбрать корректное соответствие справа',
					})
				}
			}
		}

		if (value.type === 'short_answer') {
			if (typeof value.correct !== 'string' || value.correct.trim().length === 0) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['correct'],
					message: 'Для short_answer правильный ответ должен быть строкой',
				})
			}
		}

		if (value.type === 'sequence') {
			if (typeof value.correct !== 'string') {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['correct'],
					message: 'Для sequence правильный ответ должен быть строкой из цифр',
				})
				return
			}

			const normalized = value.correct.replace(/\s+/g, '')
			if (!/^\d+$/.test(normalized)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['correct'],
					message: 'Для sequence используйте только цифры без пробелов',
				})
			}
		}
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
	passingScore: z.number().min(0).max(100).optional().nullable(),
	order: z.number().int().min(0).default(0),
})

export const SaveQuestionSchema = z
	.object({
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
		correct: CorrectAnswerSchema,
	})
	.superRefine((value, ctx) => {
		const probe = QuestionSchema.safeParse({
			...value,
			id: undefined,
			order: value.order ?? 0,
		})
		if (probe.success) return
		for (const issue of probe.error.issues) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: issue.path,
				message: issue.message,
			})
		}
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

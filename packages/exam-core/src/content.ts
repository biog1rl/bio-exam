import { z } from 'zod'

export const QuestionIdValueSchema = z.union([z.string(), z.number()]).transform((value) => String(value))

export const OptionSchema = z.object({
	id: QuestionIdValueSchema,
	text: z.string(),
})

export const MatchingPairsSchema = z.object({
	left: z.array(z.object({ id: QuestionIdValueSchema, text: z.string() })),
	right: z.array(z.object({ id: QuestionIdValueSchema, text: z.string() })),
})

export const QuestionKeyPayloadSchema = z.union([
	QuestionIdValueSchema,
	z.array(QuestionIdValueSchema),
	z.record(QuestionIdValueSchema),
])

export type QuestionOption = z.infer<typeof OptionSchema>
export type QuestionMatchingPairs = z.infer<typeof MatchingPairsSchema>
export type QuestionKeyPayload = z.infer<typeof QuestionKeyPayloadSchema>

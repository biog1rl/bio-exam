import { z } from 'zod'

export const SCORING_FORMULAS = ['exact_match', 'one_mistake_partial'] as const

const QuestionScoringRuleSchema = z
	.object({
		formula: z.enum(SCORING_FORMULAS),
		correctPoints: z.number().min(0),
		oneMistakePoints: z.number().min(0).optional(),
	})
	.superRefine((value, ctx) => {
		if (value.formula === 'one_mistake_partial' && typeof value.oneMistakePoints !== 'number') {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['oneMistakePoints'],
				message: 'oneMistakePoints обязателен для формулы one_mistake_partial',
			})
		}
	})

export const TestScoringRulesSchema = z.object({
	radio: QuestionScoringRuleSchema,
	checkbox: QuestionScoringRuleSchema,
	matching: QuestionScoringRuleSchema,
	short_answer: QuestionScoringRuleSchema,
	sequence: QuestionScoringRuleSchema,
})

export type TestScoringRules = z.infer<typeof TestScoringRulesSchema>

export function createDefaultTestScoringRules(): TestScoringRules {
	return {
		radio: { formula: 'exact_match', correctPoints: 1 },
		short_answer: { formula: 'exact_match', correctPoints: 1 },
		sequence: { formula: 'one_mistake_partial', correctPoints: 2, oneMistakePoints: 1 },
		matching: { formula: 'one_mistake_partial', correctPoints: 2, oneMistakePoints: 1 },
		checkbox: { formula: 'one_mistake_partial', correctPoints: 2, oneMistakePoints: 1 },
	}
}

export function parseTestScoringRules(value: unknown): TestScoringRules {
	const parsed = TestScoringRulesSchema.safeParse(value)
	return parsed.success ? parsed.data : createDefaultTestScoringRules()
}

export function resolveEffectiveScoringRules(params: {
	globalRules?: unknown
	testOverrideRules?: unknown
}): TestScoringRules {
	const globalRules = parseTestScoringRules(params.globalRules)
	if (params.testOverrideRules == null) return globalRules
	return parseTestScoringRules(params.testOverrideRules)
}

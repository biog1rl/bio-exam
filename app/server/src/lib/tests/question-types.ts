import { z } from 'zod'

export const QUESTION_UI_TEMPLATES = [
	'single_choice',
	'multi_choice',
	'matching',
	'short_text',
	'sequence_digits',
] as const
export type QuestionUiTemplate = (typeof QUESTION_UI_TEMPLATES)[number]

export const MISTAKE_METRICS = [
	'boolean_correct',
	'set_distance',
	'pair_mismatch_count',
	'compact_text_equal',
	'hamming_digits',
] as const
export type MistakeMetric = (typeof MISTAKE_METRICS)[number]

export const ALLOWED_MISTAKE_METRICS_BY_TEMPLATE: Record<QuestionUiTemplate, MistakeMetric[]> = {
	single_choice: ['boolean_correct'],
	multi_choice: ['set_distance'],
	matching: ['pair_mismatch_count'],
	short_text: ['compact_text_equal'],
	sequence_digits: ['hamming_digits'],
}

export const SCORING_FORMULAS = ['exact_match', 'one_mistake_partial', 'tiers'] as const
export type ScoringFormula = (typeof SCORING_FORMULAS)[number]

export const ScoringTierSchema = z.object({
	maxMistakes: z.number().int().min(1),
	points: z.number().min(0),
})

export const QuestionTypeScoringRuleSchema = z
	.object({
		formula: z.enum(SCORING_FORMULAS),
		mistakeMetric: z.enum(MISTAKE_METRICS),
		correctPoints: z.number().min(0),
		oneMistakePoints: z.number().min(0).optional(),
		tiers: z.array(ScoringTierSchema).optional(),
	})
	.superRefine((value, ctx) => {
		if (value.formula === 'one_mistake_partial' && typeof value.oneMistakePoints !== 'number') {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['oneMistakePoints'],
				message: 'oneMistakePoints обязателен для формулы one_mistake_partial',
			})
		}
		if (value.formula === 'tiers') {
			if (!value.tiers || value.tiers.length === 0) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['tiers'],
					message: 'tiers обязателен для формулы tiers',
				})
			}
			if (value.tiers?.some((tier) => tier.points > value.correctPoints)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['tiers'],
					message: 'Баллы в tiers не могут быть больше correctPoints',
				})
			}
		}
	})

export type QuestionTypeScoringRule = z.infer<typeof QuestionTypeScoringRuleSchema>

export const QuestionTypeValidationSchema = z
	.object({
		minOptions: z.number().int().min(0).optional(),
		maxOptions: z.number().int().min(0).optional(),
		exactChoiceCount: z.number().int().min(1).optional(),
	})
	.optional()
	.nullable()

export const QuestionTypeDefinitionSchema = z
	.object({
		key: z
			.string()
			.min(1)
			.max(100)
			.regex(/^[a-z0-9_]+$/),
		title: z.string().min(1).max(120),
		description: z.string().max(500).optional().nullable(),
		uiTemplate: z.enum(QUESTION_UI_TEMPLATES),
		validationSchema: QuestionTypeValidationSchema,
		scoringRule: QuestionTypeScoringRuleSchema,
		isSystem: z.boolean().default(false),
		isActive: z.boolean().default(true),
	})
	.superRefine((value, ctx) => {
		if (!isMistakeMetricAllowedForTemplate(value.uiTemplate, value.scoringRule.mistakeMetric)) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['scoringRule', 'mistakeMetric'],
				message: `Метрика ${value.scoringRule.mistakeMetric} несовместима с шаблоном ${value.uiTemplate}`,
			})
		}

		const validation = value.validationSchema ?? null
		if (!validation) return
		if (
			typeof validation.minOptions === 'number' &&
			typeof validation.maxOptions === 'number' &&
			validation.minOptions > validation.maxOptions
		) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['validationSchema', 'minOptions'],
				message: 'minOptions не может быть больше maxOptions',
			})
		}
		if (typeof validation.exactChoiceCount === 'number') {
			if (
				typeof validation.minOptions === 'number' &&
				validation.exactChoiceCount < validation.minOptions
			) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['validationSchema', 'exactChoiceCount'],
					message: 'exactChoiceCount не может быть меньше minOptions',
				})
			}
			if (
				typeof validation.maxOptions === 'number' &&
				validation.exactChoiceCount > validation.maxOptions
			) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['validationSchema', 'exactChoiceCount'],
					message: 'exactChoiceCount не может быть больше maxOptions',
				})
			}
			if (value.uiTemplate === 'single_choice' && validation.exactChoiceCount !== 1) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['validationSchema', 'exactChoiceCount'],
					message: 'Для single_choice exactChoiceCount должен быть равен 1',
				})
			}
		}
	})

export type QuestionTypeDefinition = z.infer<typeof QuestionTypeDefinitionSchema>

type BuiltinQuestionTypeSeed = {
	key: string
	title: string
	description: string
	uiTemplate: QuestionUiTemplate
	scoringRule: QuestionTypeScoringRule
}

export const BUILTIN_QUESTION_TYPES: BuiltinQuestionTypeSeed[] = [
	{
		key: 'radio',
		title: 'Один правильный вариант',
		description: 'Один ответ из списка вариантов',
		uiTemplate: 'single_choice',
		scoringRule: { formula: 'exact_match', mistakeMetric: 'boolean_correct', correctPoints: 1 },
	},
	{
		key: 'checkbox',
		title: 'Множественный выбор',
		description: 'Выбор нескольких вариантов ответа',
		uiTemplate: 'multi_choice',
		scoringRule: {
			formula: 'one_mistake_partial',
			mistakeMetric: 'set_distance',
			correctPoints: 2,
			oneMistakePoints: 1,
		},
	},
	{
		key: 'matching',
		title: 'Сопоставление',
		description: 'Сопоставление элементов слева и справа',
		uiTemplate: 'matching',
		scoringRule: {
			formula: 'one_mistake_partial',
			mistakeMetric: 'pair_mismatch_count',
			correctPoints: 2,
			oneMistakePoints: 1,
		},
	},
	{
		key: 'short_answer',
		title: 'Краткий ответ',
		description: 'Короткая строка/число',
		uiTemplate: 'short_text',
		scoringRule: { formula: 'exact_match', mistakeMetric: 'compact_text_equal', correctPoints: 1 },
	},
	{
		key: 'sequence',
		title: 'Правильная последовательность',
		description: 'Строка из цифр в правильном порядке',
		uiTemplate: 'sequence_digits',
		scoringRule: {
			formula: 'one_mistake_partial',
			mistakeMetric: 'hamming_digits',
			correctPoints: 2,
			oneMistakePoints: 1,
		},
	},
]

export function getBuiltinQuestionTypeByKey(key: string): BuiltinQuestionTypeSeed | undefined {
	return BUILTIN_QUESTION_TYPES.find((item) => item.key === key)
}

export function defaultMistakeMetricForTemplate(template: QuestionUiTemplate): MistakeMetric {
	return ALLOWED_MISTAKE_METRICS_BY_TEMPLATE[template][0]
}

export function getAllowedMistakeMetricsForTemplate(template: QuestionUiTemplate): MistakeMetric[] {
	return ALLOWED_MISTAKE_METRICS_BY_TEMPLATE[template]
}

export function isMistakeMetricAllowedForTemplate(
	template: QuestionUiTemplate,
	metric: MistakeMetric
): boolean {
	return ALLOWED_MISTAKE_METRICS_BY_TEMPLATE[template].includes(metric)
}

export function createDefaultScoringRuleForTemplate(template: QuestionUiTemplate): QuestionTypeScoringRule {
	const metric = defaultMistakeMetricForTemplate(template)
	if (template === 'single_choice' || template === 'short_text') {
		return { formula: 'exact_match', mistakeMetric: metric, correctPoints: 1 }
	}
	return { formula: 'one_mistake_partial', mistakeMetric: metric, correctPoints: 2, oneMistakePoints: 1 }
}

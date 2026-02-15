import { z } from 'zod'

import {
	QuestionTypeScoringRuleSchema,
	createDefaultScoringRuleForTemplate,
	defaultMistakeMetricForTemplate,
	type MistakeMetric,
	type QuestionTypeScoringRule,
	type QuestionUiTemplate,
} from './question-types.js'

export const SCORING_FORMULAS = ['exact_match', 'one_mistake_partial'] as const
export type ScoringFormula = (typeof SCORING_FORMULAS)[number]

export const QUESTION_TYPES = ['radio', 'checkbox', 'matching', 'short_answer', 'sequence'] as const
export type QuestionType = (typeof QUESTION_TYPES)[number]

export const QuestionScoringRuleSchema = z
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

export type QuestionScoringRule = z.infer<typeof QuestionScoringRuleSchema>

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

export const DEFAULT_TEST_SCORING_RULES: TestScoringRules = createDefaultTestScoringRules()

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

function normalizeCompactString(value: unknown): string | null {
	if (typeof value !== 'string') return null
	const normalized = value.replace(/\s+/g, '').toLowerCase()
	return normalized.length > 0 ? normalized : null
}

function normalizeDigitsSequence(value: unknown): string | null {
	const normalized = normalizeCompactString(value)
	if (!normalized) return null
	return /^\d+$/.test(normalized) ? normalized : null
}

function normalizeStringArray(value: unknown): string[] | null {
	if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) return null
	return value
}

function isStringRecord(value: unknown): value is Record<string, string> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false
	return Object.values(value).every((item) => typeof item === 'string')
}

function countRadioMistakes(userAnswer: unknown, correctAnswer: unknown): number {
	return typeof userAnswer === 'string' && typeof correctAnswer === 'string' && userAnswer === correctAnswer ? 0 : 1
}

function countShortAnswerMistakes(userAnswer: unknown, correctAnswer: unknown): number {
	const userNormalized = normalizeCompactString(userAnswer)
	const correctNormalized = normalizeCompactString(correctAnswer)
	if (!userNormalized || !correctNormalized) return Number.MAX_SAFE_INTEGER
	return userNormalized === correctNormalized ? 0 : 1
}

function countSequenceMistakes(userAnswer: unknown, correctAnswer: unknown): number {
	const userSequence = normalizeDigitsSequence(userAnswer)
	const correctSequence = normalizeDigitsSequence(correctAnswer)
	if (!userSequence || !correctSequence) return Number.MAX_SAFE_INTEGER

	const minLength = Math.min(userSequence.length, correctSequence.length)
	let mistakes = Math.abs(userSequence.length - correctSequence.length)
	for (let i = 0; i < minLength; i++) {
		if (userSequence[i] !== correctSequence[i]) mistakes += 1
	}

	return mistakes
}

function countCheckboxMistakes(userAnswer: unknown, correctAnswer: unknown): number {
	const user = normalizeStringArray(userAnswer)
	const correct = normalizeStringArray(correctAnswer)
	if (!user || !correct) return Number.MAX_SAFE_INTEGER

	const userSet = new Set(user)
	const correctSet = new Set(correct)

	let missingCount = 0
	for (const id of correctSet) {
		if (!userSet.has(id)) missingCount += 1
	}

	let extraCount = 0
	for (const id of userSet) {
		if (!correctSet.has(id)) extraCount += 1
	}

	return Math.max(missingCount, extraCount)
}

function countMatchingMistakes(userAnswer: unknown, correctAnswer: unknown): number {
	if (!isStringRecord(userAnswer) || !isStringRecord(correctAnswer)) return Number.MAX_SAFE_INTEGER

	const correctKeys = Object.keys(correctAnswer)
	if (correctKeys.length === 0) return Number.MAX_SAFE_INTEGER

	let mistakes = 0
	for (const leftId of correctKeys) {
		if (userAnswer[leftId] !== correctAnswer[leftId]) mistakes += 1
	}

	return mistakes
}

function calculateEarnedPoints(rule: QuestionScoringRule, mistakesCount: number): number {
	if (mistakesCount === 0) return rule.correctPoints
	if (rule.formula === 'one_mistake_partial' && mistakesCount === 1) {
		return Math.min(rule.oneMistakePoints ?? 0, rule.correctPoints)
	}
	return 0
}

export type ScoreQuestionInput = {
	questionType: string
	userAnswer: unknown
	correctAnswer: unknown
	fallbackMaxPoints: number
	rules: TestScoringRules
}

export type ScoreQuestionResult = {
	maxPoints: number
	earnedPoints: number
	isCorrect: boolean
	mistakesCount: number
}

export function scoreQuestion(input: ScoreQuestionInput): ScoreQuestionResult {
	const { questionType, userAnswer, correctAnswer, fallbackMaxPoints, rules } = input

	const typeRule = QUESTION_TYPES.includes(questionType as QuestionType)
		? rules[questionType as QuestionType]
		: ({ formula: 'exact_match', correctPoints: fallbackMaxPoints } as QuestionScoringRule)

	let mistakesCount = Number.MAX_SAFE_INTEGER

	switch (questionType) {
		case 'radio':
			mistakesCount = countRadioMistakes(userAnswer, correctAnswer)
			break
		case 'checkbox':
			mistakesCount = countCheckboxMistakes(userAnswer, correctAnswer)
			break
		case 'matching':
			mistakesCount = countMatchingMistakes(userAnswer, correctAnswer)
			break
		case 'short_answer':
			mistakesCount = countShortAnswerMistakes(userAnswer, correctAnswer)
			break
		case 'sequence':
			mistakesCount = countSequenceMistakes(userAnswer, correctAnswer)
			break
		default:
			mistakesCount = countRadioMistakes(userAnswer, correctAnswer)
			break
	}

	const maxPoints = typeRule.correctPoints
	const earnedPoints = calculateEarnedPoints(typeRule, mistakesCount)

	return {
		maxPoints,
		earnedPoints,
		isCorrect: mistakesCount === 0,
		mistakesCount,
	}
}

export type RuntimeQuestionTypeConfig = {
	key: string
	title?: string | null
	uiTemplate: QuestionUiTemplate
	scoringRule?: unknown
}

type ScoreQuestionByTypeInput = {
	questionType: string
	userAnswer: unknown
	correctAnswer: unknown
	fallbackMaxPoints: number
	questionTypesMap: Record<string, RuntimeQuestionTypeConfig>
}

function scoreByMetric(metric: MistakeMetric, userAnswer: unknown, correctAnswer: unknown): number {
	switch (metric) {
		case 'set_distance':
			return countCheckboxMistakes(userAnswer, correctAnswer)
		case 'pair_mismatch_count':
			return countMatchingMistakes(userAnswer, correctAnswer)
		case 'compact_text_equal':
			return countShortAnswerMistakes(userAnswer, correctAnswer)
		case 'hamming_digits':
			return countSequenceMistakes(userAnswer, correctAnswer)
		case 'boolean_correct':
		default:
			return countRadioMistakes(userAnswer, correctAnswer)
	}
}

function clampPoints(value: number, maxPoints: number): number {
	if (!Number.isFinite(value) || value < 0) return 0
	return Math.min(value, maxPoints)
}

function scoreByRule(rule: QuestionTypeScoringRule, mistakesCount: number): number {
	if (mistakesCount === 0) return rule.correctPoints
	if (rule.formula === 'one_mistake_partial' && mistakesCount === 1) {
		return clampPoints(rule.oneMistakePoints ?? 0, rule.correctPoints)
	}
	if (rule.formula === 'tiers' && Array.isArray(rule.tiers) && rule.tiers.length > 0) {
		const sorted = [...rule.tiers].sort((a, b) => a.maxMistakes - b.maxMistakes)
		const matched = sorted.find((tier) => mistakesCount <= tier.maxMistakes)
		return clampPoints(matched?.points ?? 0, rule.correctPoints)
	}
	return 0
}

function normalizeRule(params: {
	rule: unknown
	template: QuestionUiTemplate
	fallbackMaxPoints: number
}): QuestionTypeScoringRule {
	const parsed = QuestionTypeScoringRuleSchema.safeParse(params.rule)
	if (parsed.success) return parsed.data

	const templateDefault = createDefaultScoringRuleForTemplate(params.template)
	return {
		...templateDefault,
		correctPoints:
			Number.isFinite(params.fallbackMaxPoints) && params.fallbackMaxPoints > 0
				? params.fallbackMaxPoints
				: templateDefault.correctPoints,
		mistakeMetric: defaultMistakeMetricForTemplate(params.template),
	}
}

export function scoreQuestionByType(input: ScoreQuestionByTypeInput): ScoreQuestionResult {
	const { questionType, userAnswer, correctAnswer, fallbackMaxPoints, questionTypesMap } = input
	const typeConfig = questionTypesMap[questionType]

	if (!typeConfig) {
		return {
			maxPoints: Number.isFinite(fallbackMaxPoints) ? Math.max(0, fallbackMaxPoints) : 0,
			earnedPoints: 0,
			isCorrect: false,
			mistakesCount: Number.MAX_SAFE_INTEGER,
		}
	}

	const normalizedRule = normalizeRule({
		rule: typeConfig.scoringRule,
		template: typeConfig.uiTemplate,
		fallbackMaxPoints,
	})
	const mistakesCount = scoreByMetric(normalizedRule.mistakeMetric, userAnswer, correctAnswer)
	const earnedPoints = scoreByRule(normalizedRule, mistakesCount)

	return {
		maxPoints: normalizedRule.correctPoints,
		earnedPoints,
		isCorrect: mistakesCount === 0,
		mistakesCount,
	}
}

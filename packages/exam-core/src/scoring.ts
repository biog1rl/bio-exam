import { TEMPLATE_ADAPTERS } from './adapters/index'
import { MISTAKES_UNSCORABLE, type QuestionContent, type QuestionVerdicts } from './adapters/types'
import type { AnswerValue } from './attempt-result'
import {
	QuestionTypeScoringRuleSchema,
	createDefaultScoringRuleForTemplate,
	defaultMistakeMetricForTemplate,
	templateForMetric,
	type MistakeMetric,
	type QuestionTypeScoringRule,
	type QuestionUiTemplate,
} from './registry'
import { computeVerdicts, readKey } from './review'

export { MISTAKES_UNSCORABLE }

export type ScoreQuestionResult = {
	maxPoints: number
	earnedPoints: number
	isCorrect: boolean
	mistakesCount: number
}

export type RuntimeQuestionTypeConfig = {
	key: string
	title?: string | null
	uiTemplate: QuestionUiTemplate
	scoringRule?: unknown
}

export type ScoreQuestionByTypeInput = {
	questionType: string
	userAnswer: unknown
	correctAnswer: unknown
	fallbackMaxPoints: number
	questionTypesMap: Record<string, RuntimeQuestionTypeConfig>
}

export function countMistakes(metric: MistakeMetric, userAnswer: unknown, correctAnswer: unknown): number {
	return TEMPLATE_ADAPTERS[templateForMetric(metric)].countMistakes(metric, userAnswer, correctAnswer)
}

function clampPoints(value: number, maxPoints: number): number {
	if (!Number.isFinite(value) || value < 0) return 0
	return Math.min(value, maxPoints)
}

export function scoreByRule(rule: QuestionTypeScoringRule, mistakesCount: number): number {
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

export function normalizeScoringRule(params: {
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
			mistakesCount: MISTAKES_UNSCORABLE,
		}
	}

	const normalizedRule = normalizeScoringRule({
		rule: typeConfig.scoringRule,
		template: typeConfig.uiTemplate,
		fallbackMaxPoints,
	})
	const mistakesCount = countMistakes(normalizedRule.mistakeMetric, userAnswer, correctAnswer)
	const earnedPoints = scoreByRule(normalizedRule, mistakesCount)

	return {
		maxPoints: normalizedRule.correctPoints,
		earnedPoints,
		isCorrect: mistakesCount === 0,
		mistakesCount,
	}
}

export type ScoreQuestionFactsInput = {
	typeConfig: RuntimeQuestionTypeConfig
	rawKey: unknown
	userAnswer: unknown
	fallbackMaxPoints: number
	content: QuestionContent
}

export type ScoreQuestionFactsResult = {
	template: QuestionUiTemplate
	metric: MistakeMetric
	points: number
	earnedPoints: number
	isCorrect: boolean
	mistakes: number | null
	key: AnswerValue | null
	verdicts: QuestionVerdicts | null
}

export function scoreQuestionFacts(input: ScoreQuestionFactsInput): ScoreQuestionFactsResult {
	const { typeConfig, rawKey, userAnswer, fallbackMaxPoints, content } = input
	const template = typeConfig.uiTemplate
	const metric = normalizeScoringRule({ rule: typeConfig.scoringRule, template, fallbackMaxPoints }).mistakeMetric
	const score = scoreQuestionByType({
		questionType: typeConfig.key,
		userAnswer,
		correctAnswer: rawKey,
		fallbackMaxPoints,
		questionTypesMap: { [typeConfig.key]: typeConfig },
	})
	const base = {
		template,
		metric,
		points: score.maxPoints,
		earnedPoints: score.earnedPoints,
		isCorrect: score.isCorrect,
	}
	if (rawKey == null) return { ...base, mistakes: null, key: null, verdicts: null }
	const verdicts = computeVerdicts({ template, metric, key: rawKey, answer: userAnswer, content })
	return {
		...base,
		mistakes: verdicts.mistakes,
		key: readKey({ template, metric, raw: rawKey }),
		verdicts,
	}
}

import { z } from 'zod'

import { AUTHORING_MESSAGES } from '../authoring-messages'
import { normalizeCompactString, normalizeIdValue } from '../normalize'
import { ALLOWED_MISTAKE_METRICS_BY_TEMPLATE } from '../registry'
import { MISTAKES_UNSCORABLE, type TemplateAdapter } from './types'
import { resolveMistakes } from './verdicts'

function countEqualMistakes(userAnswer: unknown, correctAnswer: unknown): number {
	const userNormalized = shortTextAdapter.normalizeAnswer(userAnswer)
	const correctNormalized = normalizeCompactString(correctAnswer)
	if (!userNormalized || !correctNormalized) return MISTAKES_UNSCORABLE
	return userNormalized === correctNormalized ? 0 : 1
}

function countInSetMistakes(userAnswer: unknown, correctAnswer: unknown): number {
	const userNormalized = shortTextAdapter.normalizeAnswer(userAnswer)
	if (!userNormalized || !Array.isArray(correctAnswer)) return MISTAKES_UNSCORABLE

	const correctVariants = correctAnswer
		.map((answer) => normalizeCompactString(answer))
		.filter((answer): answer is string => answer != null)
	if (correctVariants.length === 0) return MISTAKES_UNSCORABLE

	return correctVariants.includes(userNormalized) ? 0 : 1
}

function validateVariants(key: unknown): string | null {
	if (!Array.isArray(key) || key.length < 2) return AUTHORING_MESSAGES.shortTextVariantsTooFew
	if (key.some((variant) => typeof variant !== 'string' || variant.trim().length === 0)) {
		return AUTHORING_MESSAGES.shortTextVariantEmpty
	}
	const normalized = key.map((variant) => normalizeCompactString(variant))
	if (new Set(normalized).size !== normalized.length) return AUTHORING_MESSAGES.shortTextVariantsDuplicate
	return null
}

export const shortTextAdapter: TemplateAdapter<string> = {
	template: 'short_text',
	metrics: ALLOWED_MISTAKE_METRICS_BY_TEMPLATE.short_text,
	answerSchema: z.string(),
	normalizeAnswer: normalizeCompactString,
	countMistakes(metric, userAnswer, correctAnswer) {
		if (metric === 'compact_text_in_set') return countInSetMistakes(userAnswer, correctAnswer)
		return countEqualMistakes(userAnswer, correctAnswer)
	},
	verdicts({ metric, key, answer }) {
		const counted = shortTextAdapter.countMistakes(metric, answer, key)
		const verdicts = {
			template: 'short_text' as const,
			parts: [{ kind: counted === 0 ? 'correct' : 'wrong' } as const],
		}
		return { ...verdicts, mistakes: resolveMistakes(counted, verdicts) }
	},
	isAnswered(answer) {
		return typeof answer === 'string' && answer.trim().length > 0
	},
	readKey(raw, metric) {
		if (metric === 'compact_text_equal') return normalizeIdValue(raw)
		if (metric !== 'compact_text_in_set' || !Array.isArray(raw)) return null
		return raw.map((item) => normalizeIdValue(item)).filter((item): item is string => item != null)
	},
	validateAuthoring({ config, key }) {
		if (config.mistakeMetric === 'compact_text_in_set') return validateVariants(key)
		if (typeof key !== 'string' || key.trim().length === 0) return AUTHORING_MESSAGES.shortTextKeyMissing
		return null
	},
	keyShape(metric) {
		return metric === 'compact_text_in_set' ? 'text_variants' : 'text'
	},
}

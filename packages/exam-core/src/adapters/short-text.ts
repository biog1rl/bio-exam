import { z } from 'zod'

import { normalizeCompactString } from '../normalize'
import { ALLOWED_MISTAKE_METRICS_BY_TEMPLATE } from '../registry'
import { MISTAKES_UNSCORABLE, type TemplateAdapter } from './types'

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

export const shortTextAdapter: TemplateAdapter<string> = {
	template: 'short_text',
	metrics: ALLOWED_MISTAKE_METRICS_BY_TEMPLATE.short_text,
	answerSchema: z.string(),
	normalizeAnswer: normalizeCompactString,
	countMistakes(metric, userAnswer, correctAnswer) {
		if (metric === 'compact_text_in_set') return countInSetMistakes(userAnswer, correctAnswer)
		return countEqualMistakes(userAnswer, correctAnswer)
	},
}

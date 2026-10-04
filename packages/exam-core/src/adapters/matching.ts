import { z } from 'zod'

import { normalizeIdRecord } from '../normalize'
import { ALLOWED_MISTAKE_METRICS_BY_TEMPLATE } from '../registry'
import { MISTAKES_UNSCORABLE, type TemplateAdapter } from './types'

export const matchingAdapter: TemplateAdapter<Record<string, string>> = {
	template: 'matching',
	metrics: ALLOWED_MISTAKE_METRICS_BY_TEMPLATE.matching,
	answerSchema: z.record(z.string(), z.string()),
	normalizeAnswer: normalizeIdRecord,
	countMistakes(_metric, userAnswer, correctAnswer) {
		const normalizedUser = matchingAdapter.normalizeAnswer(userAnswer)
		const normalizedCorrect = normalizeIdRecord(correctAnswer)
		if (!normalizedUser || !normalizedCorrect) return MISTAKES_UNSCORABLE

		const correctKeys = Object.keys(normalizedCorrect)
		if (correctKeys.length === 0) return MISTAKES_UNSCORABLE

		let mistakes = 0
		for (const leftId of correctKeys) {
			if (normalizedUser[leftId] !== normalizedCorrect[leftId]) mistakes += 1
		}

		return mistakes
	},
}

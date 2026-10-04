import { z } from 'zod'

import { normalizeIdValue } from '../normalize'
import { ALLOWED_MISTAKE_METRICS_BY_TEMPLATE } from '../registry'
import type { TemplateAdapter } from './types'

export const singleChoiceAdapter: TemplateAdapter<string> = {
	template: 'single_choice',
	metrics: ALLOWED_MISTAKE_METRICS_BY_TEMPLATE.single_choice,
	answerSchema: z.string(),
	normalizeAnswer: normalizeIdValue,
	countMistakes(_metric, userAnswer, correctAnswer) {
		const userNormalized = singleChoiceAdapter.normalizeAnswer(userAnswer)
		const correctNormalized = normalizeIdValue(correctAnswer)
		return userNormalized != null && correctNormalized != null && userNormalized === correctNormalized ? 0 : 1
	},
}

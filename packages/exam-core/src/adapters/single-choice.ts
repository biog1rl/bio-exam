import { z } from 'zod'

import { normalizeIdValue } from '../normalize'
import { ALLOWED_MISTAKE_METRICS_BY_TEMPLATE } from '../registry'
import type { TemplateAdapter } from './types'
import { choiceOptionVerdicts, resolveMistakes } from './verdicts'

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
	verdicts({ metric, key, answer, content }) {
		const selected = singleChoiceAdapter.normalizeAnswer(answer)
		const correct = singleChoiceAdapter.readKey(key, metric)
		const parts = choiceOptionVerdicts(
			selected == null ? [] : [selected],
			typeof correct === 'string' ? [correct] : null,
			content
		)
		const verdicts = { template: 'single_choice' as const, parts }
		return {
			...verdicts,
			mistakes: resolveMistakes(singleChoiceAdapter.countMistakes(metric, answer, key), verdicts),
		}
	},
	isAnswered(answer) {
		return typeof answer === 'string' && answer.length > 0
	},
	readKey(raw, metric) {
		if (metric !== 'boolean_correct') return null
		return normalizeIdValue(raw)
	},
}

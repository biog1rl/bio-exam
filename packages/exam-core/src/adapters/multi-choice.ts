import { z } from 'zod'

import { normalizeIdArray } from '../normalize'
import { ALLOWED_MISTAKE_METRICS_BY_TEMPLATE } from '../registry'
import { MISTAKES_UNSCORABLE, type TemplateAdapter } from './types'
import { choiceOptionVerdicts, resolveMistakes } from './verdicts'

export const multiChoiceAdapter: TemplateAdapter<string[]> = {
	template: 'multi_choice',
	metrics: ALLOWED_MISTAKE_METRICS_BY_TEMPLATE.multi_choice,
	answerSchema: z.array(z.string()),
	normalizeAnswer: normalizeIdArray,
	countMistakes(_metric, userAnswer, correctAnswer) {
		const user = multiChoiceAdapter.normalizeAnswer(userAnswer)
		const correct = normalizeIdArray(correctAnswer)
		if (!user || !correct) return MISTAKES_UNSCORABLE

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
	},
	verdicts({ metric, key, answer, content }) {
		const selected = multiChoiceAdapter.normalizeAnswer(answer) ?? []
		const correct = multiChoiceAdapter.readKey(key, metric)
		const parts = choiceOptionVerdicts(selected, Array.isArray(correct) ? correct : null, content)
		const verdicts = { template: 'multi_choice' as const, parts }
		return {
			...verdicts,
			mistakes: resolveMistakes(multiChoiceAdapter.countMistakes(metric, answer, key), verdicts),
		}
	},
	isAnswered(answer) {
		return Array.isArray(answer) && answer.length > 0
	},
	readKey(raw, metric) {
		if (metric !== 'set_distance') return null
		return normalizeIdArray(raw)
	},
}

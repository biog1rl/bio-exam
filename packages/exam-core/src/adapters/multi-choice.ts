import { z } from 'zod'

import { AUTHORING_MESSAGES, exactChoiceCountMessage } from '../authoring-messages'
import { normalizeIdArray } from '../normalize'
import { ALLOWED_MISTAKE_METRICS_BY_TEMPLATE } from '../registry'
import { validateChoiceOptions } from './authoring-rules'
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
	validateAuthoring({ config, content, key }) {
		const checked = validateChoiceOptions(content.options, config.validationSchema)
		if ('error' in checked) return checked.error
		if (!Array.isArray(key) || key.length === 0 || key.some((item) => typeof item !== 'string')) {
			return AUTHORING_MESSAGES.multiKeyMissing
		}
		const selected = key as string[]
		if (selected.some((item) => !checked.optionIds.includes(item)) || new Set(selected).size !== selected.length) {
			return AUTHORING_MESSAGES.multiKeyUnknown
		}
		const exactChoiceCount = config.validationSchema?.exactChoiceCount
		if (typeof exactChoiceCount === 'number' && selected.length !== exactChoiceCount) {
			return exactChoiceCountMessage(exactChoiceCount)
		}
		return null
	},
	keyShape() {
		return 'option_ids'
	},
}

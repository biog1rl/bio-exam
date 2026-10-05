import { z } from 'zod'

import { ALLOWED_MISTAKE_METRICS_BY_TEMPLATE } from '../registry'
import { MISTAKES_UNSCORABLE, type TemplateAdapter } from './types'

const OPEN_HAS_OPTIONS_MESSAGE = 'У открытого вопроса не бывает вариантов ответа'

export const openAdapter: TemplateAdapter<string> = {
	template: 'open',
	metrics: ALLOWED_MISTAKE_METRICS_BY_TEMPLATE.open,
	answerSchema: z.string(),
	normalizeAnswer(answer) {
		return typeof answer === 'string' ? answer : null
	},
	countMistakes() {
		return MISTAKES_UNSCORABLE
	},
	verdicts() {
		throw new Error('Открытый вопрос проверяет учитель, разбор по ключу недоступен')
	},
	isAnswered(answer) {
		return typeof answer === 'string' && answer.trim().length > 0
	},
	readKey() {
		return null
	},
	validateAuthoring({ content }) {
		const hasOptions = (content.options?.length ?? 0) > 0
		const hasPairs = (content.matchingPairs?.left.length ?? 0) + (content.matchingPairs?.right.length ?? 0) > 0
		return hasOptions || hasPairs ? OPEN_HAS_OPTIONS_MESSAGE : null
	},
	keyShape() {
		return 'none'
	},
}

import { getTemplateAdapter } from './adapters/index'
import type { QuestionContent, QuestionVerdicts } from './adapters/types'
import { resolveMistakes } from './adapters/verdicts'
import type { AnswerValue } from './attempt-result'
import {
	defaultMistakeMetricForTemplate,
	isMistakeMetricAllowedForTemplate,
	type MistakeMetric,
	type QuestionUiTemplate,
} from './registry'
import { countMistakes } from './scoring'

export { allPartsCorrect, errorUnits } from './adapters/verdicts'

export type ComputeVerdictsInput = {
	template: QuestionUiTemplate
	metric?: MistakeMetric
	key: unknown
	answer: unknown
	content?: QuestionContent | null
}

export function computeVerdicts(input: ComputeVerdictsInput): QuestionVerdicts {
	const metric = input.metric ?? defaultMistakeMetricForTemplate(input.template)
	const verdicts = getTemplateAdapter(input.template).verdicts({
		metric,
		key: input.key,
		answer: input.answer,
		content: input.content ?? {},
	})
	return { ...verdicts, mistakes: resolveMistakes(countMistakes(metric, input.answer, input.key), verdicts) }
}

export function isAnswered(input: {
	template: QuestionUiTemplate | null | undefined
	answer: unknown
	content?: QuestionContent | null
}): boolean {
	if (!input.template) return false
	return getTemplateAdapter(input.template).isAnswered(input.answer, input.content ?? {})
}

export function readKey(input: {
	template: QuestionUiTemplate
	metric: MistakeMetric
	raw: unknown
}): AnswerValue | null {
	if (!isMistakeMetricAllowedForTemplate(input.template, input.metric)) return null
	return getTemplateAdapter(input.template).readKey(input.raw, input.metric)
}

function isIdLike(value: unknown): value is string | number {
	return typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))
}

export function normalizeKeyValue(raw: unknown): AnswerValue {
	if (isIdLike(raw)) return String(raw)
	if (Array.isArray(raw)) return raw.every(isIdLike) ? raw.map((item) => String(item)) : ''
	if (raw && typeof raw === 'object') {
		const entries = Object.entries(raw).filter((entry): entry is [string, string | number] => isIdLike(entry[1]))
		return Object.fromEntries(entries.map(([leftId, value]) => [leftId, String(value)]))
	}
	return ''
}

export function answerIdList(value: unknown): string[] {
	if (Array.isArray(value)) return value.filter(isIdLike).map((item) => String(item))
	return isIdLike(value) ? [String(value)] : []
}

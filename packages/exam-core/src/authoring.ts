import { TEMPLATE_ADAPTERS } from './adapters/index'
import type { KeyShape, QuestionContent, TemplateConfig } from './adapters/types'
import { AUTHORING_MESSAGES } from './authoring-messages'
import type { QuestionUiTemplate } from './registry'

export { AUTHORING_MESSAGES, exactChoiceCountMessage, maxOptionsMessage, minOptionsMessage } from './authoring-messages'

export type ValidateQuestionForSaveInput = {
	config: TemplateConfig | null
	promptText: string
	content: QuestionContent | null | undefined
	key: unknown
}

function adapterFor(config: TemplateConfig | null) {
	if (!config || !Object.hasOwn(TEMPLATE_ADAPTERS, config.uiTemplate)) return null
	return TEMPLATE_ADAPTERS[config.uiTemplate]
}

export function validateQuestionForSave({
	config,
	promptText,
	content,
	key,
}: ValidateQuestionForSaveInput): string | null {
	const adapter = adapterFor(config)
	if (!config || !adapter) return AUTHORING_MESSAGES.typeNotConfigured
	if (typeof promptText !== 'string' || promptText.trim().length === 0) return AUTHORING_MESSAGES.promptEmpty
	return adapter.validateAuthoring({ config, content: content ?? {}, key })
}

export function keyShapeFor(config: TemplateConfig): KeyShape {
	const adapter = adapterFor(config)
	if (!adapter) throw new Error(`Неизвестный шаблон вопроса: ${String(config?.uiTemplate)}`)
	return adapter.keyShape(config.mistakeMetric)
}

export function toCanonicalKey({ uiTemplate, key }: { uiTemplate: QuestionUiTemplate; key: unknown }): unknown {
	if (uiTemplate !== 'short_text' && uiTemplate !== 'sequence_digits') return key
	const text = typeof key === 'number' && Number.isFinite(key) ? String(key) : key
	if (uiTemplate === 'sequence_digits' && typeof text === 'string') return text.replace(/\s+/g, '')
	return text
}

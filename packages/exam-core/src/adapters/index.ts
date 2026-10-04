import type { QuestionUiTemplate } from '../registry'
import { matchingAdapter } from './matching'
import { multiChoiceAdapter } from './multi-choice'
import { sequenceDigitsAdapter } from './sequence-digits'
import { shortTextAdapter } from './short-text'
import { singleChoiceAdapter } from './single-choice'
import type { TemplateAdapter } from './types'

export const TEMPLATE_ADAPTERS: Record<QuestionUiTemplate, TemplateAdapter> = {
	single_choice: singleChoiceAdapter,
	multi_choice: multiChoiceAdapter,
	matching: matchingAdapter,
	short_text: shortTextAdapter,
	sequence_digits: sequenceDigitsAdapter,
}

export function getTemplateAdapter(template: QuestionUiTemplate): TemplateAdapter {
	return TEMPLATE_ADAPTERS[template]
}

export { matchingAdapter, multiChoiceAdapter, sequenceDigitsAdapter, shortTextAdapter, singleChoiceAdapter }
export type { TemplateAdapter } from './types'

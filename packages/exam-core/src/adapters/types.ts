import type { z } from 'zod'

import type { AnswerValue } from '../attempt-result'
import type { MistakeMetric, QuestionUiTemplate } from '../registry'

export const MISTAKES_UNSCORABLE = Number.MAX_SAFE_INTEGER

export interface TemplateAdapter<TAnswer extends AnswerValue = AnswerValue> {
	template: QuestionUiTemplate
	metrics: readonly MistakeMetric[]
	answerSchema: z.ZodType<TAnswer>
	normalizeAnswer(answer: unknown): TAnswer | null
	countMistakes(metric: MistakeMetric, userAnswer: unknown, correctAnswer: unknown): number
}

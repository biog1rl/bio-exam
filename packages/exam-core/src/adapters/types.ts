import type { z } from 'zod'

import type { AnswerValue } from '../attempt-result'
import type { MistakeMetric, QuestionUiTemplate } from '../registry'

export const MISTAKES_UNSCORABLE = Number.MAX_SAFE_INTEGER

export type QuestionContentItem = { id: string; text: string }

export type QuestionContent = {
	options?: ReadonlyArray<QuestionContentItem> | null
	matchingPairs?: {
		left: ReadonlyArray<QuestionContentItem>
		right: ReadonlyArray<QuestionContentItem>
	} | null
}

export type SequencePositionVerdict = {
	position: number
	kind: 'correct' | 'wrong' | 'missing' | 'extra' | 'swapped'
	given: string | null
	expected: string | null
}

export type ChoiceOptionVerdict = {
	optionId: string
	kind: 'selected_correct' | 'selected_wrong' | 'missed' | 'neutral'
}

export type MatchingPairVerdict = {
	leftId: string
	kind: 'correct' | 'wrong'
	given: string | null
	expected: string | null
}

export type ShortTextVerdict = {
	kind: 'correct' | 'wrong'
}

export type QuestionVerdicts =
	| { template: 'single_choice'; mistakes: number; parts: ChoiceOptionVerdict[] }
	| { template: 'multi_choice'; mistakes: number; parts: ChoiceOptionVerdict[] }
	| { template: 'matching'; mistakes: number; parts: MatchingPairVerdict[] }
	| { template: 'short_text'; mistakes: number; parts: ShortTextVerdict[] }
	| { template: 'sequence_digits'; mistakes: number; parts: SequencePositionVerdict[] }

export type VerdictsInput = {
	metric: MistakeMetric
	key: unknown
	answer: unknown
	content: QuestionContent
}

export interface TemplateAdapter<TAnswer extends AnswerValue = AnswerValue> {
	template: QuestionUiTemplate
	metrics: readonly MistakeMetric[]
	answerSchema: z.ZodType<TAnswer>
	normalizeAnswer(answer: unknown): TAnswer | null
	countMistakes(metric: MistakeMetric, userAnswer: unknown, correctAnswer: unknown): number
	verdicts(input: VerdictsInput): QuestionVerdicts
	isAnswered(answer: unknown, content: QuestionContent): boolean
	readKey(raw: unknown, metric: MistakeMetric): AnswerValue | null
}

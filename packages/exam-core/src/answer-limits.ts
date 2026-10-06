import { TEMPLATE_ADAPTERS } from './adapters'
import type { QuestionUiTemplate } from './registry'

export const SHORT_TEXT_MAX_LENGTH = 200
export const OPEN_TEXT_MAX_LENGTH = 5000
export const ANSWER_ITEM_MAX_LENGTH = 200
export const ANSWER_ITEMS_MAX = 50

export const ANSWER_VIOLATION_REASONS = [
	'foreign_question',
	'unknown_question_type',
	'short_text_too_long',
	'open_text_too_long',
	'answer_shape_invalid',
] as const

export type AnswerViolationReason = (typeof ANSWER_VIOLATION_REASONS)[number]

export type AnswerViolation = {
	reason: AnswerViolationReason
	questionId: string
	limit?: number
}

type TextLimit = { reason: 'short_text_too_long' | 'open_text_too_long'; limit: number }

const TEXT_LIMITS: Partial<Record<QuestionUiTemplate, TextLimit>> = {
	short_text: { reason: 'short_text_too_long', limit: SHORT_TEXT_MAX_LENGTH },
	sequence_digits: { reason: 'short_text_too_long', limit: SHORT_TEXT_MAX_LENGTH },
	open: { reason: 'open_text_too_long', limit: OPEN_TEXT_MAX_LENGTH },
}

function answerItems(value: unknown): string[] {
	if (typeof value === 'string') return [value]
	if (Array.isArray(value)) return value
	return Object.entries(value as Record<string, string>).flat()
}

function fitsItemLimits(value: unknown): boolean {
	const items = answerItems(value)
	const count = Array.isArray(value) ? items.length : items.length / 2
	return count <= ANSWER_ITEMS_MAX && items.every((item) => item.length <= ANSWER_ITEM_MAX_LENGTH)
}

function violationOf(questionId: string, template: QuestionUiTemplate, value: unknown): AnswerViolation | null {
	if (value === null || value === undefined) return null
	if (!TEMPLATE_ADAPTERS[template].answerSchema.safeParse(value).success) {
		return { reason: 'answer_shape_invalid', questionId }
	}
	const textLimit = TEXT_LIMITS[template]
	if (textLimit) {
		return (value as string).length > textLimit.limit
			? { reason: textLimit.reason, questionId, limit: textLimit.limit }
			: null
	}
	return fitsItemLimits(value) ? null : { reason: 'answer_shape_invalid', questionId }
}

export function findAnswerViolation(input: {
	answers: Readonly<Record<string, unknown>>
	questions: ReadonlyArray<{ id: string; template: QuestionUiTemplate | null }>
}): AnswerViolation | null {
	const templates = new Map<string, QuestionUiTemplate>()

	for (const question of input.questions) {
		if (question.template === null) return { reason: 'unknown_question_type', questionId: question.id }
		templates.set(question.id, question.template)
	}

	for (const [questionId, value] of Object.entries(input.answers)) {
		const template = templates.get(questionId)
		if (template === undefined) return { reason: 'foreign_question', questionId }
		const violation = violationOf(questionId, template, value)
		if (violation) return violation
	}

	return null
}

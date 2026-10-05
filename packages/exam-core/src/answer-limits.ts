import type { QuestionUiTemplate } from './registry'

export const SHORT_TEXT_MAX_LENGTH = 200
export const OPEN_TEXT_MAX_LENGTH = 5000

export const ANSWER_VIOLATION_REASONS = [
	'foreign_question',
	'unknown_question_type',
	'short_text_too_long',
	'open_text_too_long',
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
		const textLimit = TEXT_LIMITS[template]
		if (textLimit && typeof value === 'string' && value.length > textLimit.limit) {
			return { reason: textLimit.reason, questionId, limit: textLimit.limit }
		}
	}

	return null
}

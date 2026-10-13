import { validateQuestion } from '../../question-validation'
import type { Question, QuestionDraft, QuestionTypeDefinition } from '../../types'

export function resolveQuestionDraftId(data: unknown): string | null {
	if (!data || typeof data !== 'object') return null
	const candidate = data as {
		draftId?: string
		id?: string
		draft?: { id?: string }
	}
	return candidate.draftId ?? candidate.id ?? candidate.draft?.id ?? null
}

export function resolveQuestionDraftLabel(draft: QuestionDraft): string {
	const payload = draft.payload
	const questionValue = payload && typeof payload === 'object' ? (payload as { question?: unknown }).question : null
	if (!questionValue || typeof questionValue !== 'object') return 'Черновик вопроса'
	const promptRaw = (questionValue as { promptText?: unknown }).promptText
	const prompt = typeof promptRaw === 'string' ? promptRaw.trim() : ''
	if (!prompt) return 'Черновик вопроса'
	const singleLine = prompt.replace(/\s+/g, ' ')
	return singleLine.slice(0, 64) + (singleLine.length > 64 ? '...' : '')
}

export function getCreateQuestionsValidationError(
	questions: Question[],
	questionTypes: QuestionTypeDefinition[] | undefined
): string | null {
	for (let i = 0; i < questions.length; i++) {
		const error = validateQuestion(questions[i], questionTypes)
		if (error) {
			return `Вопрос ${i + 1}: ${error.charAt(0).toLowerCase()}${error.slice(1)}`
		}
	}
	return null
}

import { validateQuestion } from '../../question-validation'
import type { Question, QuestionDraft, QuestionTypeDefinition, TestFormData } from '../../types'
import { normalizeQuestionForSave } from '../../types'

export function createInitialTestForm(): TestFormData {
	return {
		topicId: '',
		title: '',
		slug: '',
		description: '',
		isPublished: false,
		showCorrectAnswer: true,
		timeLimitMinutes: null,
		redThresholdMinutes: null,
		warningThresholdMinutes: null,
		passingScore: null,
		order: 0,
		questions: [],
	}
}

export function normalizeFormPayload(payload: TestFormData): TestFormData {
	return {
		...payload,
		questions: payload.questions.map((question) => normalizeQuestionForSave(question)),
	}
}

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

export function getBaseValidationError(form: Pick<TestFormData, 'topicId' | 'title' | 'slug'>): string | null {
	if (!form.topicId) return 'Выберите тему'
	if (!form.title) return 'Введите название теста'
	if (!form.slug) return 'Введите slug'
	if (form.slug.length < 2 || form.slug.length > 100 || !/^[a-z0-9-]+$/.test(form.slug)) {
		return 'Slug: только латинские буквы, цифры и дефисы (2-100 символов)'
	}
	return null
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

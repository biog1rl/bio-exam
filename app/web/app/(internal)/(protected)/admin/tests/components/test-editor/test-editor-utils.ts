import type { Question, QuestionDraft, TestFormData } from '../../types'
import {
	isValidSequenceCorrectValue,
	normalizeQuestionForSave,
	normalizeShortTextCorrectValue,
	resolveQuestionTemplate,
} from '../../types'

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

export function getCreateQuestionsValidationError(questions: Question[]): string | null {
	for (let i = 0; i < questions.length; i++) {
		const q = questions[i]
		const template = resolveQuestionTemplate(q)
		if (!template) {
			return `Вопрос ${i + 1}: тип вопроса не настроен в БД`
		}
		if (!q.promptText.trim()) {
			return `Вопрос ${i + 1}: введите текст вопроса`
		}
		if (template === 'single_choice' || template === 'multi_choice') {
			if (!q.options || q.options.length < 2) {
				return `Вопрос ${i + 1}: добавьте минимум 2 варианта ответа`
			}
			if (q.options.some((o) => !o.text.trim())) {
				return `Вопрос ${i + 1}: заполните все варианты ответа`
			}
			if (template === 'single_choice' && !q.correct) {
				return `Вопрос ${i + 1}: выберите правильный ответ`
			}
			if (template === 'multi_choice' && (!Array.isArray(q.correct) || q.correct.length === 0)) {
				return `Вопрос ${i + 1}: выберите правильные ответы`
			}
		}
		if (template === 'matching') {
			if (!q.matchingPairs || q.matchingPairs.left.length < 2 || q.matchingPairs.right.length < 2) {
				return `Вопрос ${i + 1}: добавьте минимум 2 пары для сопоставления`
			}
			if (q.matchingPairs.left.some((p) => !p.text.trim()) || q.matchingPairs.right.some((p) => !p.text.trim())) {
				return `Вопрос ${i + 1}: заполните все элементы сопоставления`
			}
			if (typeof q.correct !== 'object' || Array.isArray(q.correct) || Object.keys(q.correct).length === 0) {
				return `Вопрос ${i + 1}: укажите правильные соответствия`
			}
		}
		if (template === 'short_text') {
			const normalized = normalizeShortTextCorrectValue(q.correct)
			if (!normalized || !normalized.trim()) {
				return `Вопрос ${i + 1}: укажите правильный краткий ответ`
			}
		}
		if (template === 'sequence_digits' && !isValidSequenceCorrectValue(q.correct)) {
			return `Вопрос ${i + 1}: для последовательности используйте только цифры`
		}
	}
	return null
}

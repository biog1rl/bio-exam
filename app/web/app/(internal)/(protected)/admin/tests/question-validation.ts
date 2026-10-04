import type { Question } from './types'
import { isValidSequenceCorrectValue, normalizeShortTextCorrectValue, resolveQuestionTemplate } from './types'

export function validateQuestion(question: Question): string | null {
	const template = resolveQuestionTemplate(question)
	if (!template) {
		return 'Тип вопроса не настроен в БД'
	}

	if (!question.promptText.trim()) {
		return 'Введите текст вопроса'
	}
	if (template === 'single_choice' || template === 'multi_choice') {
		if (!question.options || question.options.length < 2) {
			return 'Добавьте минимум 2 варианта ответа'
		}
		if (question.options.some((option) => !option.text.trim())) {
			return 'Заполните все варианты ответа'
		}
		if (template === 'single_choice' && !question.correct) {
			return 'Выберите правильный ответ'
		}
		if (template === 'multi_choice' && (!Array.isArray(question.correct) || question.correct.length === 0)) {
			return 'Выберите правильные ответы'
		}
	}
	if (template === 'matching') {
		if (!question.matchingPairs || question.matchingPairs.left.length < 2 || question.matchingPairs.right.length < 2) {
			return 'Добавьте минимум 2 пары для сопоставления'
		}
		if (
			question.matchingPairs.left.some((pair) => !pair.text.trim()) ||
			question.matchingPairs.right.some((pair) => !pair.text.trim())
		) {
			return 'Заполните все элементы сопоставления'
		}
		if (
			typeof question.correct !== 'object' ||
			Array.isArray(question.correct) ||
			Object.keys(question.correct).length === 0
		) {
			return 'Укажите правильные соответствия'
		}
	}
	if (template === 'short_text') {
		const normalized = normalizeShortTextCorrectValue(question.correct)
		if (!normalized || !normalized.trim()) {
			return 'Укажите правильный краткий ответ'
		}
	}
	if (template === 'sequence_digits') {
		if (!isValidSequenceCorrectValue(question.correct)) {
			return 'Для последовательности используйте только цифры без пробелов'
		}
	}
	return null
}

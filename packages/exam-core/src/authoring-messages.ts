import { pluralRu } from './plural'

export const AUTHORING_MESSAGES = Object.freeze({
	typeNotConfigured: 'Тип вопроса не настроен в БД',
	promptEmpty: 'Введите текст вопроса',
	choiceOptionEmpty: 'Заполните все варианты ответа',
	choiceIdsInvalid: 'Варианты ответа должны иметь уникальные id',
	singleKeyMissing: 'Выберите правильный ответ',
	multiKeyMissing: 'Выберите правильные ответы',
	multiKeyUnknown: 'Выберите правильные ответы из списка вариантов',
	matchingTooFew: 'Добавьте минимум 2 пары для сопоставления',
	matchingItemEmpty: 'Заполните все элементы сопоставления',
	matchingIdsInvalid: 'Элементы сопоставления должны иметь уникальные id',
	matchingKeyMissing: 'Укажите правильные соответствия',
	shortTextKeyMissing: 'Укажите правильный краткий ответ',
	shortTextVariantsTooFew: 'Укажите минимум два допустимых ответа',
	shortTextVariantEmpty: 'Заполните все допустимые ответы',
	shortTextVariantsDuplicate: 'Допустимые ответы не должны повторяться',
	sequenceDigitsOnly: 'Для последовательности используйте только цифры без пробелов',
} as const)

export function minOptionsMessage(n: number): string {
	return `Добавьте минимум ${n} ${pluralRu(n, ['вариант', 'варианта', 'вариантов'])} ответа`
}

export function maxOptionsMessage(n: number): string {
	return `Не более ${n} ${pluralRu(n, ['варианта', 'вариантов', 'вариантов'])} ответа`
}

export function exactChoiceCountMessage(n: number): string {
	return `Отметьте ровно ${n} ${pluralRu(n, ['правильный ответ', 'правильных ответа', 'правильных ответов'])}`
}

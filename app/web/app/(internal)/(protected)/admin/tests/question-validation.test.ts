import { getBuiltinQuestionTypeByKey } from '@bio-exam/exam-core'

import assert from 'node:assert/strict'
import { test } from 'vitest'

import { getCreateQuestionsValidationError } from './components/test-editor/test-editor-utils'
import { validateQuestion } from './question-validation'
import type { Question, QuestionTypeDefinition } from './types'

function typeOf(key: string): QuestionTypeDefinition {
	const builtin = getBuiltinQuestionTypeByKey(key)
	if (!builtin) throw new Error(`Нет встроенного типа ${key}`)
	return { ...builtin, isSystem: true, isActive: true }
}

const d5: Question = {
	type: 'short_answer_variants',
	questionUiTemplate: 'short_text',
	questionTypeTitle: 'Краткий ответ (несколько вариантов)',
	order: 0,
	points: 1,
	options: null,
	matchingPairs: null,
	promptText: 'Назовите методы',
	explanationText: null,
	correct: ['эксперимент', 'моделирование'],
}

test('D5: краткий ответ с двумя вариантами проходит проверку', () => {
	assert.equal(validateQuestion(d5, [typeOf('short_answer_variants')]), null)
})

test('D5: создание теста с кратким ответом из двух вариантов проходит проверку', () => {
	assert.equal(getCreateQuestionsValidationError([d5], [typeOf('short_answer_variants')]), null)
})

test('строковый краткий ответ проходит обе проверки', () => {
	const question: Question = { ...d5, type: 'short_answer', correct: 'эксперимент' }
	assert.equal(validateQuestion(question, [typeOf('short_answer')]), null)
	assert.equal(getCreateQuestionsValidationError([question], [typeOf('short_answer')]), null)
})

test('пустая формулировка отклоняется обеими проверками', () => {
	const question: Question = { ...d5, promptText: '  ' }
	assert.equal(validateQuestion(question, [typeOf('short_answer_variants')]), 'Введите текст вопроса')
	assert.equal(
		getCreateQuestionsValidationError([question], [typeOf('short_answer_variants')]),
		'Вопрос 1: введите текст вопроса'
	)
})

const opt = (id: string, text: string) => ({ id, text })
const choiceOptions = [opt('a', 'Первый'), opt('b', 'Второй')]
const matchingPairs = {
	left: [opt('l1', 'Левый 1'), opt('l2', 'Левый 2')],
	right: [opt('r1', 'Правый 1'), opt('r2', 'Правый 2')],
}

const base: Question = {
	type: 'radio',
	questionUiTemplate: 'single_choice',
	order: 0,
	points: 1,
	options: choiceOptions,
	matchingPairs: null,
	promptText: 'Вопрос',
	explanationText: null,
	correct: 'a',
}

const customMulti = (validationSchema: QuestionTypeDefinition['validationSchema']): QuestionTypeDefinition => ({
	...typeOf('checkbox'),
	key: 'custom_multi',
	title: 'Пользовательский множественный выбор',
	isSystem: false,
	validationSchema,
})

const fiveOptions = [
	opt('a', 'Первый'),
	opt('b', 'Второй'),
	opt('c', 'Третий'),
	opt('d', 'Четвёртый'),
	opt('e', 'Пятый'),
]

const validationTable: Array<{
	name: string
	question: Question
	types?: QuestionTypeDefinition[] | undefined
	expected: string | null
}> = [
	{
		name: 'шаблон не задан',
		question: { ...base, questionUiTemplate: null },
		types: [],
		expected: 'Тип вопроса не настроен в БД',
	},
	{
		name: 'шаблон не передан',
		question: { ...base, questionUiTemplate: undefined },
		types: [],
		expected: 'Тип вопроса не настроен в БД',
	},
	{
		name: 'список типов не загружен: проверка пропускается',
		question: { ...base, options: [opt('a', 'Первый')] },
		types: undefined,
		expected: null,
	},
	{
		name: 'список типов загружен, типа в нём нет',
		question: base,
		types: [],
		expected: 'Тип вопроса не настроен в БД',
	},
	{
		name: 'D-13: minOptions 3 и два варианта',
		question: { ...base, type: 'custom_multi', questionUiTemplate: 'multi_choice', correct: ['a'] },
		types: [customMulti({ minOptions: 3 })],
		expected: 'Добавьте минимум 3 варианта ответа',
	},
	{
		name: 'D-13: maxOptions 4 и пять вариантов',
		question: {
			...base,
			type: 'custom_multi',
			questionUiTemplate: 'multi_choice',
			options: fiveOptions,
			correct: ['a'],
		},
		types: [customMulti({ maxOptions: 4 })],
		expected: 'Не более 4 вариантов ответа',
	},
	{
		name: 'single_choice с одним вариантом',
		question: { ...base, options: [opt('a', 'Первый')] },
		expected: 'Добавьте минимум 2 варианта ответа',
	},
	{
		name: 'single_choice без списка вариантов',
		question: { ...base, options: null },
		expected: 'Добавьте минимум 2 варианта ответа',
	},
	{
		name: 'single_choice с пустым текстом варианта',
		question: { ...base, options: [opt('a', 'Первый'), opt('b', '  ')] },
		expected: 'Заполните все варианты ответа',
	},
	{ name: 'single_choice без ключа', question: { ...base, correct: '' }, expected: 'Выберите правильный ответ' },
	{ name: 'single_choice корректный', question: base, expected: null },
	{
		name: 'multi_choice с пустым ключом',
		question: { ...base, type: 'checkbox', questionUiTemplate: 'multi_choice', correct: [] },
		expected: 'Выберите правильные ответы',
	},
	{
		name: 'multi_choice с ключом-строкой',
		question: { ...base, type: 'checkbox', questionUiTemplate: 'multi_choice', correct: 'a' },
		expected: 'Выберите правильные ответы',
	},
	{
		name: 'multi_choice корректный',
		question: { ...base, type: 'checkbox', questionUiTemplate: 'multi_choice', correct: ['a', 'b'] },
		expected: null,
	},
	{
		name: 'matching с одной парой',
		question: {
			...base,
			type: 'matching',
			questionUiTemplate: 'matching',
			options: null,
			matchingPairs: { left: [opt('l1', 'Левый 1')], right: [opt('r1', 'Правый 1')] },
			correct: { l1: 'r1' },
		},
		expected: 'Добавьте минимум 2 пары для сопоставления',
	},
	{
		name: 'matching без пар',
		question: { ...base, type: 'matching', questionUiTemplate: 'matching', options: null, correct: {} },
		expected: 'Добавьте минимум 2 пары для сопоставления',
	},
	{
		name: 'matching с пустым текстом элемента',
		question: {
			...base,
			type: 'matching',
			questionUiTemplate: 'matching',
			options: null,
			matchingPairs: { left: [opt('l1', 'Левый 1'), opt('l2', ' ')], right: matchingPairs.right },
			correct: { l1: 'r1' },
		},
		expected: 'Заполните все элементы сопоставления',
	},
	{
		name: 'matching с пустым ключом',
		question: { ...base, type: 'matching', questionUiTemplate: 'matching', options: null, matchingPairs, correct: {} },
		expected: 'Укажите правильные соответствия',
	},
	{
		name: 'matching с ключом-массивом',
		question: { ...base, type: 'matching', questionUiTemplate: 'matching', options: null, matchingPairs, correct: [] },
		expected: 'Укажите правильные соответствия',
	},
	{
		name: 'matching корректный',
		question: {
			...base,
			type: 'matching',
			questionUiTemplate: 'matching',
			options: null,
			matchingPairs,
			correct: { l1: 'r1', l2: 'r2' },
		},
		expected: null,
	},
	{
		name: 'short_text с пустым ключом',
		question: { ...base, type: 'short_answer', questionUiTemplate: 'short_text', options: null, correct: '' },
		expected: 'Укажите правильный краткий ответ',
	},
	{
		name: 'short_text с ключом из пробелов',
		question: { ...base, type: 'short_answer', questionUiTemplate: 'short_text', options: null, correct: '   ' },
		expected: 'Укажите правильный краткий ответ',
	},
	{
		name: 'short_text корректный',
		question: { ...base, type: 'short_answer', questionUiTemplate: 'short_text', options: null, correct: 'ответ' },
		expected: null,
	},
	{
		name: 'sequence_digits с ключом из цифр и буквы',
		question: { ...base, type: 'sequence', questionUiTemplate: 'sequence_digits', options: null, correct: '12a4' },
		expected: 'Для последовательности используйте только цифры без пробелов',
	},
	{
		name: 'sequence_digits с пустым ключом',
		question: { ...base, type: 'sequence', questionUiTemplate: 'sequence_digits', options: null, correct: '' },
		expected: 'Для последовательности используйте только цифры без пробелов',
	},
	{
		name: 'sequence_digits корректный',
		question: { ...base, type: 'sequence', questionUiTemplate: 'sequence_digits', options: null, correct: '1234' },
		expected: null,
	},
]

for (const row of validationTable) {
	test(`validateQuestion: текст ошибки — ${row.name}`, () => {
		const types = 'types' in row ? row.types : [typeOf(row.question.type)]
		assert.equal(validateQuestion(row.question, types), row.expected)
	})
}

test('getCreateQuestionsValidationError: префикс номера вопроса и строчная первая буква', () => {
	const question: Question = { ...base, options: [opt('a', 'Первый')] }
	assert.equal(
		getCreateQuestionsValidationError([question], [typeOf('radio')]),
		'Вопрос 1: добавьте минимум 2 варианта ответа'
	)
})

test('getCreateQuestionsValidationError: список типов не загружен, проверка пропускается', () => {
	const question: Question = { ...base, options: [opt('a', 'Первый')] }
	assert.equal(getCreateQuestionsValidationError([question], undefined), null)
})

test('getCreateQuestionsValidationError: список типов загружен, типа в нём нет', () => {
	assert.equal(getCreateQuestionsValidationError([base], []), 'Вопрос 1: тип вопроса не настроен в БД')
})

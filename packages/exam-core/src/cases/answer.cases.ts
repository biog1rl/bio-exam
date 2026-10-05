import type { QuestionUiTemplate } from '../registry'

export type AnswerShapeCase = {
	name: string
	template: QuestionUiTemplate
	value: unknown
	accepted: boolean
	normalized: unknown
}

export const ANSWER_SHAPE_CASES: AnswerShapeCase[] = [
	{ name: 'single_choice: строка принимается', template: 'single_choice', value: 'b', accepted: true, normalized: 'b' },
	{
		name: 'single_choice: число отклоняется, нормализуется в строку',
		template: 'single_choice',
		value: 3,
		accepted: false,
		normalized: '3',
	},
	{
		name: 'single_choice: null отклоняется',
		template: 'single_choice',
		value: null,
		accepted: false,
		normalized: null,
	},
	{
		name: 'single_choice: форма multi_choice отклоняется',
		template: 'single_choice',
		value: ['a'],
		accepted: false,
		normalized: null,
	},
	{
		name: 'multi_choice: массив строк принимается',
		template: 'multi_choice',
		value: ['a', 'c'],
		accepted: true,
		normalized: ['a', 'c'],
	},
	{
		name: 'multi_choice: числа в массиве отклоняются, нормализуются в строки',
		template: 'multi_choice',
		value: [1, '2'],
		accepted: false,
		normalized: ['1', '2'],
	},
	{
		name: 'multi_choice: форма single_choice отклоняется',
		template: 'multi_choice',
		value: 'a',
		accepted: false,
		normalized: null,
	},
	{ name: 'multi_choice: null отклоняется', template: 'multi_choice', value: null, accepted: false, normalized: null },
	{
		name: 'matching: отображение строк принимается',
		template: 'matching',
		value: { l1: 'r1' },
		accepted: true,
		normalized: { l1: 'r1' },
	},
	{
		name: 'matching: числовое значение отклоняется, нормализуется в строку',
		template: 'matching',
		value: { l1: 1 },
		accepted: false,
		normalized: { l1: '1' },
	},
	{
		name: 'matching: форма multi_choice отклоняется',
		template: 'matching',
		value: ['r1'],
		accepted: false,
		normalized: null,
	},
	{ name: 'matching: null отклоняется', template: 'matching', value: null, accepted: false, normalized: null },
	{
		name: 'short_text: строка принимается, регистр и пробелы убираются',
		template: 'short_text',
		value: ' Ми Тоз ',
		accepted: true,
		normalized: 'митоз',
	},
	{
		name: 'short_text: пустая строка принимается, нормализуется в null',
		template: 'short_text',
		value: '',
		accepted: true,
		normalized: null,
	},
	{
		name: 'short_text: число отклоняется, нормализуется в строку',
		template: 'short_text',
		value: 3142,
		accepted: false,
		normalized: '3142',
	},
	{
		name: 'short_text: форма multi_choice отклоняется',
		template: 'short_text',
		value: ['a'],
		accepted: false,
		normalized: null,
	},
	{
		name: 'sequence_digits: строка цифр с пробелами принимается',
		template: 'sequence_digits',
		value: ' 23 14 ',
		accepted: true,
		normalized: '2314',
	},
	{
		name: 'sequence_digits: строка с нецифровым символом принимается, нормализуется в null',
		template: 'sequence_digits',
		value: '12a',
		accepted: true,
		normalized: null,
	},
	{
		name: 'sequence_digits: число отклоняется, нормализуется в строку',
		template: 'sequence_digits',
		value: 3142,
		accepted: false,
		normalized: '3142',
	},
	{
		name: 'sequence_digits: null отклоняется',
		template: 'sequence_digits',
		value: null,
		accepted: false,
		normalized: null,
	},
	{
		name: 'open: строка принимается как есть',
		template: 'open',
		value: ' Развёрнутый ответ\nв две строки ',
		accepted: true,
		normalized: ' Развёрнутый ответ\nв две строки ',
	},
	{ name: 'open: пустая строка принимается', template: 'open', value: '', accepted: true, normalized: '' },
	{ name: 'open: массив отклоняется', template: 'open', value: ['a'], accepted: false, normalized: null },
	{ name: 'open: число отклоняется', template: 'open', value: 3, accepted: false, normalized: null },
]

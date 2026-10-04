import type { KeyShape, QuestionContent, QuestionContentItem, TemplateConfig } from '../adapters/types'
import { AUTHORING_MESSAGES } from '../authoring-messages'
import { OptionSchema, QuestionKeyPayloadSchema } from '../content'
import type { QuestionTypeValidation, QuestionUiTemplate } from '../registry'

export const SERVER_AUTHORING_RULES = [
	'QuestionSchema: promptText min(1)',
	'validateByTemplate choice: не массив или меньше 2 вариантов',
	'validateByTemplate choice: id не строка',
	'validateByTemplate choice: повтор id',
	'validateOptionsCount: minOptions',
	'validateOptionsCount: maxOptions',
	'validateByTemplate single: ключ не строка или не из вариантов',
	'validateByTemplate multi: ключ не массив строк или пустой',
	'validateByTemplate multi: id не из вариантов',
	'validateByTemplate multi: повтор',
	'validateByTemplate multi: exactChoiceCount',
	'validateByTemplate matching: нет left/right',
	'validateByTemplate matching: меньше 2 слева или справа',
	'validateByTemplate matching: id не строка',
	'validateByTemplate matching: повтор id',
	'validateByTemplate matching: ключ не объект строк',
	'validateByTemplate matching: левый без правого',
	'validateByTemplate short_text in_set: меньше двух, нестроковый или пустой вариант',
	'validateByTemplate short_text in_set: повтор',
	'validateByTemplate short_text equal: не строка или пустая',
	'validateByTemplate sequence: не строка',
	'validateByTemplate sequence: не цифры',
	'QuestionSchema radio/checkbox: меньше 2 вариантов',
	'QuestionSchema radio/checkbox: повтор id',
	'QuestionSchema radio: ключ не из вариантов',
	'QuestionSchema checkbox: ключ не массив или пустой',
	'QuestionSchema checkbox: повтор',
	'QuestionSchema checkbox: id не из вариантов',
	'QuestionSchema matching: меньше 2 слева или справа',
	'QuestionSchema matching: повтор id',
	'QuestionSchema matching: ключ не объект',
	'QuestionSchema matching: левый без правого',
	'QuestionSchema short_answer: не строка или пустая',
	'QuestionSchema short_answer_variants: не массив, меньше двух или пустой вариант',
	'QuestionSchema short_answer_variants: повтор',
	'QuestionSchema sequence: не строка',
	'QuestionSchema sequence: не цифры',
] as const

export type ServerAuthoringRule = (typeof SERVER_AUTHORING_RULES)[number]

export type AuthoringCase = {
	name: string
	config: TemplateConfig | null
	promptText: string
	content: QuestionContent
	key: unknown
	expected: string | null
	serverRules?: ServerAuthoringRule[]
}

function withValidation(config: TemplateConfig, validationSchema: QuestionTypeValidation): TemplateConfig {
	return { ...config, validationSchema }
}

function options(count: number): QuestionContentItem[] {
	return Array.from({ length: count }, (_, index) => ({
		id: String.fromCharCode(97 + index),
		text: `Вариант ${index + 1}`,
	}))
}

function choice(items: QuestionContentItem[]): QuestionContent {
	return { options: items, matchingPairs: null }
}

function rawContent(value: unknown): QuestionContent {
	return value as QuestionContent
}

function pairs(left: QuestionContentItem[], right: QuestionContentItem[]): QuestionContent {
	return { options: null, matchingPairs: { left, right } }
}

function side(prefix: string, count: number): QuestionContentItem[] {
	return Array.from({ length: count }, (_, index) => ({
		id: `${prefix}${index + 1}`,
		text: `${prefix === 'l' ? 'Элемент' : 'Пара'} ${index + 1}`,
	}))
}

const SINGLE: TemplateConfig = { uiTemplate: 'single_choice', mistakeMetric: 'boolean_correct' }
const MULTI: TemplateConfig = { uiTemplate: 'multi_choice', mistakeMetric: 'set_distance' }
const MATCHING: TemplateConfig = { uiTemplate: 'matching', mistakeMetric: 'pair_mismatch_count' }
const SHORT_TEXT_IN_SET: TemplateConfig = { uiTemplate: 'short_text', mistakeMetric: 'compact_text_in_set' }
const SHORT_TEXT_EQUAL: TemplateConfig = { uiTemplate: 'short_text', mistakeMetric: 'compact_text_equal' }
const SEQUENCE: TemplateConfig = { uiTemplate: 'sequence_digits', mistakeMetric: 'hamming_digits' }

const PROMPT = 'Назовите метод исследования'
const NO_CONTENT: QuestionContent = { options: null, matchingPairs: null }

export const SHORT_TEXT_AUTHORING_CASES: AuthoringCase[] = [
	{
		name: 'D5: краткий ответ с двумя вариантами проходит проверку',
		config: SHORT_TEXT_IN_SET,
		promptText: PROMPT,
		content: NO_CONTENT,
		key: ['эксперимент', 'моделирование'],
		expected: null,
	},
	{
		name: 'тип не настроен',
		config: null,
		promptText: PROMPT,
		content: NO_CONTENT,
		key: ['эксперимент', 'моделирование'],
		expected: AUTHORING_MESSAGES.typeNotConfigured,
	},
	{
		name: 'формулировка из пробелов',
		config: SHORT_TEXT_IN_SET,
		promptText: '  ',
		content: NO_CONTENT,
		key: ['эксперимент', 'моделирование'],
		expected: AUTHORING_MESSAGES.promptEmpty,
	},
	{
		name: 'пустая формулировка',
		config: SHORT_TEXT_EQUAL,
		promptText: '',
		content: NO_CONTENT,
		key: 'митоз',
		expected: AUTHORING_MESSAGES.promptEmpty,
		serverRules: ['QuestionSchema: promptText min(1)'],
	},
	{
		name: 'in_set: один вариант',
		config: SHORT_TEXT_IN_SET,
		promptText: PROMPT,
		content: NO_CONTENT,
		key: ['эксперимент'],
		expected: AUTHORING_MESSAGES.shortTextVariantsTooFew,
		serverRules: [
			'validateByTemplate short_text in_set: меньше двух, нестроковый или пустой вариант',
			'QuestionSchema short_answer_variants: не массив, меньше двух или пустой вариант',
		],
	},
	{
		name: 'in_set: скалярный ключ (сервер: short_answer_variants со скалярным ответом отклоняется)',
		config: SHORT_TEXT_IN_SET,
		promptText: PROMPT,
		content: NO_CONTENT,
		key: 'эксперимент',
		expected: AUTHORING_MESSAGES.shortTextVariantsTooFew,
		serverRules: [
			'validateByTemplate short_text in_set: меньше двух, нестроковый или пустой вариант',
			'QuestionSchema short_answer_variants: не массив, меньше двух или пустой вариант',
		],
	},
	{
		name: 'in_set: пустой массив',
		config: SHORT_TEXT_IN_SET,
		promptText: PROMPT,
		content: NO_CONTENT,
		key: [],
		expected: AUTHORING_MESSAGES.shortTextVariantsTooFew,
	},
	{
		name: 'in_set: ключ null',
		config: SHORT_TEXT_IN_SET,
		promptText: PROMPT,
		content: NO_CONTENT,
		key: null,
		expected: AUTHORING_MESSAGES.shortTextVariantsTooFew,
	},
	{
		name: 'in_set: пустой вариант (резолвер: пустой вариант отклоняется)',
		config: SHORT_TEXT_IN_SET,
		promptText: PROMPT,
		content: NO_CONTENT,
		key: ['эксперимент', ''],
		expected: AUTHORING_MESSAGES.shortTextVariantEmpty,
		serverRules: [
			'validateByTemplate short_text in_set: меньше двух, нестроковый или пустой вариант',
			'QuestionSchema short_answer_variants: не массив, меньше двух или пустой вариант',
		],
	},
	{
		name: 'in_set: вариант из пробелов',
		config: SHORT_TEXT_IN_SET,
		promptText: PROMPT,
		content: NO_CONTENT,
		key: ['эксперимент', '   '],
		expected: AUTHORING_MESSAGES.shortTextVariantEmpty,
	},
	{
		name: 'in_set: нестроковый вариант',
		config: SHORT_TEXT_IN_SET,
		promptText: PROMPT,
		content: NO_CONTENT,
		key: ['эксперимент', 5],
		expected: AUTHORING_MESSAGES.shortTextVariantEmpty,
		serverRules: ['validateByTemplate short_text in_set: меньше двух, нестроковый или пустой вариант'],
	},
	{
		name: 'in_set: повтор после нормализации регистра и пробелов',
		config: SHORT_TEXT_IN_SET,
		promptText: PROMPT,
		content: NO_CONTENT,
		key: ['Митоз', ' митоз'],
		expected: AUTHORING_MESSAGES.shortTextVariantsDuplicate,
		serverRules: ['validateByTemplate short_text in_set: повтор'],
	},
	{
		name: 'in_set: повтор (сервер: short_answer_variants с дублями вариантов отклоняется)',
		config: SHORT_TEXT_IN_SET,
		promptText: PROMPT,
		content: NO_CONTENT,
		key: ['Эксперимент', ' эксперимент '],
		expected: AUTHORING_MESSAGES.shortTextVariantsDuplicate,
		serverRules: ['QuestionSchema short_answer_variants: повтор'],
	},
	{
		name: 'in_set: три разных варианта проходят',
		config: SHORT_TEXT_IN_SET,
		promptText: PROMPT,
		content: NO_CONTENT,
		key: ['эксперимент', 'моделирование', 'наблюдение'],
		expected: null,
	},
	{
		name: 'equal: непустой ответ проходит (сервер: short_answer допустим)',
		config: SHORT_TEXT_EQUAL,
		promptText: 'Введите термин',
		content: NO_CONTENT,
		key: 'митоз',
		expected: null,
	},
	{
		name: 'equal: пустая строка',
		config: SHORT_TEXT_EQUAL,
		promptText: 'Введите термин',
		content: NO_CONTENT,
		key: '',
		expected: AUTHORING_MESSAGES.shortTextKeyMissing,
		serverRules: [
			'validateByTemplate short_text equal: не строка или пустая',
			'QuestionSchema short_answer: не строка или пустая',
		],
	},
	{
		name: 'equal: строка из пробелов',
		config: SHORT_TEXT_EQUAL,
		promptText: 'Введите термин',
		content: NO_CONTENT,
		key: '  ',
		expected: AUTHORING_MESSAGES.shortTextKeyMissing,
		serverRules: [
			'validateByTemplate short_text equal: не строка или пустая',
			'QuestionSchema short_answer: не строка или пустая',
		],
	},
	{
		name: 'equal: массив вместо строки',
		config: SHORT_TEXT_EQUAL,
		promptText: 'Введите термин',
		content: NO_CONTENT,
		key: ['a', 'b'],
		expected: AUTHORING_MESSAGES.shortTextKeyMissing,
		serverRules: [
			'validateByTemplate short_text equal: не строка или пустая',
			'QuestionSchema short_answer: не строка или пустая',
		],
	},
	{
		name: 'equal: число до приведения toCanonicalKey отклоняется',
		config: SHORT_TEXT_EQUAL,
		promptText: 'Введите термин',
		content: NO_CONTENT,
		key: 3142,
		expected: AUTHORING_MESSAGES.shortTextKeyMissing,
		serverRules: ['validateByTemplate short_text equal: не строка или пустая'],
	},
	{
		name: 'equal: ключ null',
		config: SHORT_TEXT_EQUAL,
		promptText: 'Введите термин',
		content: NO_CONTENT,
		key: null,
		expected: AUTHORING_MESSAGES.shortTextKeyMissing,
	},
]

export const SINGLE_CHOICE_AUTHORING_CASES: AuthoringCase[] = [
	{
		name: 'два варианта и ключ из списка проходят (сервер: radio допустим)',
		config: SINGLE,
		promptText: 'Какой вариант правильный?',
		content: choice(options(2)),
		key: 'a',
		expected: null,
	},
	{
		name: 'варианты отсутствуют',
		config: SINGLE,
		promptText: 'Вопрос',
		content: NO_CONTENT,
		key: 'a',
		expected: 'Добавьте минимум 2 варианта ответа',
		serverRules: ['validateByTemplate choice: не массив или меньше 2 вариантов'],
	},
	{
		name: 'один вариант',
		config: SINGLE,
		promptText: 'Вопрос',
		content: choice(options(1)),
		key: 'a',
		expected: 'Добавьте минимум 2 варианта ответа',
		serverRules: [
			'validateByTemplate choice: не массив или меньше 2 вариантов',
			'QuestionSchema radio/checkbox: меньше 2 вариантов',
		],
	},
	{
		name: 'пустой текст варианта',
		config: SINGLE,
		promptText: 'Вопрос',
		content: choice([
			{ id: 'a', text: 'Вариант 1' },
			{ id: 'b', text: '' },
		]),
		key: 'a',
		expected: AUTHORING_MESSAGES.choiceOptionEmpty,
	},
	{
		name: 'текст варианта из пробелов',
		config: SINGLE,
		promptText: 'Вопрос',
		content: choice([
			{ id: 'a', text: '   ' },
			{ id: 'b', text: 'Вариант 2' },
		]),
		key: 'b',
		expected: AUTHORING_MESSAGES.choiceOptionEmpty,
	},
	{
		name: 'текст варианта не строка',
		config: SINGLE,
		promptText: 'Вопрос',
		content: rawContent({
			options: [
				{ id: 'a', text: 'Вариант 1' },
				{ id: 'b', text: null },
			],
		}),
		key: 'a',
		expected: AUTHORING_MESSAGES.choiceOptionEmpty,
	},
	{
		name: 'id варианта не строка',
		config: SINGLE,
		promptText: 'Вопрос',
		content: rawContent({
			options: [
				{ id: 1, text: 'Вариант 1' },
				{ id: 'b', text: 'Вариант 2' },
			],
		}),
		key: 'b',
		expected: AUTHORING_MESSAGES.choiceIdsInvalid,
		serverRules: ['validateByTemplate choice: id не строка'],
	},
	{
		name: 'повтор id вариантов',
		config: SINGLE,
		promptText: 'Вопрос',
		content: choice([
			{ id: 'a', text: 'Вариант 1' },
			{ id: 'a', text: 'Вариант 2' },
		]),
		key: 'a',
		expected: AUTHORING_MESSAGES.choiceIdsInvalid,
		serverRules: ['validateByTemplate choice: повтор id', 'QuestionSchema radio/checkbox: повтор id'],
	},
	{
		name: 'ключ пустая строка',
		config: SINGLE,
		promptText: 'Вопрос',
		content: choice(options(2)),
		key: '',
		expected: AUTHORING_MESSAGES.singleKeyMissing,
	},
	{
		name: 'ключ null',
		config: SINGLE,
		promptText: 'Вопрос',
		content: choice(options(2)),
		key: null,
		expected: AUTHORING_MESSAGES.singleKeyMissing,
		serverRules: ['validateByTemplate single: ключ не строка или не из вариантов'],
	},
	{
		name: 'ключ не из вариантов',
		config: SINGLE,
		promptText: 'Вопрос',
		content: choice(options(2)),
		key: 'z',
		expected: AUTHORING_MESSAGES.singleKeyMissing,
		serverRules: [
			'validateByTemplate single: ключ не строка или не из вариантов',
			'QuestionSchema radio: ключ не из вариантов',
		],
	},
	{
		name: 'ключ массив',
		config: SINGLE,
		promptText: 'Вопрос',
		content: choice(options(2)),
		key: ['a'],
		expected: AUTHORING_MESSAGES.singleKeyMissing,
		serverRules: ['validateByTemplate single: ключ не строка или не из вариантов'],
	},
	{
		name: 'ключ число до приведения отклоняется',
		config: SINGLE,
		promptText: 'Вопрос',
		content: choice([
			{ id: '1', text: 'Вариант 1' },
			{ id: '2', text: 'Вариант 2' },
		]),
		key: 1,
		expected: AUTHORING_MESSAGES.singleKeyMissing,
	},
	{
		name: 'minOptions 3: 2 варианта (N−1) отклоняются',
		config: withValidation(SINGLE, { minOptions: 3 }),
		promptText: 'Вопрос',
		content: choice(options(2)),
		key: 'a',
		expected: 'Добавьте минимум 3 варианта ответа',
		serverRules: ['validateOptionsCount: minOptions'],
	},
	{
		name: 'minOptions 3: 3 варианта (N) проходят',
		config: withValidation(SINGLE, { minOptions: 3 }),
		promptText: 'Вопрос',
		content: choice(options(3)),
		key: 'a',
		expected: null,
	},
	{
		name: 'minOptions 3: 4 варианта (N+1) проходят',
		config: withValidation(SINGLE, { minOptions: 3 }),
		promptText: 'Вопрос',
		content: choice(options(4)),
		key: 'a',
		expected: null,
	},
	{
		name: 'minOptions 1: минимум остаётся 2',
		config: withValidation(SINGLE, { minOptions: 1 }),
		promptText: 'Вопрос',
		content: choice(options(1)),
		key: 'a',
		expected: 'Добавьте минимум 2 варианта ответа',
	},
	{
		name: 'minOptions 0: 2 варианта проходят',
		config: withValidation(SINGLE, { minOptions: 0 }),
		promptText: 'Вопрос',
		content: choice(options(2)),
		key: 'a',
		expected: null,
	},
	{
		name: 'minOptions 5: 4 варианта отклоняются с формой «вариантов»',
		config: withValidation(SINGLE, { minOptions: 5 }),
		promptText: 'Вопрос',
		content: choice(options(4)),
		key: 'a',
		expected: 'Добавьте минимум 5 вариантов ответа',
	},
	{
		name: 'maxOptions 4: 3 варианта (N−1) проходят',
		config: withValidation(SINGLE, { maxOptions: 4 }),
		promptText: 'Вопрос',
		content: choice(options(3)),
		key: 'a',
		expected: null,
	},
	{
		name: 'maxOptions 4: 4 варианта (N) проходят',
		config: withValidation(SINGLE, { maxOptions: 4 }),
		promptText: 'Вопрос',
		content: choice(options(4)),
		key: 'a',
		expected: null,
	},
	{
		name: 'maxOptions 4: 5 вариантов (N+1) отклоняются',
		config: withValidation(SINGLE, { maxOptions: 4 }),
		promptText: 'Вопрос',
		content: choice(options(5)),
		key: 'a',
		expected: 'Не более 4 вариантов ответа',
		serverRules: ['validateOptionsCount: maxOptions'],
	},
	{
		name: 'maxOptions 1: форма «варианта»',
		config: withValidation(SINGLE, { maxOptions: 1 }),
		promptText: 'Вопрос',
		content: choice(options(2)),
		key: 'a',
		expected: 'Не более 1 варианта ответа',
	},
	{
		name: 'maxOptions 5: форма «вариантов»',
		config: withValidation(SINGLE, { maxOptions: 5 }),
		promptText: 'Вопрос',
		content: choice(options(6)),
		key: 'a',
		expected: 'Не более 5 вариантов ответа',
	},
	{
		name: 'validationSchema null: действует только минимум 2',
		config: { ...SINGLE, validationSchema: null },
		promptText: 'Вопрос',
		content: choice(options(8)),
		key: 'h',
		expected: null,
	},
]

const NUMERIC_ID_OPTIONS = [
	{ id: 1, text: 'Вариант 1' },
	{ id: 2, text: 'Вариант 2' },
	{ id: 3, text: 'Вариант 3' },
].map((option) => OptionSchema.parse(option))

export const MULTI_CHOICE_AUTHORING_CASES: AuthoringCase[] = [
	{
		name: 'checkbox с числовыми id после приведения проходит (сервер: checkbox с числовыми id допустим)',
		config: MULTI,
		promptText: 'Выберите правильные варианты',
		content: choice(NUMERIC_ID_OPTIONS),
		key: QuestionKeyPayloadSchema.parse([1, 3]),
		expected: null,
	},
	{
		name: 'кастомный тип с числовыми id после приведения проходит (сервер: кастомный тип вопроса допустим)',
		config: MULTI,
		promptText: 'Кастомный вопрос',
		content: choice(NUMERIC_ID_OPTIONS.map((option, index) => ({ ...option, text: 'ABC'[index] }))),
		key: QuestionKeyPayloadSchema.parse([1, 2]),
		expected: null,
	},
	{
		name: 'один вариант',
		config: MULTI,
		promptText: 'Вопрос',
		content: choice(options(1)),
		key: ['a'],
		expected: 'Добавьте минимум 2 варианта ответа',
		serverRules: ['QuestionSchema radio/checkbox: меньше 2 вариантов'],
	},
	{
		name: 'пустой текст варианта',
		config: MULTI,
		promptText: 'Вопрос',
		content: choice([
			{ id: 'a', text: 'Вариант 1' },
			{ id: 'b', text: ' ' },
		]),
		key: ['a'],
		expected: AUTHORING_MESSAGES.choiceOptionEmpty,
	},
	{
		name: 'повтор id вариантов',
		config: MULTI,
		promptText: 'Вопрос',
		content: choice([
			{ id: 'a', text: 'Вариант 1' },
			{ id: 'b', text: 'Вариант 2' },
			{ id: 'a', text: 'Вариант 3' },
		]),
		key: ['a'],
		expected: AUTHORING_MESSAGES.choiceIdsInvalid,
		serverRules: ['validateByTemplate choice: повтор id', 'QuestionSchema radio/checkbox: повтор id'],
	},
	{
		name: 'пустой список верных',
		config: MULTI,
		promptText: 'Вопрос',
		content: choice(options(3)),
		key: [],
		expected: AUTHORING_MESSAGES.multiKeyMissing,
		serverRules: [
			'validateByTemplate multi: ключ не массив строк или пустой',
			'QuestionSchema checkbox: ключ не массив или пустой',
		],
	},
	{
		name: 'ключ строка вместо списка',
		config: MULTI,
		promptText: 'Вопрос',
		content: choice(options(3)),
		key: 'a',
		expected: AUTHORING_MESSAGES.multiKeyMissing,
		serverRules: [
			'validateByTemplate multi: ключ не массив строк или пустой',
			'QuestionSchema checkbox: ключ не массив или пустой',
		],
	},
	{
		name: 'ключ null',
		config: MULTI,
		promptText: 'Вопрос',
		content: choice(options(3)),
		key: null,
		expected: AUTHORING_MESSAGES.multiKeyMissing,
	},
	{
		name: 'нестроковый элемент ключа',
		config: MULTI,
		promptText: 'Вопрос',
		content: choice(options(3)),
		key: ['a', 2],
		expected: AUTHORING_MESSAGES.multiKeyMissing,
		serverRules: ['validateByTemplate multi: ключ не массив строк или пустой'],
	},
	{
		name: 'элемент ключа не из вариантов',
		config: MULTI,
		promptText: 'Вопрос',
		content: choice(options(3)),
		key: ['a', 'z'],
		expected: AUTHORING_MESSAGES.multiKeyUnknown,
		serverRules: ['validateByTemplate multi: id не из вариантов', 'QuestionSchema checkbox: id не из вариантов'],
	},
	{
		name: 'повтор в ключе',
		config: MULTI,
		promptText: 'Вопрос',
		content: choice(options(3)),
		key: ['a', 'a'],
		expected: AUTHORING_MESSAGES.multiKeyUnknown,
		serverRules: ['validateByTemplate multi: повтор', 'QuestionSchema checkbox: повтор'],
	},
	{
		name: 'exactChoiceCount 2: 1 верный (N−1) отклоняется',
		config: withValidation(MULTI, { exactChoiceCount: 2 }),
		promptText: 'Вопрос',
		content: choice(options(4)),
		key: ['a'],
		expected: 'Отметьте ровно 2 правильных ответа',
		serverRules: ['validateByTemplate multi: exactChoiceCount'],
	},
	{
		name: 'exactChoiceCount 2: 2 верных (N) проходят',
		config: withValidation(MULTI, { exactChoiceCount: 2 }),
		promptText: 'Вопрос',
		content: choice(options(4)),
		key: ['a', 'c'],
		expected: null,
	},
	{
		name: 'exactChoiceCount 2: 3 верных (N+1) отклоняются',
		config: withValidation(MULTI, { exactChoiceCount: 2 }),
		promptText: 'Вопрос',
		content: choice(options(4)),
		key: ['a', 'b', 'c'],
		expected: 'Отметьте ровно 2 правильных ответа',
		serverRules: ['validateByTemplate multi: exactChoiceCount'],
	},
	{
		name: 'exactChoiceCount 1: форма «правильный ответ»',
		config: withValidation(MULTI, { exactChoiceCount: 1 }),
		promptText: 'Вопрос',
		content: choice(options(3)),
		key: ['a', 'b'],
		expected: 'Отметьте ровно 1 правильный ответ',
	},
	{
		name: 'exactChoiceCount 5: форма «правильных ответов»',
		config: withValidation(MULTI, { exactChoiceCount: 5 }),
		promptText: 'Вопрос',
		content: choice(options(6)),
		key: ['a', 'b', 'c', 'd'],
		expected: 'Отметьте ровно 5 правильных ответов',
	},
	{
		name: 'minOptions 3: 2 варианта отклоняются',
		config: withValidation(MULTI, { minOptions: 3 }),
		promptText: 'Вопрос',
		content: choice(options(2)),
		key: ['a'],
		expected: 'Добавьте минимум 3 варианта ответа',
		serverRules: ['validateOptionsCount: minOptions'],
	},
	{
		name: 'maxOptions 4: 5 вариантов отклоняются',
		config: withValidation(MULTI, { maxOptions: 4 }),
		promptText: 'Вопрос',
		content: choice(options(5)),
		key: ['a'],
		expected: 'Не более 4 вариантов ответа',
		serverRules: ['validateOptionsCount: maxOptions'],
	},
]

export const MATCHING_AUTHORING_CASES: AuthoringCase[] = [
	{
		name: 'две пары с полным ключом проходят',
		config: MATCHING,
		promptText: 'Сопоставьте',
		content: pairs(side('l', 2), side('r', 2)),
		key: { l1: 'r2', l2: 'r1' },
		expected: null,
	},
	{
		name: 'пары отсутствуют',
		config: MATCHING,
		promptText: 'Сопоставьте',
		content: NO_CONTENT,
		key: { l1: 'r1' },
		expected: AUTHORING_MESSAGES.matchingTooFew,
		serverRules: ['validateByTemplate matching: нет left/right'],
	},
	{
		name: 'один элемент слева',
		config: MATCHING,
		promptText: 'Сопоставьте',
		content: pairs(side('l', 1), side('r', 2)),
		key: { l1: 'r1' },
		expected: AUTHORING_MESSAGES.matchingTooFew,
		serverRules: [
			'validateByTemplate matching: меньше 2 слева или справа',
			'QuestionSchema matching: меньше 2 слева или справа',
		],
	},
	{
		name: 'один элемент справа',
		config: MATCHING,
		promptText: 'Сопоставьте',
		content: pairs(side('l', 2), side('r', 1)),
		key: { l1: 'r1', l2: 'r1' },
		expected: AUTHORING_MESSAGES.matchingTooFew,
		serverRules: ['validateByTemplate matching: меньше 2 слева или справа'],
	},
	{
		name: 'пустой элемент слева',
		config: MATCHING,
		promptText: 'Сопоставьте',
		content: pairs(
			[
				{ id: 'l1', text: '' },
				{ id: 'l2', text: 'Элемент 2' },
			],
			side('r', 2)
		),
		key: { l1: 'r1', l2: 'r2' },
		expected: AUTHORING_MESSAGES.matchingItemEmpty,
	},
	{
		name: 'элемент справа из пробелов',
		config: MATCHING,
		promptText: 'Сопоставьте',
		content: pairs(side('l', 2), [
			{ id: 'r1', text: 'Пара 1' },
			{ id: 'r2', text: '  ' },
		]),
		key: { l1: 'r1', l2: 'r2' },
		expected: AUTHORING_MESSAGES.matchingItemEmpty,
	},
	{
		name: 'id элемента не строка',
		config: MATCHING,
		promptText: 'Сопоставьте',
		content: rawContent({
			matchingPairs: {
				left: [
					{ id: 1, text: 'Элемент 1' },
					{ id: 'l2', text: 'Элемент 2' },
				],
				right: side('r', 2),
			},
		}),
		key: { 1: 'r1', l2: 'r2' },
		expected: AUTHORING_MESSAGES.matchingIdsInvalid,
		serverRules: ['validateByTemplate matching: id не строка'],
	},
	{
		name: 'повтор id слева',
		config: MATCHING,
		promptText: 'Сопоставьте',
		content: pairs(
			[
				{ id: 'l1', text: 'Элемент 1' },
				{ id: 'l1', text: 'Элемент 2' },
			],
			side('r', 2)
		),
		key: { l1: 'r1' },
		expected: AUTHORING_MESSAGES.matchingIdsInvalid,
		serverRules: ['validateByTemplate matching: повтор id', 'QuestionSchema matching: повтор id'],
	},
	{
		name: 'повтор id справа',
		config: MATCHING,
		promptText: 'Сопоставьте',
		content: pairs(side('l', 2), [
			{ id: 'r1', text: 'Пара 1' },
			{ id: 'r1', text: 'Пара 2' },
		]),
		key: { l1: 'r1', l2: 'r1' },
		expected: AUTHORING_MESSAGES.matchingIdsInvalid,
	},
	{
		name: 'ключ массив',
		config: MATCHING,
		promptText: 'Сопоставьте',
		content: pairs(side('l', 2), side('r', 2)),
		key: ['r1', 'r2'],
		expected: AUTHORING_MESSAGES.matchingKeyMissing,
		serverRules: ['validateByTemplate matching: ключ не объект строк', 'QuestionSchema matching: ключ не объект'],
	},
	{
		name: 'ключ строка',
		config: MATCHING,
		promptText: 'Сопоставьте',
		content: pairs(side('l', 2), side('r', 2)),
		key: 'r1',
		expected: AUTHORING_MESSAGES.matchingKeyMissing,
		serverRules: ['validateByTemplate matching: ключ не объект строк', 'QuestionSchema matching: ключ не объект'],
	},
	{
		name: 'ключ пустой объект',
		config: MATCHING,
		promptText: 'Сопоставьте',
		content: pairs(side('l', 2), side('r', 2)),
		key: {},
		expected: AUTHORING_MESSAGES.matchingKeyMissing,
		serverRules: ['validateByTemplate matching: левый без правого', 'QuestionSchema matching: левый без правого'],
	},
	{
		name: 'ключ null',
		config: MATCHING,
		promptText: 'Сопоставьте',
		content: pairs(side('l', 2), side('r', 2)),
		key: null,
		expected: AUTHORING_MESSAGES.matchingKeyMissing,
	},
	{
		name: 'левый элемент без пары',
		config: MATCHING,
		promptText: 'Сопоставьте',
		content: pairs(side('l', 2), side('r', 2)),
		key: { l1: 'r1' },
		expected: AUTHORING_MESSAGES.matchingKeyMissing,
		serverRules: ['validateByTemplate matching: левый без правого', 'QuestionSchema matching: левый без правого'],
	},
	{
		name: 'правый элемент не из списка',
		config: MATCHING,
		promptText: 'Сопоставьте',
		content: pairs(side('l', 2), side('r', 2)),
		key: { l1: 'r1', l2: 'r9' },
		expected: AUTHORING_MESSAGES.matchingKeyMissing,
		serverRules: ['validateByTemplate matching: левый без правого', 'QuestionSchema matching: левый без правого'],
	},
	{
		name: 'значение пары не строка',
		config: MATCHING,
		promptText: 'Сопоставьте',
		content: pairs(side('l', 2), side('r', 2)),
		key: { l1: 'r1', l2: 2 },
		expected: AUTHORING_MESSAGES.matchingKeyMissing,
		serverRules: ['validateByTemplate matching: ключ не объект строк'],
	},
	{
		name: 'ключ с прототипным именем не считается парой',
		config: MATCHING,
		promptText: 'Сопоставьте',
		content: pairs(
			[
				{ id: 'toString', text: 'Элемент 1' },
				{ id: 'l2', text: 'Элемент 2' },
			],
			side('r', 2)
		),
		key: { l2: 'r2' },
		expected: AUTHORING_MESSAGES.matchingKeyMissing,
	},
	{
		name: 'правый элемент используется дважды',
		config: MATCHING,
		promptText: 'Сопоставьте',
		content: pairs(side('l', 3), side('r', 2)),
		key: { l1: 'r1', l2: 'r2', l3: 'r1' },
		expected: null,
	},
	{
		name: 'лишний левый id в ключе не мешает',
		config: MATCHING,
		promptText: 'Сопоставьте',
		content: pairs(side('l', 2), side('r', 2)),
		key: { l1: 'r1', l2: 'r2', l9: 'r1' },
		expected: null,
	},
]

export const SEQUENCE_AUTHORING_CASES: AuthoringCase[] = [
	{
		name: 'цифры проходят (сервер: sequence допустим)',
		config: SEQUENCE,
		promptText: 'Укажите последовательность цифр',
		content: NO_CONTENT,
		key: '2314',
		expected: null,
	},
	{
		name: 'цифры с пробелами проходят',
		config: SEQUENCE,
		promptText: 'Укажите последовательность цифр',
		content: NO_CONTENT,
		key: '23 14',
		expected: null,
	},
	{
		name: 'буква в последовательности (сервер: sequence с нецифровым ответом отклоняется)',
		config: SEQUENCE,
		promptText: 'Укажите последовательность цифр',
		content: NO_CONTENT,
		key: '23a4',
		expected: AUTHORING_MESSAGES.sequenceDigitsOnly,
		serverRules: ['validateByTemplate sequence: не цифры', 'QuestionSchema sequence: не цифры'],
	},
	{
		name: 'число до приведения toCanonicalKey отклоняется',
		config: SEQUENCE,
		promptText: 'Укажите последовательность цифр',
		content: NO_CONTENT,
		key: 2314,
		expected: AUTHORING_MESSAGES.sequenceDigitsOnly,
		serverRules: ['validateByTemplate sequence: не строка'],
	},
	{
		name: 'массив цифр',
		config: SEQUENCE,
		promptText: 'Укажите последовательность цифр',
		content: NO_CONTENT,
		key: ['2', '3'],
		expected: AUTHORING_MESSAGES.sequenceDigitsOnly,
		serverRules: ['validateByTemplate sequence: не строка', 'QuestionSchema sequence: не строка'],
	},
	{
		name: 'пустая строка',
		config: SEQUENCE,
		promptText: 'Укажите последовательность цифр',
		content: NO_CONTENT,
		key: '',
		expected: AUTHORING_MESSAGES.sequenceDigitsOnly,
	},
	{
		name: 'строка из пробелов',
		config: SEQUENCE,
		promptText: 'Укажите последовательность цифр',
		content: NO_CONTENT,
		key: '   ',
		expected: AUTHORING_MESSAGES.sequenceDigitsOnly,
	},
	{
		name: 'знак минус',
		config: SEQUENCE,
		promptText: 'Укажите последовательность цифр',
		content: NO_CONTENT,
		key: '-12',
		expected: AUTHORING_MESSAGES.sequenceDigitsOnly,
	},
	{
		name: 'дробь',
		config: SEQUENCE,
		promptText: 'Укажите последовательность цифр',
		content: NO_CONTENT,
		key: '1.5',
		expected: AUTHORING_MESSAGES.sequenceDigitsOnly,
	},
	{
		name: 'ключ null',
		config: SEQUENCE,
		promptText: 'Укажите последовательность цифр',
		content: NO_CONTENT,
		key: null,
		expected: AUTHORING_MESSAGES.sequenceDigitsOnly,
	},
	{
		name: 'validationSchema не влияет на последовательность',
		config: withValidation(SEQUENCE, { minOptions: 5, maxOptions: 5 }),
		promptText: 'Укажите последовательность цифр',
		content: NO_CONTENT,
		key: '12',
		expected: null,
	},
]

export const ORDER_AUTHORING_CASES: AuthoringCase[] = [
	{
		name: 'тип раньше формулировки',
		config: null,
		promptText: '',
		content: choice(options(1)),
		key: '',
		expected: AUTHORING_MESSAGES.typeNotConfigured,
	},
	{
		name: 'неизвестный шаблон считается ненастроенным типом',
		config: { uiTemplate: 'essay' as QuestionUiTemplate, mistakeMetric: 'boolean_correct' },
		promptText: '',
		content: NO_CONTENT,
		key: 'a',
		expected: AUTHORING_MESSAGES.typeNotConfigured,
	},
	{
		name: 'формулировка раньше числа вариантов',
		config: SINGLE,
		promptText: ' ',
		content: choice(options(1)),
		key: 'a',
		expected: AUTHORING_MESSAGES.promptEmpty,
	},
	{
		name: 'формулировка раньше ключа short_text',
		config: SHORT_TEXT_EQUAL,
		promptText: '',
		content: NO_CONTENT,
		key: '',
		expected: AUTHORING_MESSAGES.promptEmpty,
	},
	{
		name: 'один вариант и пустой ключ: первым число вариантов',
		config: SINGLE,
		promptText: 'Вопрос',
		content: choice(options(1)),
		key: '',
		expected: 'Добавьте минимум 2 варианта ответа',
	},
	{
		name: 'один пустой вариант: первым число вариантов',
		config: MULTI,
		promptText: 'Вопрос',
		content: choice([{ id: 'a', text: '' }]),
		key: [],
		expected: 'Добавьте минимум 2 варианта ответа',
	},
	{
		name: 'ниже minOptions и неверное exactChoiceCount: первым минимум',
		config: withValidation(MULTI, { minOptions: 3, exactChoiceCount: 2 }),
		promptText: 'Вопрос',
		content: choice(options(2)),
		key: ['a'],
		expected: 'Добавьте минимум 3 варианта ответа',
	},
	{
		name: 'пустой текст и повтор id: первым пустой текст',
		config: SINGLE,
		promptText: 'Вопрос',
		content: choice([
			{ id: 'a', text: 'Вариант 1' },
			{ id: 'a', text: '' },
		]),
		key: 'a',
		expected: AUTHORING_MESSAGES.choiceOptionEmpty,
	},
	{
		name: 'пустой текст и превышение maxOptions: первым пустой текст',
		config: withValidation(SINGLE, { maxOptions: 2 }),
		promptText: 'Вопрос',
		content: choice([...options(2), { id: 'c', text: '' }]),
		key: 'a',
		expected: AUTHORING_MESSAGES.choiceOptionEmpty,
	},
	{
		name: 'повтор id и превышение maxOptions: первым id',
		config: withValidation(SINGLE, { maxOptions: 2 }),
		promptText: 'Вопрос',
		content: choice([...options(2), { id: 'a', text: 'Вариант 3' }]),
		key: 'a',
		expected: AUTHORING_MESSAGES.choiceIdsInvalid,
	},
	{
		name: 'повтор id и пустой ключ: первым id',
		config: SINGLE,
		promptText: 'Вопрос',
		content: choice([
			{ id: 'a', text: 'Вариант 1' },
			{ id: 'a', text: 'Вариант 2' },
		]),
		key: '',
		expected: AUTHORING_MESSAGES.choiceIdsInvalid,
	},
	{
		name: 'превышение maxOptions и пустой ключ: первым максимум',
		config: withValidation(SINGLE, { maxOptions: 2 }),
		promptText: 'Вопрос',
		content: choice(options(3)),
		key: '',
		expected: 'Не более 2 вариантов ответа',
	},
	{
		name: 'превышение maxOptions и неверное exactChoiceCount: первым максимум',
		config: withValidation(MULTI, { maxOptions: 2, exactChoiceCount: 2 }),
		promptText: 'Вопрос',
		content: choice(options(3)),
		key: ['a'],
		expected: 'Не более 2 вариантов ответа',
	},
	{
		name: 'ключ не из вариантов и неверное exactChoiceCount: первым ключ',
		config: withValidation(MULTI, { exactChoiceCount: 2 }),
		promptText: 'Вопрос',
		content: choice(options(3)),
		key: ['z'],
		expected: AUTHORING_MESSAGES.multiKeyUnknown,
	},
	{
		name: 'пустой ключ и exactChoiceCount: первым ключ',
		config: withValidation(MULTI, { exactChoiceCount: 2 }),
		promptText: 'Вопрос',
		content: choice(options(3)),
		key: [],
		expected: AUTHORING_MESSAGES.multiKeyMissing,
	},
	{
		name: 'одна пара и пустой ключ: первым число пар',
		config: MATCHING,
		promptText: 'Сопоставьте',
		content: pairs(side('l', 1), side('r', 1)),
		key: {},
		expected: AUTHORING_MESSAGES.matchingTooFew,
	},
	{
		name: 'пустой элемент и повтор id: первым пустой элемент',
		config: MATCHING,
		promptText: 'Сопоставьте',
		content: pairs(
			[
				{ id: 'l1', text: 'Элемент 1' },
				{ id: 'l1', text: '' },
			],
			side('r', 2)
		),
		key: { l1: 'r1' },
		expected: AUTHORING_MESSAGES.matchingItemEmpty,
	},
	{
		name: 'повтор id и пустой ключ сопоставления: первым id',
		config: MATCHING,
		promptText: 'Сопоставьте',
		content: pairs(side('l', 2), [
			{ id: 'r1', text: 'Пара 1' },
			{ id: 'r1', text: 'Пара 2' },
		]),
		key: {},
		expected: AUTHORING_MESSAGES.matchingIdsInvalid,
	},
]

export const AUTHORING_CASE_GROUPS: ReadonlyArray<{ template: QuestionUiTemplate; cases: AuthoringCase[] }> = [
	{ template: 'single_choice', cases: SINGLE_CHOICE_AUTHORING_CASES },
	{ template: 'multi_choice', cases: MULTI_CHOICE_AUTHORING_CASES },
	{ template: 'matching', cases: MATCHING_AUTHORING_CASES },
	{ template: 'short_text', cases: SHORT_TEXT_AUTHORING_CASES },
	{ template: 'sequence_digits', cases: SEQUENCE_AUTHORING_CASES },
]

export const KEY_SHAPE_CASES: ReadonlyArray<{ config: TemplateConfig; expected: KeyShape }> = [
	{ config: SINGLE, expected: 'option_id' },
	{ config: MULTI, expected: 'option_ids' },
	{ config: MATCHING, expected: 'pairs' },
	{ config: SHORT_TEXT_EQUAL, expected: 'text' },
	{ config: SHORT_TEXT_IN_SET, expected: 'text_variants' },
	{ config: SEQUENCE, expected: 'digits' },
]

export const TO_CANONICAL_KEY_CASES: ReadonlyArray<{
	name: string
	uiTemplate: QuestionUiTemplate
	key: unknown
	expected: unknown
}> = [
	{ name: 'sequence_digits: пробелы убираются', uiTemplate: 'sequence_digits', key: ' 23 14 ', expected: '2314' },
	{ name: 'sequence_digits: число в строку', uiTemplate: 'sequence_digits', key: 3142, expected: '3142' },
	{ name: 'sequence_digits: null без изменений', uiTemplate: 'sequence_digits', key: null, expected: null },
	{ name: 'sequence_digits: NaN без изменений', uiTemplate: 'sequence_digits', key: Number.NaN, expected: Number.NaN },
	{ name: 'short_text: число в строку', uiTemplate: 'short_text', key: 3142, expected: '3142' },
	{ name: 'short_text: строка без изменений', uiTemplate: 'short_text', key: ' Митоз ', expected: ' Митоз ' },
	{ name: 'short_text: массив без изменений', uiTemplate: 'short_text', key: ['a', 'b'], expected: ['a', 'b'] },
	{ name: 'single_choice: строка без изменений', uiTemplate: 'single_choice', key: 'b', expected: 'b' },
	{ name: 'multi_choice: массив без изменений', uiTemplate: 'multi_choice', key: ['a', 'c'], expected: ['a', 'c'] },
	{ name: 'matching: объект без изменений', uiTemplate: 'matching', key: { l1: 'r1' }, expected: { l1: 'r1' } },
]

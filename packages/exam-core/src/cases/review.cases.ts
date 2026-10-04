import type {
	ChoiceOptionVerdict,
	MatchingPairVerdict,
	QuestionContent,
	SequencePositionVerdict,
	ShortTextVerdict,
} from '../adapters/types'
import type { AnswerValue } from '../attempt-result'
import type { MistakeMetric, QuestionUiTemplate } from '../registry'

export type SequenceReviewCase = {
	name: string
	key: unknown
	answer: unknown
	kinds: SequencePositionVerdict['kind'][]
	mistakes: number
	validKey?: false
	parts?: SequencePositionVerdict[]
}

export const SEQUENCE_REVIEW_CASES: SequenceReviewCase[] = [
	{
		name: 'D2: ключ 1243, ответ 1234 — две позиции swapped, одна единица ошибки',
		key: '1243',
		answer: '1234',
		kinds: ['correct', 'correct', 'swapped', 'swapped'],
		mistakes: 1,
		parts: [
			{ position: 1, kind: 'correct', given: '1', expected: '1' },
			{ position: 2, kind: 'correct', given: '2', expected: '2' },
			{ position: 3, kind: 'swapped', given: '3', expected: '4' },
			{ position: 4, kind: 'swapped', given: '4', expected: '3' },
		],
	},
	{
		name: 'точный ответ 2314',
		key: '2314',
		answer: '2314',
		kinds: ['correct', 'correct', 'correct', 'correct'],
		mistakes: 0,
	},
	{
		name: 'неверна последняя позиция 2314/2315',
		key: '2314',
		answer: '2315',
		kinds: ['correct', 'correct', 'correct', 'wrong'],
		mistakes: 1,
		parts: [
			{ position: 1, kind: 'correct', given: '2', expected: '2' },
			{ position: 2, kind: 'correct', given: '3', expected: '3' },
			{ position: 3, kind: 'correct', given: '1', expected: '1' },
			{ position: 4, kind: 'wrong', given: '5', expected: '4' },
		],
	},
	{
		name: 'лишняя цифра 1234/12345',
		key: '1234',
		answer: '12345',
		kinds: ['correct', 'correct', 'correct', 'correct', 'extra'],
		mistakes: 1,
		parts: [
			{ position: 1, kind: 'correct', given: '1', expected: '1' },
			{ position: 2, kind: 'correct', given: '2', expected: '2' },
			{ position: 3, kind: 'correct', given: '3', expected: '3' },
			{ position: 4, kind: 'correct', given: '4', expected: '4' },
			{ position: 5, kind: 'extra', given: '5', expected: null },
		],
	},
	{
		name: 'пропущенная цифра 1234/123',
		key: '1234',
		answer: '123',
		kinds: ['correct', 'correct', 'correct', 'missing'],
		mistakes: 1,
		parts: [
			{ position: 1, kind: 'correct', given: '1', expected: '1' },
			{ position: 2, kind: 'correct', given: '2', expected: '2' },
			{ position: 3, kind: 'correct', given: '3', expected: '3' },
			{ position: 4, kind: 'missing', given: null, expected: '4' },
		],
	},
	{
		name: 'ключ из трёх цифр 123/132 — исключение не действует',
		key: '123',
		answer: '132',
		kinds: ['correct', 'wrong', 'wrong'],
		mistakes: 2,
	},
	{
		name: 'пустой ответ "" — все позиции missing, ошибок по длине ключа',
		key: '1234',
		answer: '',
		kinds: ['missing', 'missing', 'missing', 'missing'],
		mistakes: 4,
		parts: [
			{ position: 1, kind: 'missing', given: null, expected: '1' },
			{ position: 2, kind: 'missing', given: null, expected: '2' },
			{ position: 3, kind: 'missing', given: null, expected: '3' },
			{ position: 4, kind: 'missing', given: null, expected: '4' },
		],
	},
	{
		name: 'ответ из пробелов — все позиции missing',
		key: '1234',
		answer: '  ',
		kinds: ['missing', 'missing', 'missing', 'missing'],
		mistakes: 4,
	},
	{
		name: 'ответ null — все позиции missing',
		key: '1234',
		answer: null,
		kinds: ['missing', 'missing', 'missing', 'missing'],
		mistakes: 4,
	},
	{
		name: 'ключ числом 3142, ответ "3142"',
		key: 3142,
		answer: '3142',
		kinds: ['correct', 'correct', 'correct', 'correct'],
		mistakes: 0,
	},
	{
		name: 'ответ числом 2314, ключ "2314"',
		key: '2314',
		answer: 2314,
		kinds: ['correct', 'correct', 'correct', 'correct'],
		mistakes: 0,
	},
	{
		name: 'пробелы в ответе убираются',
		key: '2314',
		answer: ' 23 14 ',
		kinds: ['correct', 'correct', 'correct', 'correct'],
		mistakes: 0,
	},
	{
		name: 'повтор цифр: ключ 1123, ответ 1213 — соседняя перестановка',
		key: '1123',
		answer: '1213',
		kinds: ['correct', 'swapped', 'swapped', 'correct'],
		mistakes: 1,
	},
	{
		name: 'несоседняя перестановка 1234/3214 — две позиции wrong',
		key: '1234',
		answer: '3214',
		kinds: ['wrong', 'correct', 'wrong', 'correct'],
		mistakes: 2,
	},
	{
		name: 'соседняя перестановка в конце 12345/12354',
		key: '12345',
		answer: '12354',
		kinds: ['correct', 'correct', 'correct', 'swapped', 'swapped'],
		mistakes: 1,
	},
	{
		name: 'две соседние перестановки 1234/2143 — исключение не действует',
		key: '1234',
		answer: '2143',
		kinds: ['wrong', 'wrong', 'wrong', 'wrong'],
		mistakes: 4,
	},
	{
		name: 'ответ длиннее ключа с соседней перестановкой 1234/21345',
		key: '1234',
		answer: '21345',
		kinds: ['wrong', 'wrong', 'correct', 'correct', 'extra'],
		mistakes: 3,
	},
	{
		name: 'ответ с нецифровым символом 123/12a — части строятся по сжатой строке',
		key: '123',
		answer: '12a',
		kinds: ['correct', 'correct', 'wrong'],
		mistakes: 1,
	},
	{
		name: 'ключ null — частей нет',
		key: null,
		answer: '123',
		kinds: [],
		mistakes: 0,
		validKey: false,
	},
	{
		name: 'дробный числовой ключ 1.5 неразбираем — частей нет',
		key: 1.5,
		answer: '15',
		kinds: [],
		mistakes: 0,
		validKey: false,
	},
]

const OPTIONS_1234 = [
	{ id: '1', text: 'Первый вариант' },
	{ id: '2', text: 'Второй вариант' },
	{ id: '3', text: 'Третий вариант' },
	{ id: '4', text: 'Четвёртый вариант' },
]

const OPTIONS_123 = OPTIONS_1234.slice(0, 3)

const OPTIONS_ABC = [
	{ id: 'a', text: 'А' },
	{ id: 'b', text: 'Б' },
	{ id: 'c', text: 'В' },
]

export type ChoiceReviewCase = {
	name: string
	template: 'single_choice' | 'multi_choice'
	key: unknown
	answer: unknown
	content?: QuestionContent
	kinds: ChoiceOptionVerdict['kind'][]
	optionIds?: string[]
	mistakes: number
	validKey?: false
}

export const CHOICE_REVIEW_CASES: ChoiceReviewCase[] = [
	{
		name: 'multi_choice: варианты размечаются по content.options (из AttemptQuestionsList.test)',
		template: 'multi_choice',
		key: ['1', '2'],
		answer: ['1', '3'],
		content: { options: OPTIONS_1234 },
		kinds: ['selected_correct', 'missed', 'selected_wrong', 'neutral'],
		optionIds: ['1', '2', '3', '4'],
		mistakes: 1,
	},
	{
		name: 'single_choice: выбран неверный вариант (из AttemptQuestionsList.test)',
		template: 'single_choice',
		key: '1',
		answer: '2',
		content: { options: OPTIONS_1234 },
		kinds: ['missed', 'selected_wrong', 'neutral', 'neutral'],
		optionIds: ['1', '2', '3', '4'],
		mistakes: 1,
	},
	{
		name: 'single_choice: выбран верный вариант',
		template: 'single_choice',
		key: 'a',
		answer: 'a',
		content: { options: OPTIONS_ABC },
		kinds: ['selected_correct', 'neutral', 'neutral'],
		mistakes: 0,
	},
	{
		name: 'single_choice: числовой ответ 2 против ключа "2"',
		template: 'single_choice',
		key: '2',
		answer: 2,
		content: { options: OPTIONS_123 },
		kinds: ['neutral', 'selected_correct', 'neutral'],
		mistakes: 0,
	},
	{
		name: 'single_choice: числовой ключ 1 против ответа "1"',
		template: 'single_choice',
		key: 1,
		answer: '1',
		content: { options: OPTIONS_123 },
		kinds: ['selected_correct', 'neutral', 'neutral'],
		mistakes: 0,
	},
	{
		name: 'single_choice: ответ формы multi_choice не выбирает вариант',
		template: 'single_choice',
		key: 'a',
		answer: ['a'],
		content: { options: OPTIONS_ABC },
		kinds: ['missed', 'neutral', 'neutral'],
		mistakes: 1,
	},
	{
		name: 'single_choice: ответ null — верный вариант пропущен',
		template: 'single_choice',
		key: 'b',
		answer: null,
		content: { options: OPTIONS_ABC },
		kinds: ['neutral', 'missed', 'neutral'],
		mistakes: 1,
	},
	{
		name: 'multi_choice: порядок ответа c, a',
		template: 'multi_choice',
		key: ['a', 'b'],
		answer: ['c', 'a'],
		content: { options: OPTIONS_ABC },
		kinds: ['selected_correct', 'missed', 'selected_wrong'],
		optionIds: ['a', 'b', 'c'],
		mistakes: 1,
	},
	{
		name: 'multi_choice: порядок ответа a, c — те же части и ошибки',
		template: 'multi_choice',
		key: ['a', 'b'],
		answer: ['a', 'c'],
		content: { options: OPTIONS_ABC },
		kinds: ['selected_correct', 'missed', 'selected_wrong'],
		optionIds: ['a', 'b', 'c'],
		mistakes: 1,
	},
	{
		name: 'multi_choice: повтор id в ответе не создаёт лишних частей',
		template: 'multi_choice',
		key: ['a'],
		answer: ['a', 'a'],
		content: { options: OPTIONS_ABC },
		kinds: ['selected_correct', 'neutral', 'neutral'],
		mistakes: 0,
	},
	{
		name: 'multi_choice: один вариант в content — одна часть',
		template: 'multi_choice',
		key: ['a'],
		answer: ['a'],
		content: { options: [{ id: 'a', text: 'А' }] },
		kinds: ['selected_correct'],
		mistakes: 0,
	},
	{
		name: 'multi_choice: числовые id в ключе и ответе',
		template: 'multi_choice',
		key: [1, 2],
		answer: [1],
		content: { options: OPTIONS_123 },
		kinds: ['selected_correct', 'missed', 'neutral'],
		mistakes: 1,
	},
	{
		name: 'multi_choice: пустой выбор',
		template: 'multi_choice',
		key: ['1', '2'],
		answer: [],
		content: { options: OPTIONS_123 },
		kinds: ['missed', 'missed', 'neutral'],
		mistakes: 2,
	},
	{
		name: 'multi_choice: ответ null — верные варианты пропущены, ошибки по частям',
		template: 'multi_choice',
		key: ['1', '2'],
		answer: null,
		content: { options: OPTIONS_123 },
		kinds: ['missed', 'missed', 'neutral'],
		mistakes: 2,
	},
	{
		name: 'multi_choice: без content части строятся по ключу, затем по ответу',
		template: 'multi_choice',
		key: ['1', '2'],
		answer: ['2', '3'],
		kinds: ['missed', 'selected_correct', 'selected_wrong'],
		optionIds: ['1', '2', '3'],
		mistakes: 1,
	},
	{
		name: 'multi_choice: ключ null — выбранный вариант selected_wrong, остальные neutral',
		template: 'multi_choice',
		key: null,
		answer: ['1'],
		content: { options: OPTIONS_123 },
		kinds: ['selected_wrong', 'neutral', 'neutral'],
		mistakes: 1,
		validKey: false,
	},
	{
		name: 'multi_choice: ключ null, пустой ответ — все neutral',
		template: 'multi_choice',
		key: null,
		answer: [],
		content: { options: OPTIONS_123 },
		kinds: ['neutral', 'neutral', 'neutral'],
		mistakes: 0,
		validKey: false,
	},
	{
		name: 'multi_choice: ключ null, ответ null — все neutral',
		template: 'multi_choice',
		key: null,
		answer: null,
		content: { options: OPTIONS_123 },
		kinds: ['neutral', 'neutral', 'neutral'],
		mistakes: 0,
		validKey: false,
	},
	{
		name: 'single_choice: ключ null — выбранный вариант selected_wrong, ошибок 1 по счётчику',
		template: 'single_choice',
		key: null,
		answer: '1',
		content: { options: OPTIONS_123 },
		kinds: ['selected_wrong', 'neutral', 'neutral'],
		mistakes: 1,
		validKey: false,
	},
	{
		name: 'multi_choice: ключ-строка неверной формы — части по content',
		template: 'multi_choice',
		key: '1',
		answer: ['1'],
		content: { options: OPTIONS_123 },
		kinds: ['selected_wrong', 'neutral', 'neutral'],
		mistakes: 1,
		validKey: false,
	},
]

const PAIRS_3 = {
	left: [
		{ id: 'l1', text: 'Л1' },
		{ id: 'l2', text: 'Л2' },
		{ id: 'l3', text: 'Л3' },
	],
	right: [
		{ id: 'r1', text: 'П1' },
		{ id: 'r2', text: 'П2' },
		{ id: 'r3', text: 'П3' },
	],
}

const KEY_3 = { l1: 'r1', l2: 'r2', l3: 'r3' }

export type MatchingReviewCase = {
	name: string
	key: unknown
	answer: unknown
	content?: QuestionContent
	kinds: MatchingPairVerdict['kind'][]
	leftIds?: string[]
	mistakes: number
	validKey?: false
	parts?: MatchingPairVerdict[]
}

export const MATCHING_REVIEW_CASES: MatchingReviewCase[] = [
	{
		name: 'точное соответствие',
		key: KEY_3,
		answer: { l1: 'r1', l2: 'r2', l3: 'r3' },
		content: { matchingPairs: PAIRS_3 },
		kinds: ['correct', 'correct', 'correct'],
		mistakes: 0,
	},
	{
		name: 'одна неверная пара',
		key: KEY_3,
		answer: { l1: 'r1', l2: 'r3', l3: 'r3' },
		content: { matchingPairs: PAIRS_3 },
		kinds: ['correct', 'wrong', 'correct'],
		mistakes: 1,
		parts: [
			{ leftId: 'l1', kind: 'correct', given: 'r1', expected: 'r1' },
			{ leftId: 'l2', kind: 'wrong', given: 'r3', expected: 'r2' },
			{ leftId: 'l3', kind: 'correct', given: 'r3', expected: 'r3' },
		],
	},
	{
		name: 'пропущенные пары — wrong с given null',
		key: KEY_3,
		answer: { l1: 'r1' },
		content: { matchingPairs: PAIRS_3 },
		kinds: ['correct', 'wrong', 'wrong'],
		mistakes: 2,
		parts: [
			{ leftId: 'l1', kind: 'correct', given: 'r1', expected: 'r1' },
			{ leftId: 'l2', kind: 'wrong', given: null, expected: 'r2' },
			{ leftId: 'l3', kind: 'wrong', given: null, expected: 'r3' },
		],
	},
	{
		name: 'пустое отображение {} — все пары wrong',
		key: KEY_3,
		answer: {},
		content: { matchingPairs: PAIRS_3 },
		kinds: ['wrong', 'wrong', 'wrong'],
		mistakes: 3,
	},
	{
		name: 'порядок частей — порядок content.matchingPairs.left',
		key: { l1: 'r1', l2: 'r2' },
		answer: { l1: 'r1', l2: 'r1' },
		content: { matchingPairs: { left: [PAIRS_3.left[1], PAIRS_3.left[0]], right: PAIRS_3.right } },
		kinds: ['wrong', 'correct'],
		leftIds: ['l2', 'l1'],
		mistakes: 1,
	},
	{
		name: 'числовые значения в ответе и ключе',
		key: { l1: 1, l2: '2' },
		answer: { l1: '1', l2: 2 },
		content: { matchingPairs: { left: PAIRS_3.left.slice(0, 2), right: PAIRS_3.right } },
		kinds: ['correct', 'correct'],
		mistakes: 0,
	},
	{
		name: 'одна пара — одна часть',
		key: { l1: 'r1' },
		answer: { l1: 'r1' },
		content: { matchingPairs: { left: [PAIRS_3.left[0]], right: [PAIRS_3.right[0]] } },
		kinds: ['correct'],
		mistakes: 0,
	},
	{
		name: 'лишняя пара в ответе не создаёт части',
		key: KEY_3,
		answer: { l1: 'r1', l2: 'r2', l3: 'r3', l4: 'r1' },
		content: { matchingPairs: PAIRS_3 },
		kinds: ['correct', 'correct', 'correct'],
		mistakes: 0,
	},
	{
		name: 'без content части строятся по ключу',
		key: { a: '1', b: '2' },
		answer: { a: '1' },
		kinds: ['correct', 'wrong'],
		leftIds: ['a', 'b'],
		mistakes: 1,
	},
	{
		name: 'ответ null — все пары wrong, ошибки по частям',
		key: KEY_3,
		answer: null,
		content: { matchingPairs: PAIRS_3 },
		kinds: ['wrong', 'wrong', 'wrong'],
		mistakes: 3,
	},
	{
		name: 'значение null в паре делает ответ неразбираемым — все пары wrong',
		key: { l1: 'r1', l2: 'r2' },
		answer: { l1: 'r1', l2: null },
		content: { matchingPairs: { left: PAIRS_3.left.slice(0, 2), right: PAIRS_3.right } },
		kinds: ['wrong', 'wrong'],
		mistakes: 2,
	},
	{
		name: 'ключ null — одна часть wrong на каждый левый элемент',
		key: null,
		answer: { l1: 'r1' },
		content: { matchingPairs: PAIRS_3 },
		kinds: ['wrong', 'wrong', 'wrong'],
		mistakes: 3,
		validKey: false,
		parts: [
			{ leftId: 'l1', kind: 'wrong', given: 'r1', expected: null },
			{ leftId: 'l2', kind: 'wrong', given: null, expected: null },
			{ leftId: 'l3', kind: 'wrong', given: null, expected: null },
		],
	},
	{
		name: 'ключ null, ответ null — все левые элементы wrong',
		key: null,
		answer: null,
		content: { matchingPairs: PAIRS_3 },
		kinds: ['wrong', 'wrong', 'wrong'],
		mistakes: 3,
		validKey: false,
	},
	{
		name: 'пустой ключ {} — части по content',
		key: {},
		answer: { l1: 'r1' },
		content: { matchingPairs: PAIRS_3 },
		kinds: ['wrong', 'wrong', 'wrong'],
		mistakes: 3,
		validKey: false,
	},
]

export type ShortTextReviewCase = {
	name: string
	metric: 'compact_text_equal' | 'compact_text_in_set'
	key: unknown
	answer: unknown
	kinds: ShortTextVerdict['kind'][]
	mistakes: number
	validKey?: false
}

export const SHORT_TEXT_REVIEW_CASES: ShortTextReviewCase[] = [
	{
		name: 'совпадение без учёта регистра и пробелов',
		metric: 'compact_text_equal',
		key: 'митоз',
		answer: ' МИТОЗ ',
		kinds: ['correct'],
		mistakes: 0,
	},
	{
		name: 'неверный ответ',
		metric: 'compact_text_equal',
		key: 'митоз',
		answer: 'мейоз',
		kinds: ['wrong'],
		mistakes: 1,
	},
	{
		name: 'числовой ключ 3142 против ответа "3142"',
		metric: 'compact_text_equal',
		key: 3142,
		answer: '3142',
		kinds: ['correct'],
		mistakes: 0,
	},
	{
		name: 'набор вариантов: ответ из набора',
		metric: 'compact_text_in_set',
		key: ['эксперимент', 'моделирование'],
		answer: 'Моделирование',
		kinds: ['correct'],
		mistakes: 0,
	},
	{
		name: 'набор вариантов: ответ вне набора',
		metric: 'compact_text_in_set',
		key: ['эксперимент', 'моделирование'],
		answer: 'наблюдение',
		kinds: ['wrong'],
		mistakes: 1,
	},
	{
		name: 'пустой ответ — одна часть wrong, ошибок 1',
		metric: 'compact_text_equal',
		key: 'митоз',
		answer: '',
		kinds: ['wrong'],
		mistakes: 1,
	},
	{
		name: 'ответ null — одна часть wrong',
		metric: 'compact_text_equal',
		key: 'митоз',
		answer: null,
		kinds: ['wrong'],
		mistakes: 1,
	},
	{
		name: 'D-12: строковый ключ при compact_text_in_set — wrong',
		metric: 'compact_text_in_set',
		key: 'митоз',
		answer: 'митоз',
		kinds: ['wrong'],
		mistakes: 1,
		validKey: false,
	},
	{
		name: 'ключ null — wrong',
		metric: 'compact_text_equal',
		key: null,
		answer: 'митоз',
		kinds: ['wrong'],
		mistakes: 1,
		validKey: false,
	},
]

export type IsAnsweredCase = {
	name: string
	template: QuestionUiTemplate | null
	answer: unknown
	content?: QuestionContent
	expected: boolean
}

const PAIRS_2 = { left: PAIRS_3.left.slice(0, 2), right: PAIRS_3.right }

export const IS_ANSWERED_CASES: IsAnsweredCase[] = [
	{ name: 'single_choice: id варианта', template: 'single_choice', answer: 'a', expected: true },
	{ name: 'single_choice: пустая строка', template: 'single_choice', answer: '', expected: false },
	{ name: 'single_choice: null', template: 'single_choice', answer: null, expected: false },
	{ name: 'single_choice: число вместо строки', template: 'single_choice', answer: 3, expected: false },
	{ name: 'single_choice: массив', template: 'single_choice', answer: ['a'], expected: false },
	{ name: 'multi_choice: непустой массив', template: 'multi_choice', answer: ['1'], expected: true },
	{ name: 'multi_choice: пустой массив []', template: 'multi_choice', answer: [], expected: false },
	{ name: 'multi_choice: null', template: 'multi_choice', answer: null, expected: false },
	{ name: 'multi_choice: строка', template: 'multi_choice', answer: '1', expected: false },
	{
		name: 'matching: все левые элементы сопоставлены',
		template: 'matching',
		answer: { l1: 'r1', l2: 'r2' },
		content: { matchingPairs: PAIRS_2 },
		expected: true,
	},
	{
		name: 'matching: неполное сопоставление',
		template: 'matching',
		answer: { l1: 'r1' },
		content: { matchingPairs: PAIRS_2 },
		expected: false,
	},
	{
		name: 'matching: пустая строка в паре',
		template: 'matching',
		answer: { l1: 'r1', l2: '' },
		content: { matchingPairs: PAIRS_2 },
		expected: false,
	},
	{
		name: 'matching: числа вместо строк',
		template: 'matching',
		answer: { l1: 1, l2: 2 },
		content: { matchingPairs: PAIRS_2 },
		expected: false,
	},
	{
		name: 'matching: пустой объект {}',
		template: 'matching',
		answer: {},
		content: { matchingPairs: PAIRS_2 },
		expected: false,
	},
	{
		name: 'matching: null',
		template: 'matching',
		answer: null,
		content: { matchingPairs: PAIRS_2 },
		expected: false,
	},
	{
		name: 'matching: массив',
		template: 'matching',
		answer: ['r1', 'r2'],
		content: { matchingPairs: PAIRS_2 },
		expected: false,
	},
	{ name: 'matching: без пар в content', template: 'matching', answer: { l1: 'r1' }, expected: false },
	{ name: 'short_text: текст', template: 'short_text', answer: 'митоз', expected: true },
	{ name: 'short_text: пустая строка', template: 'short_text', answer: '', expected: false },
	{ name: 'short_text: строка из пробелов', template: 'short_text', answer: '  ', expected: false },
	{ name: 'short_text: число 3', template: 'short_text', answer: 3, expected: false },
	{ name: 'short_text: null', template: 'short_text', answer: null, expected: false },
	{ name: 'sequence_digits: цифры', template: 'sequence_digits', answer: '1243', expected: true },
	{ name: 'sequence_digits: пустая строка', template: 'sequence_digits', answer: '', expected: false },
	{ name: 'sequence_digits: строка из пробелов', template: 'sequence_digits', answer: '  ', expected: false },
	{ name: 'sequence_digits: число', template: 'sequence_digits', answer: 1243, expected: false },
	{ name: 'шаблон null', template: null, answer: 'a', expected: false },
	{
		name: 'неизвестный шаблон essay',
		template: 'essay' as QuestionUiTemplate,
		answer: 'текст',
		expected: false,
	},
]

export type ReadKeyCase = {
	name: string
	template: QuestionUiTemplate
	metric: MistakeMetric
	raw: unknown
	expected: AnswerValue | null
}

export const READ_KEY_CASES: ReadKeyCase[] = [
	{ name: 'single_choice: число 3', template: 'single_choice', metric: 'boolean_correct', raw: 3, expected: '3' },
	{ name: 'single_choice: строка', template: 'single_choice', metric: 'boolean_correct', raw: 'a', expected: 'a' },
	{ name: 'single_choice: массив', template: 'single_choice', metric: 'boolean_correct', raw: ['a'], expected: null },
	{ name: 'single_choice: null', template: 'single_choice', metric: 'boolean_correct', raw: null, expected: null },
	{
		name: 'multi_choice: числовые id',
		template: 'multi_choice',
		metric: 'set_distance',
		raw: [1, '2'],
		expected: ['1', '2'],
	},
	{ name: 'multi_choice: строка', template: 'multi_choice', metric: 'set_distance', raw: '1', expected: null },
	{
		name: 'multi_choice: элемент null',
		template: 'multi_choice',
		metric: 'set_distance',
		raw: ['1', null],
		expected: null,
	},
	{
		name: 'matching: числовое значение',
		template: 'matching',
		metric: 'pair_mismatch_count',
		raw: { l1: 1 },
		expected: { l1: '1' },
	},
	{ name: 'matching: массив', template: 'matching', metric: 'pair_mismatch_count', raw: ['1'], expected: null },
	{
		name: 'matching: значение null',
		template: 'matching',
		metric: 'pair_mismatch_count',
		raw: { l1: null },
		expected: null,
	},
	{
		name: 'short_text compact_text_equal: число 3142',
		template: 'short_text',
		metric: 'compact_text_equal',
		raw: 3142,
		expected: '3142',
	},
	{
		name: 'short_text compact_text_equal: строка сохраняет регистр',
		template: 'short_text',
		metric: 'compact_text_equal',
		raw: 'Митоз',
		expected: 'Митоз',
	},
	{
		name: 'short_text compact_text_equal: массив',
		template: 'short_text',
		metric: 'compact_text_equal',
		raw: ['митоз'],
		expected: null,
	},
	{
		name: 'short_text compact_text_in_set: числовой элемент',
		template: 'short_text',
		metric: 'compact_text_in_set',
		raw: ['a', 2],
		expected: ['a', '2'],
	},
	{
		name: 'short_text compact_text_in_set: строка',
		template: 'short_text',
		metric: 'compact_text_in_set',
		raw: 'митоз',
		expected: null,
	},
	{
		name: 'short_text compact_text_in_set: нестроковые элементы пропускаются',
		template: 'short_text',
		metric: 'compact_text_in_set',
		raw: [null, 'митоз'],
		expected: ['митоз'],
	},
	{
		name: 'sequence_digits: число 3142',
		template: 'sequence_digits',
		metric: 'hamming_digits',
		raw: 3142,
		expected: '3142',
	},
	{
		name: 'sequence_digits: строка',
		template: 'sequence_digits',
		metric: 'hamming_digits',
		raw: '1243',
		expected: '1243',
	},
	{
		name: 'sequence_digits: массив',
		template: 'sequence_digits',
		metric: 'hamming_digits',
		raw: ['1'],
		expected: null,
	},
	{
		name: 'метрика чужого шаблона',
		template: 'single_choice',
		metric: 'set_distance',
		raw: ['1'],
		expected: null,
	},
	{
		name: 'неизвестный шаблон essay',
		template: 'essay' as QuestionUiTemplate,
		metric: 'compact_text_equal',
		raw: 'текст',
		expected: null,
	},
]

export type NormalizeKeyValueCase = {
	name: string
	raw: unknown
	expected: AnswerValue
}

export const NORMALIZE_KEY_VALUE_CASES: NormalizeKeyValueCase[] = [
	{ name: 'строка', raw: 'митоз', expected: 'митоз' },
	{ name: 'пустая строка', raw: '', expected: '' },
	{ name: 'целое число', raw: 3142, expected: '3142' },
	{ name: 'дробное число', raw: 1.5, expected: '1.5' },
	{ name: 'NaN', raw: Number.NaN, expected: '' },
	{ name: 'массив строк и чисел', raw: ['a', 1], expected: ['a', '1'] },
	{ name: 'массив с null', raw: ['a', null], expected: '' },
	{ name: 'объект со строковыми и числовыми значениями', raw: { l1: 'r1', l2: 2 }, expected: { l1: 'r1', l2: '2' } },
	{ name: 'объект: прочие значения отбрасываются', raw: { l1: 'r1', l2: null }, expected: { l1: 'r1' } },
	{ name: 'null', raw: null, expected: '' },
	{ name: 'boolean', raw: true, expected: '' },
]

export type AnswerIdListCase = {
	name: string
	value: unknown
	expected: string[]
}

export const ANSWER_ID_LIST_CASES: AnswerIdListCase[] = [
	{ name: 'массив строк и чисел', value: ['1', 2], expected: ['1', '2'] },
	{ name: 'прочие элементы массива отбрасываются', value: ['1', null, {}], expected: ['1'] },
	{ name: 'строка', value: '3', expected: ['3'] },
	{ name: 'число', value: 4, expected: ['4'] },
	{ name: 'null', value: null, expected: [] },
	{ name: 'объект', value: { a: '1' }, expected: [] },
	{ name: 'undefined', value: undefined, expected: [] },
]

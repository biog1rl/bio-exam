import { describe, expect, it } from 'vitest'

import type { Question, TestFormData, TestScoringRules } from '../../types'
import { normalizeQuestionForSave } from '../../types'
import { PHOTO_WINDOW_INVALID, PHOTO_WINDOW_SAVE_TOAST } from './photo-window'
import {
	createTestBody,
	initialTestForm,
	photoWindowField,
	settingsChanged,
	settingsSaveError,
	updateSettingsBody,
	withSavedSettings,
	type SavedTest,
	type SettingsSaveContext,
	type SettingsSaveError,
	type TestSettings,
} from './test-settings-form'

const SETTING_KEYS: (keyof TestSettings)[] = [
	'topicId',
	'title',
	'slug',
	'description',
	'isPublished',
	'showCorrectAnswer',
	'timeLimitMinutes',
	'redThresholdMinutes',
	'warningThresholdMinutes',
	'passingScore',
	'photoUploadWindowMinutes',
]

const SAVED: SavedTest = {
	topicId: 't1',
	title: 'Видоизменения',
	slug: 'vidoizmeneniya',
	description: null,
	isPublished: false,
	showCorrectAnswer: true,
	timeLimitMinutes: null,
	redThresholdMinutes: null,
	warningThresholdMinutes: null,
	passingScore: null,
	photoUploadWindowMinutes: undefined,
	order: 3,
}

const QUESTION = {
	id: 'q1',
	type: 'short_answer',
	questionUiTemplate: 'short_text',
	order: 0,
	points: 1,
	options: null,
	matchingPairs: null,
	promptText: 'Как называется корень?',
	explanationText: null,
	correct: 'стержневой',
} as Question

const RULES = { shortAnswer: 'exact' } as unknown as TestScoringRules

const FORM: TestFormData = {
	topicId: 'topic-1',
	title: 'Клетка',
	slug: 'cell',
	description: 'Описание',
	isPublished: true,
	showCorrectAnswer: false,
	timeLimitMinutes: 30,
	redThresholdMinutes: 5,
	warningThresholdMinutes: 10,
	passingScore: 60,
	photoUploadWindowMinutes: 20,
	order: 2,
	questions: [QUESTION],
}

const OTHER: { [K in keyof TestSettings]: TestSettings[K] } = {
	topicId: 't2',
	title: 'Другое',
	slug: 'drugoe',
	description: 'Описание',
	isPublished: true,
	showCorrectAnswer: false,
	timeLimitMinutes: 40,
	redThresholdMinutes: 3,
	warningThresholdMinutes: 7,
	passingScore: 60,
	photoUploadWindowMinutes: 30,
}

const loaded = () => withSavedSettings(initialTestForm(), SAVED)

describe('initialTestForm', () => {
	it('пустая форма нового теста', () => {
		expect(initialTestForm()).toEqual({
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
			photoUploadWindowMinutes: 15,
			order: 0,
			questions: [],
		})
	})
})

describe('withSavedSettings', () => {
	it('сохранённые значения приводятся к форме', () => {
		const form = withSavedSettings({ ...FORM, scoringRules: RULES }, {
			...SAVED,
			showCorrectAnswer: undefined,
		} as never)
		expect(form).toEqual({
			topicId: 't1',
			title: 'Видоизменения',
			slug: 'vidoizmeneniya',
			description: '',
			isPublished: false,
			showCorrectAnswer: true,
			timeLimitMinutes: null,
			redThresholdMinutes: null,
			warningThresholdMinutes: null,
			passingScore: null,
			photoUploadWindowMinutes: 15,
			order: 3,
			scoringRules: RULES,
			questions: [QUESTION],
		})
	})

	it('пороги, которых нет в ответе, становятся null', () => {
		const partial = { ...SAVED, redThresholdMinutes: undefined, warningThresholdMinutes: undefined } as never
		const form = withSavedSettings(FORM, partial)
		expect(form.redThresholdMinutes).toBeNull()
		expect(form.warningThresholdMinutes).toBeNull()
	})
})

describe('settingsChanged', () => {
	it.each(SETTING_KEYS)('другое значение %s — изменения есть', (key) => {
		expect(settingsChanged({ ...loaded(), [key]: OTHER[key] }, SAVED)).toBe(true)
	})

	it('форма из того же сохранённого — изменений нет', () => {
		expect(settingsChanged(loaded(), SAVED)).toBe(false)
	})

	it('без сохранённой версии изменений нет', () => {
		expect(settingsChanged({ ...loaded(), title: 'x' }, null)).toBe(false)
	})

	it.each([
		{ name: 'другой order', form: () => ({ ...loaded(), order: 9 }) },
		{ name: 'другие вопросы', form: () => ({ ...loaded(), questions: [QUESTION] }) },
	])('$name — не изменение настроек', ({ form }) => {
		expect(settingsChanged(form(), SAVED)).toBe(false)
	})
})

describe('updateSettingsBody', () => {
	it.each([
		{ name: 'без правил оценивания', form: FORM, keys: [...SETTING_KEYS, 'order'] },
		{
			name: 'с правилами оценивания',
			form: { ...FORM, scoringRules: RULES },
			keys: [...SETTING_KEYS, 'order', 'scoringRules'],
		},
	])('$name: настройки и order, без вопросов', ({ form, keys }) => {
		const body = updateSettingsBody(form)
		expect(Object.keys(body).sort()).toEqual([...keys].sort())
		for (const key of keys) expect(body[key as keyof typeof body]).toEqual(form[key as keyof TestFormData])
	})
})

describe('createTestBody', () => {
	it.each([
		{ name: 'без правил оценивания', form: FORM, keys: [...SETTING_KEYS, 'order', 'questions'] },
		{
			name: 'с правилами оценивания',
			form: { ...FORM, scoringRules: RULES },
			keys: [...SETTING_KEYS, 'order', 'questions', 'scoringRules'],
		},
	])('$name: настройки, order и вопросы после нормализации', ({ form, keys }) => {
		const body = createTestBody({ ...form, isPublished: false })
		expect(Object.keys(body).sort()).toEqual([...keys].sort())
		expect(body.isPublished).toBe(false)
		expect(body.title).toBe(form.title)
		expect(body.questions).toEqual(form.questions.map((question) => normalizeQuestionForSave(question)))
	})
})

const OPEN_QUESTION = { ...QUESTION, id: 'q2', questionUiTemplate: 'open' } as Question

const VALID: TestFormData = { ...FORM, isPublished: false, questions: [] }

const PHOTO_ERROR: SettingsSaveError = { message: PHOTO_WINDOW_SAVE_TOAST, field: 'photoUploadWindowMinutes' }

type SaveErrorCase = {
	name: string
	form: TestFormData
	mode: SettingsSaveContext['mode']
	count: number
	expected: SettingsSaveError | null
}

describe('settingsSaveError', () => {
	it.each([
		{
			name: 'без темы',
			form: { ...VALID, topicId: '' },
			mode: 'edit',
			count: 1,
			expected: { message: 'Выберите тему', field: null },
		},
		{
			name: 'без названия',
			form: { ...VALID, title: '' },
			mode: 'edit',
			count: 1,
			expected: { message: 'Введите название теста', field: null },
		},
		{
			name: 'без адреса',
			form: { ...VALID, slug: '' },
			mode: 'edit',
			count: 1,
			expected: { message: 'Введите slug', field: null },
		},
		{
			name: 'адрес с пробелом и заглавными',
			form: { ...VALID, slug: 'Bad Slug' },
			mode: 'edit',
			count: 1,
			expected: { message: 'Slug: только латинские буквы, цифры и дефисы (2-100 символов)', field: null },
		},
		{
			name: 'публикация без вопросов в существующем тесте',
			form: { ...VALID, isPublished: true },
			mode: 'edit',
			count: 0,
			expected: { message: 'Для публикации добавьте хотя бы один вопрос', field: null },
		},
		{
			name: 'публикация без вопросов в новом тесте',
			form: { ...VALID, isPublished: true },
			mode: 'create',
			count: 0,
			expected: null,
		},
		{
			name: 'новый тест без названия',
			form: { ...VALID, title: '' },
			mode: 'create',
			count: 0,
			expected: { message: 'Введите название теста', field: null },
		},
		{
			name: 'окно null без открытого вопроса',
			form: { ...VALID, photoUploadWindowMinutes: null, questions: [QUESTION] },
			mode: 'edit',
			count: 1,
			expected: null,
		},
		{
			name: 'окно null с открытым вопросом',
			form: { ...VALID, photoUploadWindowMinutes: null, questions: [OPEN_QUESTION] },
			mode: 'edit',
			count: 1,
			expected: PHOTO_ERROR,
		},
		{
			name: 'окно 121 с открытым вопросом',
			form: { ...VALID, photoUploadWindowMinutes: 121, questions: [OPEN_QUESTION] },
			mode: 'edit',
			count: 1,
			expected: PHOTO_ERROR,
		},
		{
			name: 'окно 15 с открытым вопросом',
			form: { ...VALID, questions: [OPEN_QUESTION] },
			mode: 'edit',
			count: 1,
			expected: null,
		},
		{
			name: 'базовая ошибка раньше ошибки окна',
			form: { ...VALID, title: '', photoUploadWindowMinutes: 121, questions: [OPEN_QUESTION] },
			mode: 'edit',
			count: 1,
			expected: { message: 'Введите название теста', field: null },
		},
	] satisfies SaveErrorCase[])('$name', ({ form, mode, count, expected }) => {
		expect(settingsSaveError(form, { mode, questionCount: count })).toEqual(expected)
	})
})

describe('photoWindowField', () => {
	it.each([
		{
			name: 'без открытого вопроса',
			form: { ...VALID, questions: [QUESTION] },
			server: null,
			expected: { visible: false, error: null },
		},
		{
			name: 'с открытым вопросом и 15',
			form: { ...VALID, questions: [OPEN_QUESTION] },
			server: null,
			expected: { visible: true, error: null },
		},
		{
			name: 'с открытым вопросом и 121',
			form: { ...VALID, photoUploadWindowMinutes: 121, questions: [OPEN_QUESTION] },
			server: null,
			expected: { visible: true, error: PHOTO_WINDOW_INVALID },
		},
		{
			name: 'с открытым вопросом, 15 и ошибкой сервера',
			form: { ...VALID, questions: [OPEN_QUESTION] },
			server: 'Ошибка сервера',
			expected: { visible: true, error: 'Ошибка сервера' },
		},
	])('$name', ({ form, server, expected }) => {
		expect(photoWindowField(form, server)).toEqual(expected)
	})
})

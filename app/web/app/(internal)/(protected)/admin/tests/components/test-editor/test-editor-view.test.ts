import { describe, expect, it } from 'vitest'

import type { Question } from '../../types'
import {
	DEFAULT_SORT,
	accessStatusCounts,
	accessUserStatus,
	editorTabSearch,
	filterAssignments,
	filterQuestions,
	manualOrderAllowed,
	nextSort,
	parseEditorTab,
	pointsLabel,
	questionsCountLabel,
	questionTypeTitle,
	savedSettings,
	settingsDirty,
	sortEntries,
	studentName,
	totalPoints,
} from './test-editor-view'

function question(id: string, type: string, promptText: string, points: number): Question {
	return { id, type, questionTypeTitle: type, promptText, points, order: 0 } as unknown as Question
}

const QUESTIONS = [
	question('a', 'Краткий ответ', 'Какой цифрой обозначен корневой волосок?', 1),
	question('b', 'Сопоставление', 'Установите соответствие между корнями ![](x.png)', 2),
	question('c', 'Краткий ответ', 'Был ли придаточный корень?', 1),
]

const SAVED = savedSettings({
	topicId: 't1',
	title: 'Видоизменения',
	slug: 'vidoizmeneniya',
	description: null,
	isPublished: false,
	showCorrectAnswer: null,
	timeLimitMinutes: null,
	passingScore: null,
})

const ids = (entries: { question: Question }[]) => entries.map((entry) => entry.question.id)

describe('вкладки редактора', () => {
	it('по умолчанию вопросы, доступ учеников — только у существующего теста', () => {
		expect(parseEditorTab(null, false)).toBe('questions')
		expect(parseEditorTab('access', false)).toBe('access')
		expect(parseEditorTab('settings', false)).toBe('questions')
		expect(parseEditorTab('access', true)).toBe('questions')
	})

	it('вкладка вопросов не пишется в адрес', () => {
		expect(editorTabSearch('questions')).toBe('')
		expect(editorTabSearch('access')).toBe('?tab=access')
	})
})

describe('несохранённые настройки', () => {
	it('сохранённые значения приводятся к форме формы', () => {
		expect(SAVED.description).toBe('')
		expect(SAVED.showCorrectAnswer).toBe(true)
		expect(SAVED.redThresholdMinutes).toBeNull()
	})

	it('совпадение с сохранённым — нет изменений, любое поле — есть', () => {
		expect(settingsDirty({ ...SAVED }, SAVED)).toBe(false)
		expect(settingsDirty({ ...SAVED, title: 'Другое' }, SAVED)).toBe(true)
		expect(settingsDirty({ ...SAVED, isPublished: true }, SAVED)).toBe(true)
		expect(settingsDirty({ ...SAVED, passingScore: 60 }, SAVED)).toBe(true)
	})

	it('без сохранённой версии изменений нет', () => {
		expect(settingsDirty({ ...SAVED, title: 'x' }, null)).toBe(false)
	})
})

describe('поиск вопросов', () => {
	it('ищет по тексту без учёта регистра и сохраняет исходные номера', () => {
		expect(filterQuestions(QUESTIONS, '').map((entry) => entry.index)).toEqual([0, 1, 2])
		expect(filterQuestions(QUESTIONS, 'ПРИДАТОЧНЫЙ').map((entry) => entry.index)).toEqual([2])
	})

	it('запрос из одних цифр ищет по номеру вопроса, а не по цифрам в тексте', () => {
		const withDigits = [...QUESTIONS, question('d', 'Сопоставление', 'Отмечены цифрами 1, 2, 3', 2)]
		expect(filterQuestions(withDigits, '2').map((entry) => entry.index)).toEqual([1])
		expect(filterQuestions(withDigits, '4').map((entry) => entry.index)).toEqual([3])
		expect(filterQuestions(withDigits, '1, 2').map((entry) => entry.index)).toEqual([3])
	})

	it('не находит имя файла картинки', () => {
		expect(filterQuestions(QUESTIONS, 'x.png')).toEqual([])
	})
})

describe('сортировка таблицы', () => {
	const entries = filterQuestions(QUESTIONS, '')

	it('по номеру — исходный порядок, в обратную сторону — с конца', () => {
		expect(ids(sortEntries(entries, DEFAULT_SORT))).toEqual(['a', 'b', 'c'])
		expect(ids(sortEntries(entries, { key: 'order', direction: 'desc' }))).toEqual(['c', 'b', 'a'])
	})

	it('по тексту, типу и баллам; равные остаются в исходном порядке', () => {
		expect(ids(sortEntries(entries, { key: 'text', direction: 'asc' }))).toEqual(['c', 'a', 'b'])
		expect(ids(sortEntries(entries, { key: 'type', direction: 'asc' }))).toEqual(['a', 'c', 'b'])
		expect(ids(sortEntries(entries, { key: 'points', direction: 'desc' }))).toEqual(['b', 'a', 'c'])
		expect(ids(sortEntries(entries, { key: 'type', direction: 'desc' }))).toEqual(['b', 'a', 'c'])
	})

	it('клики по столбцу: по возрастанию, по убыванию, сброс к порядку теста', () => {
		const first = nextSort(DEFAULT_SORT, 'points')
		const second = nextSort(first, 'points')
		expect(first).toEqual({ key: 'points', direction: 'asc' })
		expect(second).toEqual({ key: 'points', direction: 'desc' })
		expect(nextSort(second, 'points')).toEqual(DEFAULT_SORT)
		expect(nextSort({ key: 'text', direction: 'desc' }, 'points')).toEqual({ key: 'points', direction: 'asc' })
	})

	it('по номеру: обратный порядок, затем сброс', () => {
		expect(nextSort(DEFAULT_SORT, 'order')).toEqual({ key: 'order', direction: 'desc' })
		expect(nextSort({ key: 'order', direction: 'desc' }, 'order')).toEqual(DEFAULT_SORT)
	})

	it('порядок вручную — только при сортировке по номеру и пустом поиске', () => {
		expect(manualOrderAllowed(DEFAULT_SORT, '')).toBe(true)
		expect(manualOrderAllowed(DEFAULT_SORT, 'корень')).toBe(false)
		expect(manualOrderAllowed({ key: 'order', direction: 'desc' }, '')).toBe(false)
		expect(manualOrderAllowed({ key: 'points', direction: 'asc' }, '')).toBe(false)
	})
})

describe('доступ учеников', () => {
	const rows = [
		{ userId: 'u1', name: 'Анна Петрова', login: 'anna', isActive: true },
		{ userId: 'u2', name: null, login: 'boris', isActive: false },
		{ userId: 'u3', name: 'Вера', login: null, isActive: true },
	]
	const userIds = (list: { userId: string }[]) => list.map((row) => row.userId)

	it('имя, затем логин, затем id', () => {
		expect(rows.map(studentName)).toEqual(['Анна Петрова', 'boris', 'Вера'])
	})

	it('отмеченные статусы: один — фильтр по нему, ни одного или оба — все', () => {
		expect(accessUserStatus(['active'])).toBe('active')
		expect(accessUserStatus(['inactive'])).toBe('inactive')
		expect(accessUserStatus([])).toBe('all')
		expect(accessUserStatus(['active', 'inactive'])).toBe('all')
		expect(accessStatusCounts(rows)).toEqual({ active: 2, inactive: 1 })
	})

	it('фильтр по статусу и поиск по имени или логину без учёта регистра', () => {
		expect(userIds(filterAssignments(rows, '', 'all'))).toEqual(['u1', 'u2', 'u3'])
		expect(userIds(filterAssignments(rows, '', 'active'))).toEqual(['u1', 'u3'])
		expect(userIds(filterAssignments(rows, 'ПЕТРОВА', 'all'))).toEqual(['u1'])
		expect(userIds(filterAssignments(rows, 'bor', 'all'))).toEqual(['u2'])
		expect(userIds(filterAssignments(rows, 'bor', 'active'))).toEqual([])
	})
})

describe('тип вопроса', () => {
	it('название типа из базы, иначе подпись старого типа, иначе код', () => {
		const legacy = { ...question('x', 'radio', 'Текст', 1), questionTypeTitle: '' } as Question
		const unknown = { ...question('y', 'custom', 'Текст', 1), questionTypeTitle: '' } as Question
		expect(questionTypeTitle(QUESTIONS[1])).toBe('Сопоставление')
		expect(questionTypeTitle(legacy)).toBe('Один ответ')
		expect(questionTypeTitle(unknown)).toBe('custom')
	})
})

describe('подписи', () => {
	it('сумма баллов и склонения', () => {
		expect(totalPoints(QUESTIONS)).toBe(4)
		expect(pointsLabel(1)).toBe('1 балл')
		expect(pointsLabel(4)).toBe('4 балла')
		expect(pointsLabel(11)).toBe('11 баллов')
		expect(pointsLabel(51)).toBe('51 балл')
		expect(pointsLabel(1.5)).toBe('1,5 балла')
		expect(questionsCountLabel(1)).toBe('1 вопрос')
		expect(questionsCountLabel(30)).toBe('30 вопросов')
		expect(questionsCountLabel(22)).toBe('22 вопроса')
	})
})

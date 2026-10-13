import { questionPreview } from '@/lib/tests/question-preview'
import { matchesUserStatus, type UserStatus } from '@/lib/users/status-filter'
import { cycleSort, type TableSort, matchesNeedle, searchNeedle, sortRows } from '@/lib/utils/table-sort'

import type { Question } from '../../types'

export type EditorTab = 'questions' | 'access'

export type QuestionSortKey = 'order' | 'text' | 'type' | 'points'

export type QuestionSort = TableSort<QuestionSortKey>

export const DEFAULT_SORT: QuestionSort = { key: 'order', direction: 'asc' }

export type QuestionListEntry = { question: Question; index: number }

const NEW_TEST_PATH = '/admin/tests/new'
const TOPIC_PARAM = 'topic'

export function newTestHref(topicSlug?: string | null): string {
	return topicSlug ? `${NEW_TEST_PATH}?${TOPIC_PARAM}=${encodeURIComponent(topicSlug)}` : NEW_TEST_PATH
}

export function presetTopicSlug(params: { get(name: string): string | null } | null): string | null {
	return params?.get(TOPIC_PARAM) ?? null
}

export function parseEditorTab(value: string | null | undefined, isCreateMode: boolean): EditorTab {
	return !isCreateMode && value === 'access' ? 'access' : 'questions'
}

export function editorTabSearch(tab: EditorTab): string {
	return tab === 'questions' ? '' : `?tab=${tab}`
}

const LEGACY_TYPE_TITLES: Record<string, string> = {
	radio: 'Один ответ',
	checkbox: 'Множественный выбор',
	matching: 'Сопоставление',
	short_answer: 'Краткий ответ',
	sequence: 'Последовательность',
}

function typeKey(question: Question): string {
	return question.questionTypeTitle || LEGACY_TYPE_TITLES[question.type] || question.type
}

export function questionTypeTitle(question: Question): string {
	return typeKey(question)
}

export function questionText(question: Question): string {
	return questionPreview(question.promptText, 2000).text
}

export function filterQuestions(questions: readonly Question[], query: string): QuestionListEntry[] {
	const needle = searchNeedle(query)
	const byNumber = /^\d+$/.test(needle)
	return questions
		.map((question, index) => ({ question, index }))
		.filter(({ question, index }) => {
			if (!needle) return true
			if (byNumber) return String(index + 1) === needle
			return questionText(question).toLocaleLowerCase('ru').includes(needle)
		})
}

function compareEntries(a: QuestionListEntry, b: QuestionListEntry, key: QuestionSortKey): number {
	if (key === 'points') return a.question.points - b.question.points
	if (key === 'text') return questionText(a.question).localeCompare(questionText(b.question), 'ru')
	if (key === 'type') return typeKey(a.question).localeCompare(typeKey(b.question), 'ru')
	return a.index - b.index
}

export function sortEntries(entries: readonly QuestionListEntry[], sort: QuestionSort): QuestionListEntry[] {
	return sortRows(entries, sort, compareEntries)
}

export function nextSort(current: QuestionSort, key: QuestionSortKey): QuestionSort {
	return cycleSort(current, key, DEFAULT_SORT)
}

export function manualOrderAllowed(sort: QuestionSort, query: string): boolean {
	return sort.key === 'order' && sort.direction === 'asc' && query.trim() === ''
}

type AccessRow = { name: string | null; login?: string | null; userId: string; isActive: boolean }

export type AccessStatus = 'active' | 'inactive'

export const ACCESS_STATUSES: readonly AccessStatus[] = ['active', 'inactive']

export function accessUserStatus(selected: readonly AccessStatus[]): UserStatus {
	return selected.length === 1 ? selected[0] : 'all'
}

export function accessStatusCounts(rows: readonly { isActive: boolean }[]): Record<AccessStatus, number> {
	const active = rows.filter((row) => row.isActive).length
	return { active, inactive: rows.length - active }
}

export function filterAssignments<T extends AccessRow>(rows: readonly T[], query: string, status: UserStatus): T[] {
	const needle = searchNeedle(query)
	return rows.filter((row) => matchesUserStatus(row.isActive, status) && matchesNeedle(needle, [row.name, row.login]))
}

export function totalPoints(questions: readonly Question[]): number {
	return questions.reduce((sum, question) => sum + (Number.isFinite(question.points) ? question.points : 0), 0)
}

export function pointsLabel(points: number): string {
	const value = Number.isInteger(points) ? String(points) : points.toLocaleString('ru-RU')
	if (!Number.isInteger(points)) return `${value} балла`
	const mod10 = points % 10
	const mod100 = points % 100
	if (mod10 === 1 && mod100 !== 11) return `${value} балл`
	if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${value} балла`
	return `${value} баллов`
}

export function questionsCountLabel(count: number): string {
	const mod10 = count % 10
	const mod100 = count % 100
	if (mod10 === 1 && mod100 !== 11) return `${count} вопрос`
	if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} вопроса`
	return `${count} вопросов`
}

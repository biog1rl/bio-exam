import { can, type PermissionKey } from '@bio-exam/rbac'

export type TopicTeacher = {
	id: string
	name: string | null
	firstName: string | null
	lastName: string | null
}

export type ToastResult = { kind: 'success' | 'error'; message: string }

export type TopicPageState = 'ok' | 'denied' | 'missing'

export type EmptyBankState = 'teacher-no-topics' | 'admin-empty' | 'has-topics'

export type TestTopicPickerState = 'list' | 'create-first' | 'ask-admin'

export const TOPIC_DENIED_TITLE = 'Нет доступа к теме'
export const TOPIC_DENIED_DESCRIPTION =
	'Тема не закреплена за вами или её не существует. Проверьте адрес или обратитесь к администратору.'
export const TOPICS_BACK_LABEL = 'К темам'

export const NO_TOPICS_KICKER = 'нет тем'
export const NO_TOPICS_TITLE = 'Вам ещё не закреплены темы'
export const NO_TOPICS_DESCRIPTION =
	'Тесты появятся здесь, когда администратор закрепит за вами тему. Обратитесь к администратору.'
export const NO_TOPICS_FOR_TEST = 'Нет тем для теста. Обратитесь к администратору.'

export const TEACHERS_FIELD_LABEL = 'Учителя'
export const TEACHERS_SEARCH_PLACEHOLDER = 'Поиск по имени'
export const TEACHERS_EMPTY =
	'Активных учителей нет. Пригласите пользователя с ролью «Учитель» в разделе «Пользователи».'
export const TEACHERS_HINT = 'Учитель видит тесты темы, создаёт и правит их. Можно выбрать нескольких.'
export const TEACHERS_SAVE_FAILED =
	'Тема сохранена, но учителей закрепить не удалось. Откройте тему и попробуйте ещё раз.'

export const DELETE_TEST_SUCCESS = 'Тест удален'
export const DELETE_TEST_FORBIDDEN = 'Недостаточно прав для этого действия. Обратитесь к администратору.'
export const DELETE_TEST_FAILED = 'Не удалось удалить тест. Попробуйте ещё раз.'

export function canManageCatalog(perms: ReadonlySet<PermissionKey>): boolean {
	return can(perms, 'zone', 'all') && can(perms, 'tests', 'write')
}

export function topicPageState({ topicFound, zoneAll }: { topicFound: boolean; zoneAll: boolean }): TopicPageState {
	if (topicFound) return 'ok'
	return zoneAll ? 'missing' : 'denied'
}

export function emptyBankState({ topics, zoneAll }: { topics: number; zoneAll: boolean }): EmptyBankState {
	if (topics > 0) return 'has-topics'
	return zoneAll ? 'admin-empty' : 'teacher-no-topics'
}

export function testTopicPickerState({
	topics,
	canManage,
}: {
	topics: number
	canManage: boolean
}): TestTopicPickerState {
	if (topics > 0) return 'list'
	return canManage ? 'create-first' : 'ask-admin'
}

export function teacherDisplayName(teacher: TopicTeacher): string {
	const fullName = [teacher.firstName ?? '', teacher.lastName ?? ''].join(' ').trim()
	return fullName || teacher.name || '—'
}

export function teachersCountLabel(count: number): string {
	const mod10 = count % 10
	const mod100 = count % 100
	if (mod10 === 1 && mod100 !== 11) return `${count} учитель`
	if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} учителя`
	return `${count} учителей`
}

export function teachersLine(teachers: readonly TopicTeacher[]): string {
	if (teachers.length === 0) return 'Без учителя'
	if (teachers.length === 1) return `Учитель: ${teacherDisplayName(teachers[0])}`
	return `Учителя: ${teachers.length}`
}

export function topicHeroTeachersLine(teachers: readonly TopicTeacher[]): string {
	if (teachers.length === 0) return 'Учитель не закреплён'
	if (teachers.length === 1) return `Учитель: ${teacherDisplayName(teachers[0])}`
	return `Учителя: ${teachers.map(teacherDisplayName).join(', ')}`
}

export function teacherTriggerLabel(selected: readonly TopicTeacher[]): string {
	if (selected.length === 0) return 'Выберите учителей'
	if (selected.length === 1) return teacherDisplayName(selected[0])
	return teachersCountLabel(selected.length)
}

export function teachersSetChanged(initial: readonly string[], next: readonly string[]): boolean {
	const initialSet = new Set(initial)
	const nextSet = new Set(next)
	if (initialSet.size !== nextSet.size) return true
	for (const id of nextSet) {
		if (!initialSet.has(id)) return true
	}
	return false
}

export function topicSaveOutcome({
	isEditing,
	teachersStatus,
}: {
	isEditing: boolean
	teachersStatus: number | null
}): ToastResult {
	if (teachersStatus !== null && (teachersStatus < 200 || teachersStatus >= 300)) {
		return { kind: 'error', message: TEACHERS_SAVE_FAILED }
	}
	return { kind: 'success', message: isEditing ? 'Тема обновлена' : 'Тема создана' }
}

function errorText(body: unknown): string | null {
	if (!body || typeof body !== 'object' || !('error' in body)) return null
	const value = (body as { error: unknown }).error
	return typeof value === 'string' && value.length > 0 ? value : null
}

export function deleteTestToast(status: number, body?: unknown): ToastResult {
	if (status >= 200 && status < 300) return { kind: 'success', message: DELETE_TEST_SUCCESS }
	if (status === 409) return { kind: 'error', message: errorText(body) ?? DELETE_TEST_FAILED }
	if (status === 403) return { kind: 'error', message: DELETE_TEST_FORBIDDEN }
	return { kind: 'error', message: DELETE_TEST_FAILED }
}

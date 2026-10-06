import { personName } from '../users/person-name'

export const MIN_CANDIDATE_QUERY = 2

export const CANDIDATES_HINT = 'Введите минимум 2 символа'
export const CANDIDATES_EMPTY = 'Никого не найдено. Новых учеников приглашают в разделе «Пользователи».'
export const CANDIDATES_ERROR = 'Не удалось выполнить поиск. Попробуйте ещё раз.'
export const OWNER_HINT = 'Учитель-владелец видит группу и назначает её ученикам тесты своих тем.'
export const ADMINS_OWNER_LABEL = 'Администраторы'
export const TEACHER_GROUPS_EMPTY = 'Групп пока нет. Создайте группу, чтобы приглашать учеников и назначать им тесты.'
export const TEACHER_DELETE_NOTE = 'Ученики группы пропадут из вашего списка, если не состоят в других ваших группах.'

const GENERIC_SAVE_ERROR = 'Не удалось сохранить. Попробуйте ещё раз.'
const FORBIDDEN_ACTION = 'Недостаточно прав для этого действия. Обратитесь к администратору.'
const STUDENTS_ONLY = 'В группу учителя можно добавить только учеников.'

export type GroupOwner = {
	id: string
	name: string | null
	firstName: string | null
	lastName: string | null
}

export type CandidatesState = 'hint' | 'loading' | 'error' | 'empty' | 'list'

export function candidatesState(input: {
	query: string
	debounced: string
	loading: boolean
	error: boolean
	count: number
}): CandidatesState {
	if (input.query.trim().length < MIN_CANDIDATE_QUERY) return 'hint'
	if (input.query.trim() !== input.debounced.trim() || input.loading) return 'loading'
	if (input.error) return 'error'
	return input.count === 0 ? 'empty' : 'list'
}

export function groupSaveErrorText(status?: number): string {
	if (status === 400) return STUDENTS_ONLY
	if (status === 403) return FORBIDDEN_ACTION
	return GENERIC_SAVE_ERROR
}

export function groupSaveDisabled(input: { saving: boolean; editing: boolean; membersReady: boolean }): boolean {
	return input.saving || (input.editing && !input.membersReady)
}

export function groupMembersSeed(input: {
	groupId: string | null
	seededFor: string | null
	response: { id: string; memberIds: string[] }
}): string[] | null {
	if (!input.groupId || input.response.id !== input.groupId || input.seededFor === input.groupId) return null
	return input.response.memberIds
}

export type GroupSavePayload = {
	name: string
	memberIds: string[]
	ownerId?: string | null
}

export function groupSavePayload(input: {
	zoneAll: boolean
	name: string
	memberIds: string[]
	ownerId: string | null
}): GroupSavePayload {
	const payload: GroupSavePayload = { name: input.name.trim(), memberIds: input.memberIds }
	if (input.zoneAll) payload.ownerId = input.ownerId
	return payload
}

export function ownerLabel(owner: GroupOwner | null | undefined): string {
	if (!owner) return ADMINS_OWNER_LABEL
	return personName(owner)
}

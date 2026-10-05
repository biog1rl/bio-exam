export type InviteVariant = 'teacher' | 'admin'

export type InviteGroupOwner = {
	id: string
	name: string | null
	firstName: string | null
	lastName: string | null
}

export type InviteGroup = {
	id: string
	name: string
	owner?: InviteGroupOwner | null
}

type GroupRef = { id: string; name: string }

const GENERIC_INVITE_ERROR = 'Не удалось создать приглашение. Попробуйте ещё раз.'
const FORBIDDEN_ACTION = 'Недостаточно прав для этого действия. Обратитесь к администратору.'
const TEACHER_NO_STUDENTS = 'В ваших группах пока нет учеников. Пригласите ученика или добавьте его в группу.'

function serverErrorText(body: unknown): string | null {
	if (!body || typeof body !== 'object') return null
	const error = (body as Record<string, unknown>).error
	return typeof error === 'string' && error.trim() ? error : null
}

export function inviteErrorText(input: {
	status?: number
	body?: unknown
	network?: boolean
	variant?: InviteVariant
}): string {
	if (input.network) return 'Не удалось связаться с сервером. Проверьте соединение.'
	if (input.status === 400) return 'Проверьте имя, логин и группу.'
	if (input.status === 403) {
		return input.variant === 'teacher' ? 'Нельзя пригласить в эту группу. Выберите свою группу.' : FORBIDDEN_ACTION
	}
	if (input.status === 409) return serverErrorText(input.body) ?? GENERIC_INVITE_ERROR
	return GENERIC_INVITE_ERROR
}

function parseJson(text: string): unknown {
	try {
		return JSON.parse(text)
	} catch {
		return null
	}
}

export function reinviteErrorText(input: { status: number; text: string }): string {
	if (input.status === 403) return FORBIDDEN_ACTION
	if (input.status === 409) return serverErrorText(parseJson(input.text)) ?? (input.text || `HTTP ${input.status}`)
	return input.text || `HTTP ${input.status}`
}

export type InvitePayload = {
	login?: string
	firstName?: string
	lastName?: string
	roleKey?: string
	groupId?: string
}

export function invitePayload(input: {
	variant: InviteVariant
	role: string | null
	groupId: string | null
	login?: string
	firstName?: string
	lastName?: string
}): InvitePayload {
	const payload: InvitePayload = {}
	if (input.login !== undefined) payload.login = input.login
	if (input.firstName !== undefined) payload.firstName = input.firstName
	if (input.lastName !== undefined) payload.lastName = input.lastName
	if (input.variant === 'admin' && input.role) payload.roleKey = input.role
	if (input.groupId) payload.groupId = input.groupId
	return payload
}

export function defaultGroupId(groups: ReadonlyArray<{ id: string }>): string | null {
	return groups.length === 1 ? groups[0].id : null
}

export function defaultRoleKey(traits: ReadonlyArray<{ key: string; groupMember: boolean | null }>): string | null {
	return traits.find((trait) => trait.groupMember === true)?.key ?? null
}

export function showGroupField(groupMember: boolean | null | undefined): boolean {
	return groupMember !== false
}

export function groupsCell(groups: ReadonlyArray<GroupRef>): string {
	if (groups.length === 0) return '—'
	const shown = groups
		.slice(0, 2)
		.map((group) => group.name)
		.join(', ')
	const rest = groups.length - 2
	return rest > 0 ? `${shown} +${rest}` : shown
}

export function groupsTitle(groups: ReadonlyArray<GroupRef>): string {
	return groups.map((group) => group.name).join(', ')
}

export function matchesGroup(row: { groups: ReadonlyArray<GroupRef> }, groupFilter: string): boolean {
	if (groupFilter === 'all') return true
	return row.groups.some((group) => group.id === groupFilter)
}

export function groupOwnerLabel(owner: InviteGroupOwner | null | undefined): string | null {
	if (owner === undefined) return null
	if (owner === null) return 'администраторы'
	const fullName = [owner.firstName ?? '', owner.lastName ?? ''].join(' ').trim()
	return fullName || owner.name || '—'
}

export function groupOptionLabel(group: { name: string; owner?: InviteGroupOwner | null }): string {
	const owner = groupOwnerLabel(group.owner)
	return owner === null ? group.name : `${group.name} · ${owner}`
}

function asNullableString(value: unknown): string | null {
	return typeof value === 'string' ? value : null
}

function parseOwner(value: unknown): InviteGroupOwner | null {
	if (!value || typeof value !== 'object') return null
	const record = value as Record<string, unknown>
	if (typeof record.id !== 'string') return null
	return {
		id: record.id,
		name: asNullableString(record.name),
		firstName: asNullableString(record.firstName),
		lastName: asNullableString(record.lastName),
	}
}

export function parseInviteGroups(body: unknown): InviteGroup[] {
	if (!body || typeof body !== 'object') return []
	const list = (body as Record<string, unknown>).groups
	if (!Array.isArray(list)) return []
	const groups: InviteGroup[] = []
	for (const entry of list) {
		if (!entry || typeof entry !== 'object') continue
		const record = entry as Record<string, unknown>
		if (typeof record.id !== 'string' || typeof record.name !== 'string') continue
		const group: InviteGroup = { id: record.id, name: record.name }
		if ('owner' in record) group.owner = parseOwner(record.owner)
		groups.push(group)
	}
	return groups
}

export function usersEmptyText(input: { searchQuery: string; teacher: boolean; totalRows: number }): string {
	if (input.searchQuery) return 'Пользователи не найдены'
	if (input.teacher && input.totalRows === 0) return TEACHER_NO_STUDENTS
	return 'Нет пользователей'
}

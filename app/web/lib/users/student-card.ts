import { STUDENT_ROLE_KEY } from '@bio-exam/rbac'

import { format, isValid, parseISO } from 'date-fns'
import { ru } from 'date-fns/locale'

import { FORBIDDEN_ACTION_TEXT } from '@/components/users/session-actions'

export type AssignmentAction = 'remove' | 'locked'

export const NOT_YOUR_GROUPS_TEXT = 'Не из ваших групп'

export function isStudentOnly(roles: readonly string[]): boolean {
	return roles.length === 1 && roles[0] === STUDENT_ROLE_KEY
}

export function assignmentAction({ canUnassign }: { canUnassign: boolean }): AssignmentAction {
	return canUnassign === true ? 'remove' : 'locked'
}

export function assignmentErrorText(status: number, fallback = ''): string {
	if (status === 403) return FORBIDDEN_ACTION_TEXT
	return fallback
}

export function studentRowSubtitle({
	canUnassign,
	login,
	name,
}: {
	canUnassign: boolean
	login?: string | null
	name?: string | null
}): string | null {
	if (assignmentAction({ canUnassign }) === 'locked') return NOT_YOUR_GROUPS_TEXT
	return login && name ? login : null
}

export type ContactInput = {
	birthdate: string | null
	telegram: string | null
	phone: string | null
	email: string | null
}

export type ContactRow = {
	label: string
	value: string
	href?: string
}

const EMPTY_VALUE = '—'

function clean(value: string | null): string {
	return typeof value === 'string' ? value.trim() : ''
}

function formatBirthdate(value: string): string {
	const parsed = parseISO(value)
	return isValid(parsed) ? format(parsed, 'dd.MM.yyyy', { locale: ru }) : EMPTY_VALUE
}

export function contactRows(input: ContactInput): ContactRow[] {
	const birthdate = clean(input.birthdate)
	const telegram = clean(input.telegram)
	const phone = clean(input.phone)
	const email = clean(input.email)
	if (!birthdate && !telegram && !phone && !email) return []
	const phoneHref = phone.replace(/[^\d+]/g, '')
	return [
		{ label: 'Дата рождения', value: birthdate ? formatBirthdate(birthdate) : EMPTY_VALUE },
		{ label: 'Telegram', value: telegram || EMPTY_VALUE },
		phone && phoneHref
			? { label: 'Телефон', value: phone, href: `tel:${phoneHref}` }
			: { label: 'Телефон', value: phone || EMPTY_VALUE },
		email ? { label: 'Email', value: email, href: `mailto:${email}` } : { label: 'Email', value: EMPTY_VALUE },
	]
}

export type PersonNameFields = {
	firstName?: string | null
	lastName?: string | null
	name?: string | null
	login?: string | null
}

export function personName(person: PersonNameFields, fallback = '—'): string {
	const fullName = [person.firstName, person.lastName]
		.map((part) => part?.trim() ?? '')
		.filter(Boolean)
		.join(' ')
	return fullName || person.name?.trim() || person.login?.trim() || fallback
}

export function getInitials(firstName?: string | null, lastName?: string | null): string {
	const first = firstName?.charAt(0)?.toUpperCase() || ''
	const last = lastName?.charAt(0)?.toUpperCase() || ''
	return first + last
}

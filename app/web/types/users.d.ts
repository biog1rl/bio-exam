export type UserRow = {
	id: string
	login: string
	firstName: string | null
	lastName: string | null
	name: string | null
	avatar: string | null
	avatarColor: string | null
	initials: string | null
	roles: string[]
	isActive: boolean | 0 | 1
	invitedAt: string | null
	activatedAt: string | null
	createdAt: string
	createdByName: string | null
	position: string | null
	birthdate: string | null
	telegram: string | null
	phone: string | null
	email: string | null
	showInTeam: boolean
}

export type UserRow = {
	id: string
	login: string | null
	firstName: string | null
	lastName: string | null
	name: string | null
	avatar: string | null
	avatarCropped: string | null
	avatarColor: string | null
	initials: string | null
	isActive: boolean
	invitedAt: string | null
	activatedAt: string | null
	createdAt: string
	createdByName: string | null
	roles: string[]
	position: string | null
	birthdate: string | null
	telegram: string | null
	phone: string | null
	email: string | null
	showInTeam: boolean
}

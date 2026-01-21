export type GridRow = {
	dayProjectId: string
	employeeId: string
	employeeName: string
	dayDate: string // YYYY-MM-DD
	projectId: string
	projectKey: string
	projectName: string
	projectColor: string | null
	tasksCount: number
	sortOrder: number
}

export type WorkloadEmployee = {
	id: string
	displayName: string
	userId: string | null
	userFirstName: string | null
	userLastName: string | null
	userName: string | null
	userLogin: string | null
	userAvatar: string | null
	userAvatarCropped: string | null
	userAvatarColor: string | null
	userInitials: string | null
	sortOrder: number | null
}

export type WorkloadCandidate = {
	id: string
	name: string | null
	login: string | null
	roles: string[]
}

export type WorkloadProject = {
	id: string
	key: string
	name: string
	externalId: string | null
	showInWorkload: boolean
	acProjectId: number | null
	acUrlPath: string | null
	color: string | null
	// Вычисляемые поля
	isFromActiveCollab?: boolean
}

export type WorkloadState = {
	employees: WorkloadEmployee[]
	projects: WorkloadProject[]
	grid: GridRow[]
}

export type Task = {
	id: string
	title: string
	description: string | null
	link: string | null
	status: 'planned' | 'in_progress' | 'done' | 'canceled'
	source: 'manual' | 'activecollab'
	externalId: string | null
	externalUrlPath: string | null
	position: number
	createdAt: string
	dayProjectId: string | null
	projectId: string
}

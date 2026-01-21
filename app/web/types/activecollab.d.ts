export interface ActiveCollabProject {
	id: string
	externalId: number
	name: string
	projectNumber: number
	urlPath: string
	isCompleted: boolean
	completedOn: Date | null
	countTasks: number
	countDiscussions: number
	countFiles: number
	countNotes: number
	membersCount: number
	budgetType: string | null
	budget: number | null
	createdOn: Date
	updatedOn: Date
	lastSyncAt: Date
}

export interface ActiveCollabTask {
	id: number
	comments_count: number
	name: string
	body: string
	created_on: number
	updated_on: number
	completed_on?: number
	is_completed: boolean
	priority: number
	assignee?: { id: number; name: string; email: string }
	created_by: { id: number; name: string; email: string }
	task_number: number
	url_path: string
	due_on?: number
	estimated_time?: number
	tracked_time?: number
	labels?: Array<{ id: number; name: string; color: string }>
	subtasks?: ActiveCollabTask[]
	task_list?: { id: number; name: string }
	task_list_id?: number
}

export interface ActiveCollabProjectDetails extends ActiveCollabProject {
	description?: string
	members: Array<{
		id: number
		name: string
		email: string
		role: string
		permissions: string[]
	}>
	budget_details?: {
		budget_type: string
		budget: number
		used_budget: number
		remaining_budget: number
	}
	custom_fields?: Array<{
		name: string
		value: string
		type: string
	}>
}

export interface TasksResponse {
	tasks: ActiveCollabTask[]
	total: number
	page: number
	per_page: number
}

export interface TasksResponseExtras {
	completed_task_ids?: number[]
	task_lists?: TaskListInfo[]
}

export interface CompletedTask {
	single: ActiveCollabTask
	task_list?: TaskListInfo
	subscribers?: number[]
}

export interface TaskListInfo {
	id: number
	name: string
}

// Новые типы для группировки задач по спискам
export interface TaskList {
	id: number
	name: string
	tasks: ActiveCollabTask[]
}

export interface TasksByListResponse {
	taskLists: TaskList[]
	total: number
	page: number
	per_page: number
}

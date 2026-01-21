export interface ActiveCollabProject {
	id: number
	class?: string
	name: string
	project_number: number
	url_path: string

	// Статус завершения
	is_completed: boolean
	completed_on?: number
	completed_by_id?: number
	completed_by_name?: string
	completed_by_email?: string

	// Счетчики
	count_tasks: number
	count_discussions: number
	count_files: number
	count_notes: number
	count_open_tasks?: number
	count_completed_tasks?: number

	// Участники
	members?: number[]
	members_can_change_billable?: boolean

	// Бюджет
	budget_type?: string
	budget?: number
	budgeting_interval?: string

	// Категория и метки
	category_id?: number
	label_id?: number
	label_ids?: number[]

	// Корзина
	is_trashed?: boolean
	trashed_on?: number
	trashed_by_id?: number

	// Создание
	created_on: number
	created_by_id?: number
	created_by_name?: string
	created_by_email?: string

	// Обновление
	updated_on: number
	updated_by_id?: number

	// Описание
	body?: string
	body_formatted?: string

	// Компания и лидер
	company_id?: number
	leader_id?: number
	currency_id?: number

	// Базирование на шаблоне
	based_on_type?: string
	based_on_id?: number

	// Email для уведомлений
	email?: string

	// Настройки трекинга и биллинга
	is_tracking_enabled?: boolean
	is_billable?: boolean
	is_client_reporting_enabled?: boolean

	// Прочее
	is_sample?: boolean
	last_activity_on?: number
	file_size?: number

	// Оценки
	is_estimate_visible_to_subcontractors?: boolean
	task_estimates_enabled?: boolean
	show_task_estimates_to_clients?: boolean

	// Права доступа
	member_permissions?: string

	// Дополнительные данные из детального запроса
	category?: unknown
	hourly_rates?: Record<string, number>
	task_lists?: unknown
	applied_template_ids?: number[]
}

export interface ActiveCollabTask {
	id: number
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
}

export interface ActiveCollabProjectDetails extends Omit<ActiveCollabProject, 'members'> {
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

export interface ActiveCollabApiResponse<T> {
	success: boolean
	data: T
}

export interface TasksResponse {
	tasks: ActiveCollabTask[]
	total: number
	page: number
	per_page: number
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

// Дополнительные поля, которые ActiveCollab может прислать вместе со списком задач
export interface TasksResponseExtras {
	completed_task_ids?: number[]
	task_lists?: Array<{ id: number; name: string }>
}

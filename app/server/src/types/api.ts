/**
 * Типы ответов API
 * Обеспечивает консистентную типизацию для ответов API
 */

/**
 * Обобщённый wrapper для ответов API
 */
export interface ApiResponse<T = unknown> {
	success?: boolean
	data?: T
	error?: string
	details?: unknown
}

/**
 * Успешный ответ с флагом ok
 */
export interface OkResponse {
	ok: true
}

/**
 * Ответ с ошибкой
 */
export interface ErrorResponse {
	error: string
	details?: unknown
}

/**
 * Wrapper для пагинированных ответов
 */
export interface PaginatedResponse<T> {
	items: T[]
	total: number
	page: number
	pageSize: number
	totalPages: number
}

/**
 * Wrapper для списочных ответов (без пагинации)
 */
export interface ListResponse<T> {
	[key: string]: T[]
}

/**
 * Типы для поиска
 */

export interface SearchResult {
	id: string
	title: string
	snippet: string
	href: string
}

export interface TopicResult {
	id: string
	title: string
	description?: string
	href: string
}

export interface FileResult {
	id: string
	title: string
	snippet: string
	href: string
}

export interface UserResult {
	id: string
	name: string
	login: string
	avatar?: string
	position?: string
	href: string
}

// Legacy types (для совместимости)
export interface ContentHit {
	id: string
	title: string
	snippet: string
	href: string
	rel?: string
}

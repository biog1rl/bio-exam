/**
 * API для поиска (заглушки для будущей интеграции с Supabase)
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

/**
 * Поиск по темам (заглушка)
 * TODO: Интегрировать с Supabase
 */
export async function searchTopics(query: string, limit: number = 10): Promise<TopicResult[]> {
	console.log('Search topics:', query, 'limit:', limit)
	// Заглушка - в будущем здесь будет запрос к Supabase
	return []
}

/**
 * Поиск по содержимому файлов (заглушка)
 * TODO: Интегрировать с Supabase
 */
export async function searchFiles(query: string, limit: number = 10): Promise<FileResult[]> {
	console.log('Search files:', query, 'limit:', limit)
	// Заглушка - в будущем здесь будет запрос к Supabase
	return []
}

/**
 * Поиск пользователей (заглушка)
 * TODO: Интегрировать с Supabase или использовать существующий API
 */
export async function searchUsers(query: string, limit: number = 10): Promise<UserResult[]> {
	console.log('Search users:', query, 'limit:', limit)
	// Заглушка - можно использовать существующий /api/users с фильтрацией
	return []
}

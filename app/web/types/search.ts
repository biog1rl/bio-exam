export type SearchScope = 'all' | 'tests' | 'questions' | 'users' | 'groups' | 'attempts'
export type SearchResultType = 'topic' | 'test' | 'question' | 'user' | 'group' | 'attempt'

export interface SearchResultItem {
	type: SearchResultType
	id: string
	title: string
	subtitle: string
	snippetHtml: string
	href: string
	score: number
}

export interface SearchCategory {
	scope: Exclude<SearchScope, 'all'>
	title: string
	available: boolean
	items: SearchResultItem[]
}

export interface SearchResponse {
	query: string
	categories: SearchCategory[]
	total: number
}

// Legacy types kept for older result components that are no longer used by SearchDialog.
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
	href: string
}

export interface ContentHit {
	id: string
	title: string
	snippet: string
	href: string
	rel?: string
}

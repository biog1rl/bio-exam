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

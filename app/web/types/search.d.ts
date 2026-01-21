export type ContentHit = {
	id: string
	title: string
	href: string
	rel: string
	snippet: string
	score: number
}

export type FlatNode = {
	id: string
	label: string
	path: string
	href?: string | null
	kind: 'file' | 'dir'
}

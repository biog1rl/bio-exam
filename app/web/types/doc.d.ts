export type DocNode = {
	name: string
	path: string
	title?: string
	children?: DocNode[]
	isDirectory?: boolean
	fsPath?: string
	hasChildren?: boolean
	hasIndex?: boolean
	isLoading?: boolean
}

export type SidebarNode = DocNode & {
	children?: SidebarNode[]
	isLoading?: boolean
	href?: string | null // целевой файл (index) если есть
	hrefSlug?: string | null // slug файла (без /docs)
	folderSlug?: string // slug папки для /docs/<folder>
	segmentSlug?: string // slug последнего сегмента
}

export type Visibility = 'public' | 'private'

export type EntryApi = {
	kind: 'dir' | 'file'
	path: string
	slug: string
	slugPath: string
	name: string
	title?: string
	hasChildren?: boolean
	hasIndex?: boolean
	visibility?: Visibility
	children?: EntryApi[]
}

export type FolderInfoApi = {
	name: string
	path: string
	title?: string
	hasIndex?: boolean
	hasChildren?: boolean
	slugPath?: string
}

export type FolderResponse = {
	entries: EntryApi[]
	info?: FolderInfoApi
	introSlug: string | null
}

export type FolderItem =
	| {
			kind: 'dir'
			rel: string
			slug: string
			slugPath: string
			name: string
			title?: string
			hasChildren: boolean
	  }
	| {
			kind: 'file'
			rel: string
			slug: string
			slugPath: string
			name: string
			title: string
			visibility: Visibility
	  }

export type LoadedDoc = {
	content: string
	frontmatter?: Frontmatter
	canEdit?: boolean
	canManageAccess?: boolean
}

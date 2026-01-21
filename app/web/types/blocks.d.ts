export type HeadingBlock = {
	id: string
	type: 'heading'
	level: 1 | 2 | 3
	text: string
}

export type ParagraphBlock = {
	id: string
	type: 'paragraph'
	text: string
}

export type ImageBlock = {
	id: string
	type: 'image'
	src: string
	alt: string
}

export type CodeBlock = {
	id: string
	type: 'code'
	lang: string
	value: string
}

export type ListBlock = {
	id: string
	type: 'list'
	ordered: boolean
	items: string[]
}

export type CalloutBlock = {
	id: string
	type: 'callout'
	tone: 'info' | 'warn' | 'success' | 'danger'
	text: string
}

export type DividerBlock = {
	id: string
	type: 'divider'
}

export type Block = HeadingBlock | ParagraphBlock | ImageBlock | CodeBlock | ListBlock | CalloutBlock | DividerBlock

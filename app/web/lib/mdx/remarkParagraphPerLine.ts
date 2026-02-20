type TextNode = {
	type: 'text'
	value: string
}

type ParagraphNode = {
	type: 'paragraph'
	children: unknown[]
}

type ParentNode = {
	children?: unknown[]
}

function isParagraphNode(node: unknown): node is ParagraphNode {
	return Boolean(node && typeof node === 'object' && (node as { type?: string }).type === 'paragraph')
}

function isTextNode(node: unknown): node is TextNode {
	return Boolean(node && typeof node === 'object' && (node as { type?: string }).type === 'text')
}

function splitParagraphBySoftBreaks(paragraph: ParagraphNode): ParagraphNode[] {
	const parts: ParagraphNode[] = []
	let currentChildren: unknown[] = []

	const pushCurrent = () => {
		if (currentChildren.length === 0) return
		parts.push({ type: 'paragraph', children: currentChildren })
		currentChildren = []
	}

	for (const child of paragraph.children) {
		if (!isTextNode(child) || !child.value.includes('\n')) {
			currentChildren.push(child)
			continue
		}

		const lines = child.value.split(/\r?\n/)
		lines.forEach((line, index) => {
			if (line.length > 0) {
				currentChildren.push({ type: 'text', value: line })
			}
			if (index < lines.length - 1) {
				pushCurrent()
			}
		})
	}

	pushCurrent()
	return parts.length > 0 ? parts : [paragraph]
}

function transformNode(node: unknown): void {
	if (!node || typeof node !== 'object') return
	const parent = node as ParentNode
	if (!Array.isArray(parent.children)) return

	const nextChildren: unknown[] = []

	for (const child of parent.children) {
		if (isParagraphNode(child)) {
			nextChildren.push(...splitParagraphBySoftBreaks(child))
		} else {
			nextChildren.push(child)
		}
		transformNode(child)
	}

	parent.children = nextChildren
}

export default function remarkParagraphPerLine() {
	return (tree: unknown) => {
		transformNode(tree)
	}
}

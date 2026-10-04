import type { Root } from 'mdast'
import { SKIP, visit } from 'unist-util-visit'

type MdxJsxAttributeLike = { type: string; name?: string }

type MdxJsxElement = {
	type: 'mdxJsxFlowElement' | 'mdxJsxTextElement'
	name?: string | null
	attributes?: MdxJsxAttributeLike[]
}

type ParentLike = { children: unknown[] }

function isMdxJsxElement(node: unknown): node is MdxJsxElement {
	return (
		typeof node === 'object' &&
		node !== null &&
		'type' in node &&
		((node as { type: string }).type === 'mdxJsxFlowElement' || (node as { type: string }).type === 'mdxJsxTextElement')
	)
}

function isUnsafeAttribute(attribute: MdxJsxAttributeLike): boolean {
	if (attribute.type !== 'mdxJsxAttribute' || typeof attribute.name !== 'string') return false
	const name = attribute.name.toLowerCase()
	return name === 'srcdoc' || name.startsWith('on')
}

export default function remarkStripUnsafeJsx() {
	return (tree: Root) => {
		visit(tree, (node, index, parent) => {
			if (!isMdxJsxElement(node)) return

			if (typeof node.name === 'string' && node.name.toLowerCase() === 'script') {
				if (parent && typeof index === 'number') {
					;(parent as ParentLike).children.splice(index, 1)
					return [SKIP, index]
				}
				return
			}

			if (Array.isArray(node.attributes)) {
				node.attributes = node.attributes.filter((attribute) => !isUnsafeAttribute(attribute))
			}
		})
	}
}

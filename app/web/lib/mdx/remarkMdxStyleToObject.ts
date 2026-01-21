import type { Root } from 'mdast'
import styleToObject from 'style-to-object'
import { visit } from 'unist-util-visit'

// --- типы узлов MDX ---
type MdxJsxAttributeValueExpression = {
	type: 'mdxJsxAttributeValueExpression'
	value: string
}

type MdxJsxAttribute = {
	type: 'mdxJsxAttribute'
	name: string
	value?: string | MdxJsxAttributeValueExpression | null
}

type MdxJsxExpressionAttribute = {
	type: 'mdxJsxExpressionAttribute'
	value: string
}

type AnyMdxAttribute = MdxJsxAttribute | MdxJsxExpressionAttribute

type MdxJsxElement = {
	type: 'mdxJsxFlowElement' | 'mdxJsxTextElement'
	attributes?: AnyMdxAttribute[]
}

// --- type guards ---
function isMdxJsxElement(node: unknown): node is MdxJsxElement {
	return (
		!!node &&
		typeof (node as { type?: string }).type === 'string' &&
		['mdxJsxFlowElement', 'mdxJsxTextElement'].includes((node as { type: string }).type)
	)
}

function isStringAttribute(attr: AnyMdxAttribute | undefined): attr is MdxJsxAttribute & { value: string } {
	return !!attr && attr.type === 'mdxJsxAttribute' && typeof attr.value === 'string'
}

// --- плагин ---
export default function remarkMdxStyleToObject() {
	return (tree: Root) => {
		visit(tree, (node) => {
			if (!isMdxJsxElement(node) || !Array.isArray(node.attributes)) return

			const idx = node.attributes.findIndex((a) => isStringAttribute(a) && a.name === 'style')
			if (idx === -1) return

			const styleAttr = node.attributes[idx]
			if (!isStringAttribute(styleAttr)) return

			const styleStr = styleAttr.value
			const obj: Record<string, string> = {}

			styleToObject(styleStr, (name, value) => {
				const camel = name.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
				obj[camel] = value
			})

			node.attributes[idx] = {
				type: 'mdxJsxAttribute',
				name: 'style',
				value: {
					type: 'mdxJsxAttributeValueExpression',
					value: JSON.stringify(obj),
				},
			}
		})
	}
}

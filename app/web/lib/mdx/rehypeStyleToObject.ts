import type { Root, Element } from 'hast'
import styleToObject from 'style-to-object'
import { visit } from 'unist-util-visit'

export default function rehypeStyleToObject() {
	return (tree: Root): void => {
		visit(tree, 'element', (node: Element) => {
			const style = node.properties?.style

			if (typeof style === 'string') {
				const obj: Record<string, string> = {}

				styleToObject(style, (name: string, value: string) => {
					const camel = name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
					obj[camel] = value
				})

				// безопасно уточняем тип для properties
				;(node.properties as Record<string, unknown>).style = obj
			}
		})
	}
}

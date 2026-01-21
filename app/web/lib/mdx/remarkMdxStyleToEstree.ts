import type { Program, ExpressionStatement, ObjectExpression, Property, Identifier, Literal } from 'estree'
import type { Root } from 'mdast'
import styleToObject from 'style-to-object'
import { visit } from 'unist-util-visit'

type MdxJsxAttribute =
	| { type: 'mdxJsxAttribute'; name: string; value?: string }
	| {
			type: 'mdxJsxAttribute'
			name: string
			value?: { type: 'mdxJsxAttributeValueExpression'; value?: string; data?: { estree?: Program } }
	  }

type MdxJsxElement = {
	type: 'mdxJsxFlowElement' | 'mdxJsxTextElement'
	attributes?: MdxJsxAttribute[]
}

function isMdxJsxElement(node: unknown): node is MdxJsxElement {
	return (
		typeof node === 'object' &&
		node !== null &&
		'type' in node &&
		((node as { type: string }).type === 'mdxJsxFlowElement' || (node as { type: string }).type === 'mdxJsxTextElement')
	)
}

function camelize(cssProp: string): string {
	return cssProp.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
}

export default function remarkMdxStyleToEstree() {
	return (tree: Root) => {
		visit(tree, (node) => {
			if (!isMdxJsxElement(node) || !Array.isArray(node.attributes)) return

			const idx = node.attributes.findIndex(
				(a) =>
					a?.type === 'mdxJsxAttribute' && a.name === 'style' && typeof (a as { value?: unknown }).value === 'string'
			)
			if (idx === -1) return

			const styleStr = (node.attributes[idx] as Extract<MdxJsxAttribute, { value?: string }>).value ?? ''
			if (!styleStr.trim()) return

			// Собираем объект стилей
			const entries: Array<[key: string, value: string]> = []
			styleToObject(styleStr, (name, value) => {
				const clean = String(value).replace(/\s*!important\s*$/i, '')
				entries.push([camelize(name), clean])
			})

			// Преобразуем в ESTree: { textAlign: "center", fontWeight: "700" }
			const properties: Property[] = entries.map<Property>(([key, val]) => {
				// ключ как идентификатор, если допустим; иначе — Literal
				const idRegex = /^[A-Za-z$_][A-Za-z0-9$_]*$/
				const keyNode: Identifier | Literal = idRegex.test(key)
					? ({ type: 'Identifier', name: key } as Identifier)
					: ({ type: 'Literal', value: key } as Literal)

				return {
					type: 'Property',
					key: keyNode,
					kind: 'init',
					method: false,
					shorthand: false,
					computed: false,
					value: { type: 'Literal', value: val } as Literal,
				}
			})

			const objectExpression: ObjectExpression = {
				type: 'ObjectExpression',
				properties,
			}

			const exprStmt: ExpressionStatement = {
				type: 'ExpressionStatement',
				expression: objectExpression,
			}

			const program: Program = {
				type: 'Program',
				sourceType: 'module',
				body: [exprStmt],
			}

			// Заменяем строковый style на выражение с ESTree
			node.attributes[idx] = {
				type: 'mdxJsxAttribute',
				name: 'style',
				value: {
					type: 'mdxJsxAttributeValueExpression',
					value: '', // не нужен, используем estree
					data: { estree: program },
				},
			}
		})
	}
}

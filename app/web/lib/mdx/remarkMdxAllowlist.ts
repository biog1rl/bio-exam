import type { Root } from 'mdast'
import styleToObject from 'style-to-object'
import { SKIP, visit } from 'unist-util-visit'

type MdxJsxAttributeLike = { type: string; name?: string; value?: unknown }

type SafeAttribute = { type: 'mdxJsxAttribute'; name: string; value: string }

type MdxJsxElement = {
	type: 'mdxJsxFlowElement' | 'mdxJsxTextElement'
	name?: string | null
	attributes?: MdxJsxAttributeLike[]
	children?: unknown[]
}

type UrlNode = {
	type: 'link' | 'image' | 'definition'
	url: string
	children?: unknown[]
}

type ParentLike = { children: unknown[] }

const ALLOWED_ELEMENTS = new Set([
	'p',
	'span',
	'div',
	'br',
	'b',
	'strong',
	'i',
	'em',
	'u',
	's',
	'del',
	'ins',
	'sub',
	'sup',
	'mark',
	'small',
	'code',
	'pre',
	'kbd',
	'img',
	'a',
	'ul',
	'ol',
	'li',
	'table',
	'thead',
	'tbody',
	'tfoot',
	'tr',
	'th',
	'td',
	'caption',
	'colgroup',
	'col',
	'blockquote',
	'hr',
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'tweet',
])

const DROPPED_WITH_CONTENT = new Set([
	'script',
	'style',
	'svg',
	'math',
	'noscript',
	'template',
	'iframe',
	'frame',
	'frameset',
	'object',
	'embed',
	'applet',
	'base',
	'meta',
	'link',
	'head',
	'title',
	'textarea',
	'select',
	'option',
	'audio',
	'video',
	'source',
	'track',
	'canvas',
	'dialog',
	'xmp',
	'plaintext',
	'listing',
	'noembed',
	'noframes',
])

const GLOBAL_ATTRIBUTES = new Set(['style', 'title', 'align', 'dir', 'lang'])

const ELEMENT_ATTRIBUTES: Record<string, Set<string>> = {
	a: new Set(['href']),
	img: new Set(['src', 'alt', 'width', 'height']),
	td: new Set(['colspan', 'rowspan']),
	th: new Set(['colspan', 'rowspan']),
	col: new Set(['span']),
	ol: new Set(['start']),
	li: new Set(['value']),
	tweet: new Set(['id']),
}

const CANONICAL_ATTRIBUTES: Record<string, string> = { colspan: 'colSpan', rowspan: 'rowSpan' }

const VOID_ELEMENTS = new Set(['img', 'br', 'hr', 'col'])

const SAFE_SCHEMES = new Set(['http:', 'https:', 'mailto:', 'tel:'])

const DATA_IMAGE = /^data:image\/(png|jpe?g|gif|webp);/

const BLOCKED_STYLE_PROPERTIES = new Set(['position', 'behavior', '-moz-binding'])

const ALLOWED_STYLE_FUNCTIONS = new Set([
	'rgb',
	'rgba',
	'hsl',
	'hsla',
	'hwb',
	'lab',
	'lch',
	'oklab',
	'oklch',
	'color-mix',
	'calc',
	'min',
	'max',
	'clamp',
	'var',
	'linear-gradient',
	'radial-gradient',
	'conic-gradient',
	'repeating-linear-gradient',
	'repeating-radial-gradient',
])

const STRIPPED_NODES = new Set(['html', 'mdxjsEsm', 'mdxFlowExpression', 'mdxTextExpression'])

function isMdxJsxElement(node: unknown): node is MdxJsxElement {
	return (
		typeof node === 'object' &&
		node !== null &&
		'type' in node &&
		((node as { type: string }).type === 'mdxJsxFlowElement' || (node as { type: string }).type === 'mdxJsxTextElement')
	)
}

function isUrlNode(node: unknown): node is UrlNode {
	if (typeof node !== 'object' || node === null || !('type' in node)) return false
	const type = (node as { type: string }).type
	return type === 'link' || type === 'image' || type === 'definition'
}

function isStrippedNode(node: unknown): boolean {
	return (
		typeof node === 'object' && node !== null && 'type' in node && STRIPPED_NODES.has((node as { type: string }).type)
	)
}

function removeControlCharacters(value: string): string {
	let result = ''
	for (const char of value) {
		const code = char.charCodeAt(0)
		if (code <= 0x20 || (code >= 0x7f && code <= 0x9f)) continue
		result += char
	}
	return result
}

function isSafeUrl(raw: string, allowDataImage: boolean): boolean {
	const value = removeControlCharacters(raw).toLowerCase()
	const scheme = value.match(/^([a-z][a-z0-9+.-]*:)/)
	if (!scheme) return true
	if (SAFE_SCHEMES.has(scheme[1])) return true
	return allowDataImage && DATA_IMAGE.test(value)
}

function isSafeStyleValue(value: string): boolean {
	if (/[\\<>@]|\/\*|javascript:|expression/i.test(value)) return false
	for (const call of value.matchAll(/([a-z-]*)\s*\(/gi)) {
		if (call[1] && !ALLOWED_STYLE_FUNCTIONS.has(call[1].toLowerCase())) return false
	}
	return true
}

function sanitizeStyle(raw: string): string {
	const declarations: string[] = []
	try {
		styleToObject(raw, (name, value) => {
			const property = name.trim().toLowerCase()
			const cleanValue = String(value).trim()
			if (!/^-?[a-z][a-z-]*$/.test(property) || BLOCKED_STYLE_PROPERTIES.has(property)) return
			if (!cleanValue || !isSafeStyleValue(cleanValue)) return
			declarations.push(`${property}: ${cleanValue}`)
		})
	} catch {
		return ''
	}
	return declarations.join('; ')
}

function sanitizeAttributes(element: string, attributes: MdxJsxAttributeLike[]): SafeAttribute[] {
	const own = ELEMENT_ATTRIBUTES[element]
	const result: SafeAttribute[] = []
	for (const attribute of attributes) {
		if (attribute.type !== 'mdxJsxAttribute' || typeof attribute.name !== 'string') continue
		if (typeof attribute.value !== 'string') continue
		const name = attribute.name.toLowerCase()
		if (!GLOBAL_ATTRIBUTES.has(name) && own?.has(name) !== true) continue
		let value = attribute.value
		if (name === 'href' && !isSafeUrl(value, false)) continue
		if (name === 'src' && !isSafeUrl(value, element === 'img')) continue
		if (element === 'tweet' && name === 'id' && !/^\d+$/.test(value)) continue
		if (name === 'style') {
			value = sanitizeStyle(value)
			if (!value) continue
		}
		result.push({ type: 'mdxJsxAttribute', name: CANONICAL_ATTRIBUTES[name] ?? name, value })
	}
	return result
}

export default function remarkMdxAllowlist() {
	return (tree: Root) => {
		visit(tree, (visited, index, parent) => {
			if (!parent || typeof index !== 'number') return
			const siblings = (parent as ParentLike).children
			const node: unknown = visited

			if (isStrippedNode(node)) {
				siblings.splice(index, 1)
				return [SKIP, index]
			}

			if (isUrlNode(node)) {
				if (isSafeUrl(node.url, node.type === 'image')) return
				if (node.type === 'definition') {
					node.url = ''
					return
				}
				siblings.splice(index, 1, ...(node.type === 'link' ? (node.children ?? []) : []))
				return [SKIP, index]
			}

			if (!isMdxJsxElement(node)) return

			if (typeof node.name !== 'string') {
				node.attributes = []
				return
			}

			const name = node.name.toLowerCase()
			if (!ALLOWED_ELEMENTS.has(name)) {
				const dropContent = DROPPED_WITH_CONTENT.has(name) || /[:.]/.test(name)
				siblings.splice(index, 1, ...(dropContent ? [] : (node.children ?? [])))
				return [SKIP, index]
			}

			node.name = name
			if (VOID_ELEMENTS.has(name)) node.children = []
			node.attributes = sanitizeAttributes(name, node.attributes ?? [])
		})
	}
}

import { parseStorageLink } from '../storage/links.js'

const MARKDOWN_IMAGE = /!\[[^\]]*\]\(\s*(?:<([^>]*)>|([^\s)]+))(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/g
const HTML_IMAGE =
	/<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*"([^"]*)"\s*\}|\{\s*'([^']*)'\s*\}|\{\s*`([^`$]*)`\s*\})/gi

type LexicalNode = Record<string, unknown>

function isNode(value: unknown): value is LexicalNode {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function lexicalSources(text: string): string[] | null {
	const trimmed = text.trim()
	if (!trimmed.startsWith('{')) return null
	let parsed: unknown
	try {
		parsed = JSON.parse(trimmed)
	} catch {
		return null
	}
	if (!isNode(parsed)) return null
	const sources: string[] = []
	const seen = new Set<LexicalNode>()
	const walk = (node: LexicalNode) => {
		if (seen.has(node)) return
		seen.add(node)
		if (node.type === 'image' && typeof node.src === 'string') sources.push(node.src)
		if (Array.isArray(node.children)) {
			for (const child of node.children) if (isNode(child)) walk(child)
		}
		if (isNode(node.root)) walk(node.root)
	}
	walk(parsed)
	return sources
}

function textSources(text: string): string[] {
	const sources: string[] = []
	for (const match of text.matchAll(MARKDOWN_IMAGE)) {
		const src = match[1] ?? match[2]
		if (src !== undefined) sources.push(src)
	}
	for (const match of text.matchAll(HTML_IMAGE)) {
		const src = match.slice(1).find((value) => value !== undefined)
		if (src !== undefined) sources.push(src)
	}
	return sources
}

export function extractAssetRefs(text: string | null | undefined): string[] {
	if (typeof text !== 'string' || text.length === 0) return []
	const sources = lexicalSources(text) ?? textSources(text)
	const keys = new Set<string>()
	for (const source of sources) {
		const link = parseStorageLink(source)
		if (link.kind === 'key') keys.add(link.key)
	}
	return [...keys].sort()
}

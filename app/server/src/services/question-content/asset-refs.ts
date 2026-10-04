import { parseStorageLink, type StorageLink } from '../storage/links.js'

const MARKDOWN_IMAGE = /!\[[^[]*?\]\(\s*(?:<([^>]*)>|([^\s)]+))(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/g
const HTML_IMAGE =
	/<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*"([^"]*)"\s*\}|\{\s*'([^']*)'\s*\}|\{\s*`([^`$]*)`\s*\})/gi

const HTTP_URL = /^https?:\/\//i
const SUPABASE_PUBLIC_PATH = /\/storage\/v1\/object\/public\//
const PROXY_PATH = '/api/docs/assets/proxy'

export type AssetLinkForm =
	| 'key'
	| 'supabase-public'
	| 'supabase-sign'
	| 'uploads-images'
	| 'uploads-tests'
	| 'uploads-other'
	| 'proxy-url'
	| 'external'
	| 'invalid'

export type AssetLinkSource = 'markdown' | 'html' | 'lexical'

export type AssetLink = {
	src: string
	source: AssetLinkSource
	form: AssetLinkForm
	key: string | null
}

type SourceRef = { src: string; source: AssetLinkSource }

type LexicalNode = Record<string, unknown>

function isNode(value: unknown): value is LexicalNode {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function lexicalSources(text: string): SourceRef[] | null {
	const trimmed = text.trim()
	if (!trimmed.startsWith('{')) return null
	let parsed: unknown
	try {
		parsed = JSON.parse(trimmed)
	} catch {
		return null
	}
	if (!isNode(parsed)) return null
	const sources: SourceRef[] = []
	const seen = new Set<LexicalNode>()
	const walk = (node: LexicalNode) => {
		if (seen.has(node)) return
		seen.add(node)
		if (node.type === 'image' && typeof node.src === 'string') sources.push({ src: node.src, source: 'lexical' })
		if (Array.isArray(node.children)) {
			for (const child of node.children) if (isNode(child)) walk(child)
		}
		if (isNode(node.root)) walk(node.root)
	}
	walk(parsed)
	return sources
}

function textSources(text: string): SourceRef[] {
	const sources: SourceRef[] = []
	for (const match of text.matchAll(MARKDOWN_IMAGE)) {
		const src = match[1] ?? match[2]
		if (src !== undefined) sources.push({ src, source: 'markdown' })
	}
	for (const match of text.matchAll(HTML_IMAGE)) {
		const src = match.slice(1).find((value) => value !== undefined)
		if (src !== undefined) sources.push({ src, source: 'html' })
	}
	return sources
}

function uploadsForm(rest: string): AssetLinkForm {
	if (rest.startsWith('images/')) return 'uploads-images'
	if (rest.startsWith('tests/')) return 'uploads-tests'
	return 'uploads-other'
}

function isProxyUrl(value: string): boolean {
	try {
		return new URL(value).pathname === PROXY_PATH
	} catch {
		return false
	}
}

function linkForm(src: string, link: StorageLink): AssetLinkForm {
	if (link.kind === 'invalid') return 'invalid'
	if (link.kind === 'external') return 'external'
	const value = src.trim()
	if (HTTP_URL.test(value)) {
		if (isProxyUrl(value)) return 'proxy-url'
		return SUPABASE_PUBLIC_PATH.test(value) ? 'supabase-public' : 'supabase-sign'
	}
	if (value.startsWith(PROXY_PATH)) return 'proxy-url'
	if (value.startsWith('/uploads/')) return uploadsForm(value.slice('/uploads/'.length))
	if (value.startsWith('uploads/')) return uploadsForm(value.slice('uploads/'.length))
	return 'key'
}

export function extractAssetLinks(text: string | null | undefined): AssetLink[] {
	if (typeof text !== 'string' || text.length === 0) return []
	const sources = lexicalSources(text) ?? textSources(text)
	return sources.map(({ src, source }) => {
		const link = parseStorageLink(src)
		return { src, source, form: linkForm(src, link), key: link.kind === 'key' ? link.key : null }
	})
}

export function extractAssetRefs(text: string | null | undefined): string[] {
	const keys = new Set<string>()
	for (const link of extractAssetLinks(text)) {
		if (link.key !== null) keys.add(link.key)
	}
	return [...keys].sort()
}

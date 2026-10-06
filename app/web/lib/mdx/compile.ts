import { serialize } from 'next-mdx-remote/serialize'
import rehypeRaw from 'rehype-raw'
import remarkGfm from 'remark-gfm'

import rehypeStyleToObject from '@/lib/mdx/rehypeStyleToObject'
import remarkMdxAllowlist from '@/lib/mdx/remarkMdxAllowlist'
import remarkMdxStyleToEstree from '@/lib/mdx/remarkMdxStyleToEstree'
import remarkParagraphPerLine from '@/lib/mdx/remarkParagraphPerLine'

const MDX_PASS = [
	'mdxjsEsm',
	'mdxFlowExpression',
	'mdxTextExpression',
	'mdxJsxFlowElement',
	'mdxJsxTextElement',
] as const

function buildMdxOptions() {
	return {
		mdxOptions: {
			remarkPlugins: [remarkMdxAllowlist, remarkGfm, remarkParagraphPerLine] as import('unified').Pluggable[],
			rehypePlugins: [
				[rehypeRaw, { passThrough: MDX_PASS }],
				remarkMdxStyleToEstree,
				rehypeStyleToObject,
			] as import('unified').Pluggable[],
		},
	}
}

type Fence = {
	character: string
	length: number
}

function normalizeMdxSource(source: string): string {
	let fence: Fence | null = null

	return source
		.split('\n')
		.map((line) => {
			const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/)
			if (fenceMatch) {
				const marker = fenceMatch[1]
				if (!fence) {
					fence = { character: marker[0], length: marker.length }
				} else if (marker[0] === fence.character && marker.length >= fence.length) {
					fence = null
				}
				return line
			}

			if (fence) return line
			return line.replace(/^([ \t]{0,3}\d+)\)([ \t\p{Zs}]+)/u, '$1\\)$2')
		})
		.join('\n')
}

const MARKDOWN_INLINE_IMAGE = /!\[[^\]]*\]\(\s*data:image\/[^)]*\)/g
const HTML_INLINE_IMAGE = /<img\b[^>]*\bsrc\s*=\s*["']data:image\/[^"']*["'][^>]*>/gi
const INLINE_IMAGE_URI = /data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/]+=*/gi

export function mdxFallbackText(source: string): string {
	return source.replace(MARKDOWN_INLINE_IMAGE, '').replace(HTML_INLINE_IMAGE, '').replace(INLINE_IMAGE_URI, '')
}

export function prepareMdxSource(source: string | null | undefined): string {
	return normalizeMdxSource((source ?? '').trim())
}

export function compileMdx(prepared: string) {
	return serialize(prepared, buildMdxOptions())
}

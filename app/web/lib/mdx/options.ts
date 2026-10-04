import rehypeRaw from 'rehype-raw'
import remarkGfm from 'remark-gfm'

import rehypeStyleToObject from '@/lib/mdx/rehypeStyleToObject'
import remarkMdxStyleToEstree from '@/lib/mdx/remarkMdxStyleToEstree'
import remarkParagraphPerLine from '@/lib/mdx/remarkParagraphPerLine'
import remarkStripUnsafeJsx from '@/lib/mdx/remarkStripUnsafeJsx'

export const MDX_PASS = [
	'mdxjsEsm',
	'mdxFlowExpression',
	'mdxTextExpression',
	'mdxJsxFlowElement',
	'mdxJsxTextElement',
] as const

export function buildMdxOptions() {
	return {
		mdxOptions: {
			remarkPlugins: [remarkStripUnsafeJsx, remarkGfm, remarkParagraphPerLine] as import('unified').Pluggable[],
			rehypePlugins: [
				[rehypeRaw, { passThrough: MDX_PASS }],
				remarkMdxStyleToEstree,
				rehypeStyleToObject,
			] as import('unified').Pluggable[],
		},
	}
}

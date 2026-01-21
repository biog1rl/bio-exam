import rehypeRaw from 'rehype-raw'
import remarkGfm from 'remark-gfm'

import rehypeStyleToObject from '@/lib/mdx/rehypeStyleToObject'
import remarkMdxStyleToEstree from '@/lib/mdx/remarkMdxStyleToEstree'

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
			remarkPlugins: [remarkGfm, remarkMdxStyleToEstree] as import('unified').Pluggable[],
			rehypePlugins: [[rehypeRaw, { passThrough: MDX_PASS }], rehypeStyleToObject] as import('unified').Pluggable[],
		},
	}
}

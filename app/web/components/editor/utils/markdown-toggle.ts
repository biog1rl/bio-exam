import { $createCodeNode, $isCodeNode } from '@lexical/code'
import {
	$convertFromMarkdownString,
	$convertToMarkdownString,
	CHECK_LIST,
	ELEMENT_TRANSFORMERS,
	MULTILINE_ELEMENT_TRANSFORMERS,
	TEXT_FORMAT_TRANSFORMERS,
	TEXT_MATCH_TRANSFORMERS,
	type Transformer,
} from '@lexical/markdown'

import { $createTextNode, $getRoot } from 'lexical'

import { AUTOCOMPLETE } from '@/components/editor/transformers/markdown-autocomplete-transformer'
import { EMOJI } from '@/components/editor/transformers/markdown-emoji-transformer'
import { HR } from '@/components/editor/transformers/markdown-hr-transformer'
import { IMAGE, IMAGE_HTML } from '@/components/editor/transformers/markdown-image-transformer'
import { TABLE } from '@/components/editor/transformers/markdown-table-transformer'
import { TWEET } from '@/components/editor/transformers/markdown-tweet-transformer'

export const TOGGLE_TRANSFORMERS: Array<Transformer> = [
	TABLE,
	HR,
	IMAGE_HTML,
	IMAGE,
	AUTOCOMPLETE,
	EMOJI,
	TWEET,
	CHECK_LIST,
	...ELEMENT_TRANSFORMERS,
	...MULTILINE_ELEMENT_TRANSFORMERS,
	...TEXT_FORMAT_TRANSFORMERS,
	...TEXT_MATCH_TRANSFORMERS,
]

export function $toggleMarkdown(shouldPreserveNewLinesInMarkdown: boolean): void {
	const root = $getRoot()
	const firstChild = root.getFirstChild()
	if ($isCodeNode(firstChild) && firstChild.getLanguage() === 'markdown') {
		$convertFromMarkdownString(
			firstChild.getTextContent(),
			TOGGLE_TRANSFORMERS,
			undefined,
			shouldPreserveNewLinesInMarkdown
		)
		return
	}
	const markdown = $convertToMarkdownString(TOGGLE_TRANSFORMERS, undefined, shouldPreserveNewLinesInMarkdown)
	const codeNode = $createCodeNode('markdown')
	codeNode.append($createTextNode(markdown))
	root.clear().append(codeNode)
	if (markdown.length === 0) {
		codeNode.select()
	}
}

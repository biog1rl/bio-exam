import {
	$convertFromMarkdownString,
	$convertToMarkdownString,
	CHECK_LIST,
	ELEMENT_TRANSFORMERS,
	MULTILINE_ELEMENT_TRANSFORMERS,
	TEXT_FORMAT_TRANSFORMERS,
	TEXT_MATCH_TRANSFORMERS,
	Transformer,
} from '@lexical/markdown'

import { LexicalEditor } from 'lexical'

import { AUTOCOMPLETE } from '@/components/editor/transformers/markdown-autocomplete-transformer'
import { EMOJI } from '@/components/editor/transformers/markdown-emoji-transformer'
import { HR } from '@/components/editor/transformers/markdown-hr-transformer'
import { IMAGE, IMAGE_HTML } from '@/components/editor/transformers/markdown-image-transformer'
import { TABLE } from '@/components/editor/transformers/markdown-table-transformer'
import { TWEET } from '@/components/editor/transformers/markdown-tweet-transformer'

// Все transformers для полной поддержки MDX
export const MDX_TRANSFORMERS: Array<Transformer> = [
	TABLE,
	HR,
	IMAGE_HTML, // HTML теги с размерами (должен быть перед IMAGE)
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

/**
 * Конвертирует MDX строку в Lexical EditorState
 */
export function mdxToEditorState(editor: LexicalEditor, mdxContent: string): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		editor.update(
			() => {
				try {
					$convertFromMarkdownString(mdxContent, MDX_TRANSFORMERS, undefined, true)
					resolve()
				} catch (error) {
					reject(error)
				}
			},
			{ onUpdate: () => resolve() }
		)
	})
}

/**
 * Конвертирует текущий EditorState в MDX строку
 * Вызывать внутри editorState.read() контекста
 */
export function editorStateToMdx(): string {
	try {
		return $convertToMarkdownString(MDX_TRANSFORMERS, undefined, true)
	} catch (error) {
		console.error('Failed to convert editor state to MDX:', error)
		return ''
	}
}

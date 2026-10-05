import { $createParagraphNode, $createTextNode, $getRoot, createEditor, type LexicalEditor } from 'lexical'
import assert from 'node:assert/strict'
import { test } from 'vitest'

import { nodes } from '@/components/editor/nodes'
import { $createAutocompleteNode } from '@/components/editor/nodes/autocomplete-node'
import { uuid } from '@/components/editor/plugins/autocomplete-plugin'

import { $toggleMarkdown, TOGGLE_TRANSFORMERS } from './markdown-toggle'
import { MDX_TRANSFORMERS, editorStateToMdx } from './mdx-converter'

function newEditor(): LexicalEditor {
	return createEditor({
		namespace: 'markdown-toggle',
		nodes: [...nodes],
		onError: (error) => {
			throw error
		},
	})
}

function toggle(editor: LexicalEditor): void {
	editor.update(() => $toggleMarkdown(true), { discrete: true })
}

test('переключатель markdown не запекает подсказку автодополнения ни в блок кода, ни в MDX', () => {
	const editor = newEditor()
	const mdxEvents: string[] = []
	editor.registerUpdateListener(({ editorState, dirtyElements, dirtyLeaves }) => {
		if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return
		editorState.read(() => mdxEvents.push(editorStateToMdx()))
	})
	editor.update(
		() => {
			$getRoot()
				.clear()
				.append(
					$createParagraphNode().append($createTextNode('trace text'), $createAutocompleteNode('books (TAB)', uuid))
				)
		},
		{ discrete: true }
	)

	toggle(editor)
	const codeText = editor.getEditorState().read(() => $getRoot().getTextContent())
	assert.equal(codeText, 'trace text')
	assert.doesNotMatch(mdxEvents.at(-1) ?? '', /books|\(TAB\)/)

	toggle(editor)
	const mdx = editor.getEditorState().read(editorStateToMdx)
	assert.equal(mdx, 'trace text')
	assert.doesNotMatch(mdxEvents.at(-1) ?? '', /books|\(TAB\)/)
})

test('переключатель markdown: туда и обратно сохраняет форматирование', () => {
	const editor = newEditor()
	editor.update(
		() => {
			$getRoot()
				.clear()
				.append($createParagraphNode().append($createTextNode('Клетка делится')))
		},
		{ discrete: true }
	)
	toggle(editor)
	assert.equal(
		editor.getEditorState().read(() => $getRoot().getTextContent()),
		'Клетка делится'
	)
	toggle(editor)
	assert.equal(editor.getEditorState().read(editorStateToMdx), 'Клетка делится')
})

test('список переключателя совпадает со списком MDX по составу и порядку', () => {
	assert.equal(TOGGLE_TRANSFORMERS.length, MDX_TRANSFORMERS.length)
	TOGGLE_TRANSFORMERS.forEach((transformer, index) =>
		assert.equal(transformer, MDX_TRANSFORMERS[index], `позиция ${index}`)
	)
})

import { $createParagraphNode, $createTextNode, $getRoot, createEditor, type LexicalEditor } from 'lexical'
import assert from 'node:assert/strict'
import { describe, test } from 'vitest'

import { nodes } from '@/components/editor/nodes'
import { $createAutocompleteNode } from '@/components/editor/nodes/autocomplete-node'
import { uuid } from '@/components/editor/plugins/autocomplete-plugin'

import { editorStateToMdx, mdxToEditorState } from './mdx-converter'
import { MDX_GOLDEN_CASES } from './mdx-golden-cases'

function newEditor(): LexicalEditor {
	return createEditor({
		namespace: 'mdx-golden',
		nodes: [...nodes],
		onError: (error) => {
			throw error
		},
	})
}

async function roundTrip(input: string): Promise<string> {
	const editor = newEditor()
	await mdxToEditorState(editor, input)
	return editor.getEditorState().read(editorStateToMdx)
}

describe('золотые образцы MDX', () => {
	for (const goldenCase of MDX_GOLDEN_CASES) {
		test(goldenCase.name, async () => {
			const output = await roundTrip(goldenCase.input)
			assert.notEqual(output, '')
			assert.equal(output, goldenCase.output)
		})
	}
})

describe('идемпотентность золотых образцов', () => {
	for (const goldenCase of MDX_GOLDEN_CASES.filter((item) => item.idempotent !== false)) {
		test(goldenCase.name, async () => {
			assert.equal(await roundTrip(goldenCase.output), goldenCase.output)
		})
	}
})

function paragraphMdx(withSuggestion: boolean): string {
	const editor = newEditor()
	editor.update(
		() => {
			const paragraph = $createParagraphNode().append($createTextNode('trace text'))
			if (withSuggestion) paragraph.append($createAutocompleteNode('books (TAB)', uuid))
			$getRoot().clear().append(paragraph)
		},
		{ discrete: true }
	)
	return editor.getEditorState().read(editorStateToMdx)
}

test('подсказка автодополнения не попадает в MDX', () => {
	const plain = paragraphMdx(false)
	assert.equal(plain, 'trace text')
	const withSuggestion = paragraphMdx(true)
	assert.doesNotMatch(withSuggestion, /books|\(TAB\)/)
	assert.equal(withSuggestion, plain)
})

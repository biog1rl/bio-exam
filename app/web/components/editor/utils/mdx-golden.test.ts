import { createEditor, type LexicalEditor } from 'lexical'
import assert from 'node:assert/strict'
import { describe, test } from 'vitest'

import { nodes } from '@/components/editor/nodes'

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

test('среда без DOM', () => {
	assert.equal(typeof document, 'undefined')
	assert.equal(typeof window, 'undefined')
})

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

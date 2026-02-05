'use client'

/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $trimTextContentFromAnchor } from '@lexical/selection'
import { $restoreEditorState } from '@lexical/utils'

import { useEffect } from 'react'

import { $getSelection, $isRangeSelection, EditorState, RootNode } from 'lexical'

export function MaxLengthPlugin({ maxLength }: { maxLength: number }): null {
	const [editor] = useLexicalComposerContext()

	useEffect(() => {
		let lastRestoredEditorState: EditorState | null = null

		return editor.registerNodeTransform(RootNode, (rootNode: RootNode) => {
			const selection = $getSelection()
			if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
				return
			}
			const prevEditorState = editor.getEditorState()
			const prevTextContentSize = prevEditorState.read(() => rootNode.getTextContentSize())
			const textContentSize = rootNode.getTextContentSize()
			if (prevTextContentSize !== textContentSize) {
				const delCount = textContentSize - maxLength
				const anchor = selection.anchor

				if (delCount > 0) {
					// Восстановить старое состояние редактора, если последний
					// текстовый контент уже был на пределе.
					if (prevTextContentSize === maxLength && lastRestoredEditorState !== prevEditorState) {
						lastRestoredEditorState = prevEditorState
						$restoreEditorState(editor, prevEditorState)
					} else {
						$trimTextContentFromAnchor(editor, anchor, delCount)
					}
				}
			}
		})
	}, [editor, maxLength])

	return null
}

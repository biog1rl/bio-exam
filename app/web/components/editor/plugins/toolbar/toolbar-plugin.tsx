'use client'

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'

import { useEffect, useState } from 'react'

import { COMMAND_PRIORITY_CRITICAL, SELECTION_CHANGE_COMMAND } from 'lexical'

import { ToolbarContext } from '@/components/editor/context/toolbar-context'
import { useEditorModal } from '@/components/editor/editor-hooks/use-modal'

const $updateToolbar = () => {}

export function ToolbarPlugin({ children }: { children: (props: { blockType: string }) => React.ReactNode }) {
	const [editor] = useLexicalComposerContext()

	const [activeEditor, setActiveEditor] = useState(editor)
	const [blockType, setBlockType] = useState<string>('paragraph')

	const [modal, showModal] = useEditorModal()

	useEffect(() => {
		return activeEditor.registerCommand(
			SELECTION_CHANGE_COMMAND,
			(_payload, newEditor) => {
				setActiveEditor(newEditor)
				return false
			},
			COMMAND_PRIORITY_CRITICAL
		)
	}, [activeEditor])

	return (
		<ToolbarContext
			activeEditor={activeEditor}
			$updateToolbar={$updateToolbar}
			blockType={blockType}
			setBlockType={setBlockType}
			showModal={showModal}
		>
			{modal}

			{children({ blockType })}
		</ToolbarContext>
	)
}

'use client'

import { createContext, JSX, useContext, useMemo } from 'react'

import { LexicalEditor } from 'lexical'

const Context = createContext<{
	activeEditor: LexicalEditor
	$updateToolbar: () => void
	blockType: string
	setBlockType: (blockType: string) => void
	showModal: (title: string, showModal: (onClose: () => void) => JSX.Element) => void
}>({
	activeEditor: {} as LexicalEditor,
	$updateToolbar: () => {},
	blockType: 'paragraph',
	setBlockType: () => {},
	showModal: () => {},
})

export function ToolbarContext({
	activeEditor,
	$updateToolbar,
	blockType,
	setBlockType,
	showModal,
	children,
}: {
	activeEditor: LexicalEditor
	$updateToolbar: () => void
	blockType: string
	setBlockType: (blockType: string) => void
	showModal: (title: string, showModal: (onClose: () => void) => JSX.Element) => void
	children: React.ReactNode
}) {
	const value = useMemo(
		() => ({
			activeEditor,
			$updateToolbar,
			blockType,
			setBlockType,
			showModal,
		}),
		[activeEditor, $updateToolbar, blockType, setBlockType, showModal]
	)

	return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useToolbarContext() {
	return useContext(Context)
}

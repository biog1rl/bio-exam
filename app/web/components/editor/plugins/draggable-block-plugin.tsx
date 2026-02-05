'use client'

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { DraggableBlockPlugin_EXPERIMENTAL } from '@lexical/react/LexicalDraggableBlockPlugin'

import { JSX, useEffect, useRef } from 'react'

import { GripVerticalIcon } from 'lucide-react'

const DRAGGABLE_BLOCK_MENU_CLASSNAME = 'draggable-block-menu'

function isOnMenu(element: HTMLElement): boolean {
	return !!element.closest(`.${DRAGGABLE_BLOCK_MENU_CLASSNAME}`)
}

/**
 * After a drag-and-drop the browser keeps focus on the contentEditable but
 * stops rendering the caret. A blur → focus cycle fixes it.
 */
function useFixCaretAfterDrop() {
	const [editor] = useLexicalComposerContext()

	useEffect(() => {
		const root = editor.getRootElement()
		if (!root) return

		const handleDrop = () => {
			requestAnimationFrame(() => {
				root.blur()
				requestAnimationFrame(() => {
					editor.focus()
				})
			})
		}

		root.addEventListener('drop', handleDrop)
		return () => root.removeEventListener('drop', handleDrop)
	}, [editor])
}

export function DraggableBlockPlugin({ anchorElem }: { anchorElem: HTMLElement | null }): JSX.Element | null {
	useFixCaretAfterDrop()
	const menuRef = useRef<HTMLDivElement>(null)
	const targetLineRef = useRef<HTMLDivElement>(null)

	if (!anchorElem) {
		return null
	}

	return (
		<DraggableBlockPlugin_EXPERIMENTAL
			anchorElem={anchorElem}
			menuRef={menuRef as React.RefObject<HTMLDivElement>}
			targetLineRef={targetLineRef as React.RefObject<HTMLDivElement>}
			menuComponent={
				<div
					ref={menuRef}
					className="draggable-block-menu absolute left-0 top-0 cursor-grab rounded-sm px-[1px] py-0.5 opacity-0 will-change-transform hover:bg-gray-100 active:cursor-grabbing"
				>
					<GripVerticalIcon className="size-4 opacity-30" />
				</div>
			}
			targetLineComponent={
				<div
					ref={targetLineRef}
					className="bg-secondary-foreground pointer-events-none absolute left-0 top-0 h-1 opacity-0 will-change-transform"
				/>
			}
			isOnMenu={isOnMenu}
		/>
	)
}

'use client'

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'

import { useCallback } from 'react'

import { FileTextIcon } from 'lucide-react'

import { $toggleMarkdown } from '@/components/editor/utils/markdown-toggle'
import { Button } from '@/components/ui/button'

export function MarkdownTogglePlugin({
	shouldPreserveNewLinesInMarkdown,
}: {
	shouldPreserveNewLinesInMarkdown: boolean
}) {
	const [editor] = useLexicalComposerContext()

	const handleMarkdownToggle = useCallback(() => {
		editor.update(() => $toggleMarkdown(shouldPreserveNewLinesInMarkdown))
	}, [editor, shouldPreserveNewLinesInMarkdown])

	return (
		<Button
			variant={'ghost'}
			onClick={handleMarkdownToggle}
			title="Convert From Markdown"
			aria-label="Convert from markdown"
			size={'sm'}
			className="p-2"
		>
			<FileTextIcon className="size-4" />
		</Button>
	)
}

'use client'

import { Images } from 'lucide-react'

import { useToolbarContext } from '@/components/editor/context/toolbar-context'
import { MediaLibrary } from '@/components/editor/plugins/images-plugin/MediaLibrary'
import { Button } from '@/components/ui/button'

export function InsertMediaLibrary() {
	const { activeEditor, showModal } = useToolbarContext()

	return (
		<Button
			variant="ghost"
			size="sm"
			className="h-8 gap-1"
			title="Медиатека"
			onClick={() => {
				showModal('Медиатека', (onClose) => <MediaLibrary editor={activeEditor} onClose={onClose} />)
			}}
		>
			<Images className="size-4" />
			<span className="hidden sm:inline">Медиатека</span>
		</Button>
	)
}

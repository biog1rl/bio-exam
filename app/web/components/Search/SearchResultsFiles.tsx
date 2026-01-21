'use client'

import { FileTextIcon } from 'lucide-react'

import { CommandGroup, CommandItem } from '@/components/ui/command'
import { makeSearchValue } from '@/lib/search/query'
import type { FileResult } from '@/types/search'

interface Props {
	files: FileResult[]
	onSelect: (href: string | null) => void
}

export function SearchResultsFiles({ files, onSelect }: Props) {
	if (files.length === 0) {
		return null
	}

	return (
		<CommandGroup heading="Файлы">
			{files.map((file) => (
				<CommandItem
					key={file.id}
					value={makeSearchValue(file.title, file.snippet)}
					onSelect={() => onSelect(file.href)}
					className="cursor-pointer"
				>
					<FileTextIcon className="size-4" />
					<div className="ml-2 min-w-0">
						<div className="truncate">{file.title}</div>
						<div className="text-muted-foreground line-clamp-2 text-xs" dangerouslySetInnerHTML={{ __html: file.snippet }} />
					</div>
				</CommandItem>
			))}
		</CommandGroup>
	)
}

'use client'

import { BookOpenIcon } from 'lucide-react'

import { CommandGroup, CommandItem } from '@/components/ui/command'
import { makeSearchValue } from '@/lib/search/query'
import type { TopicResult } from '@/types/search'

interface Props {
	topics: TopicResult[]
	onSelect: (href: string | null) => void
}

export function SearchResultsTopics({ topics, onSelect }: Props) {
	if (topics.length === 0) {
		return null
	}

	return (
		<CommandGroup heading="Темы">
			{topics.map((topic) => (
				<CommandItem
					key={topic.id}
					value={makeSearchValue(topic.title, topic.description)}
					onSelect={() => onSelect(topic.href)}
					className="cursor-pointer"
				>
					<BookOpenIcon className="size-4" />
					<div className="ml-2 min-w-0">
						<div className="truncate">{topic.title}</div>
						{topic.description && <div className="text-muted-foreground truncate text-xs">{topic.description}</div>}
					</div>
				</CommandItem>
			))}
		</CommandGroup>
	)
}

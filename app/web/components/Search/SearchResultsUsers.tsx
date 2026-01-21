'use client'

import { UserIcon } from 'lucide-react'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { CommandGroup, CommandItem } from '@/components/ui/command'
import { makeSearchValue } from '@/lib/search/query'
import type { UserResult } from '@/types/search'

interface Props {
	users: UserResult[]
	onSelect: (href: string | null) => void
}

export function SearchResultsUsers({ users, onSelect }: Props) {
	if (users.length === 0) {
		return null
	}

	return (
		<CommandGroup heading="Пользователи">
			{users.map((user) => (
				<CommandItem
					key={user.id}
					value={makeSearchValue(user.name, user.login, user.position)}
					onSelect={() => onSelect(user.href)}
					className="cursor-pointer"
				>
					<Avatar className="size-6">
						{user.avatar ? (
							<AvatarImage src={user.avatar} alt={user.name} />
						) : (
							<AvatarFallback>
								<UserIcon className="size-3" />
							</AvatarFallback>
						)}
					</Avatar>
					<div className="ml-2 min-w-0">
						<div className="truncate">{user.name}</div>
						<div className="text-muted-foreground flex gap-2 text-xs">
							{user.login && <span>@{user.login}</span>}
							{user.position && <span className="truncate">• {user.position}</span>}
						</div>
					</div>
				</CommandItem>
			))}
		</CommandGroup>
	)
}

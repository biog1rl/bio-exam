'use client'

import { ReactNode } from 'react'

import clsx from 'clsx'
import { Trash2Icon } from 'lucide-react'
import Link from 'next/link'

import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from '@/components/ui/context-menu'

type WithContextMenuProps = {
	children: ReactNode
	openHref?: string
	editHref?: string
	onDelete?: () => void
	items?: ReactNode
	contentClassName?: string
}

export function WithContextMenu({
	children,
	openHref,
	editHref,
	onDelete,
	items,
	contentClassName,
}: WithContextMenuProps) {
	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
			<ContextMenuContent className={clsx('w-52', contentClassName)}>
				{items ?? (
					<>
						{openHref && (
							<ContextMenuItem inset asChild>
								<Link className="cursor-pointer" href={openHref}>
									Открыть
								</Link>
							</ContextMenuItem>
						)}
						{editHref && (
							<ContextMenuItem inset asChild>
								<Link className="cursor-pointer" href={editHref}>
									Редактировать
								</Link>
							</ContextMenuItem>
						)}
						{onDelete && (
							<>
								<ContextMenuSeparator />
								<ContextMenuItem
									inset
									className="text-destructive focus:text-destructive cursor-pointer"
									onClick={(e) => {
										e.preventDefault()
										onDelete()
									}}
								>
									<Trash2Icon className="mr-2 size-4" />
									Удалить
								</ContextMenuItem>
							</>
						)}
					</>
				)}
			</ContextMenuContent>
		</ContextMenu>
	)
}

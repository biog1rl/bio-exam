'use client'

import { useId, useRef, useState } from 'react'

import { Bell, Loader2 } from 'lucide-react'
import dynamic from 'next/dynamic'
import { toast } from 'sonner'
import useSWR from 'swr'

import { useAuth } from '@/components/providers/AuthProvider'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
	loadUnreadCount,
	markAllNotificationsRead,
	notificationKeys,
	refreshNotifications,
} from '@/lib/notifications/api'
import { badgeLabel, bellAccessibleName } from '@/lib/notifications/format'
import { cn } from '@/lib/utils/cn'

import NotificationListSkeleton from './NotificationListSkeleton'
import UnreadTitlePrefix from './UnreadTitlePrefix'

const NotificationList = dynamic(() => import('./NotificationList'), {
	ssr: false,
	loading: () => <NotificationListSkeleton />,
})

export default function NotificationBell() {
	const { me } = useAuth()
	const { data, mutate } = useSWR(me ? notificationKeys.unreadCount(me.id) : null, () => loadUnreadCount(), {
		refreshInterval: 60_000,
		refreshWhenHidden: false,
		revalidateOnFocus: true,
	})
	const count = data ?? 0
	const [open, setOpen] = useState(false)
	const [markingAll, setMarkingAll] = useState(false)
	const markingAllRef = useRef(false)
	const headingId = useId()
	const headingRef = useRef<HTMLHeadingElement>(null)
	const readAllRef = useRef<HTMLButtonElement>(null)

	const handleOpenChange = (next: boolean) => {
		setOpen(next)
		if (next) void mutate()
	}

	const handleReadAll = async () => {
		if (count === 0 || markingAllRef.current) return
		markingAllRef.current = true
		setMarkingAll(true)
		try {
			const outcome = await markAllNotificationsRead()
			if (!outcome.ok) {
				toast.error('Не удалось отметить уведомления прочитанными. Попробуйте ещё раз.')
				return
			}
			await refreshNotifications()
			readAllRef.current?.focus()
		} finally {
			markingAllRef.current = false
			setMarkingAll(false)
		}
	}

	return (
		<>
			<Popover open={open} onOpenChange={handleOpenChange}>
				<PopoverTrigger asChild>
					<Button size="icon" variant="outline" className="relative" aria-label={bellAccessibleName(count)}>
						<Bell className="size-4" aria-hidden="true" />
						{count > 0 ? (
							<span
								aria-hidden="true"
								className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs leading-none font-medium text-primary-foreground tabular-nums ring-2 ring-background"
							>
								{badgeLabel(count)}
							</span>
						) : null}
					</Button>
				</PopoverTrigger>
				<PopoverContent
					align="end"
					sideOffset={8}
					collisionPadding={8}
					aria-labelledby={headingId}
					onOpenAutoFocus={(event) => {
						event.preventDefault()
						headingRef.current?.focus()
					}}
					className="flex max-h-[min(32rem,var(--radix-popover-content-available-height))] w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-3xl p-0 mob:w-96"
				>
					<div className="flex items-center justify-between gap-2 border-b border-border/70 py-1 pr-2 pl-4">
						<h2 id={headingId} ref={headingRef} tabIndex={-1} className="text-sm font-medium outline-none">
							Уведомления
						</h2>
						<Button
							ref={readAllRef}
							variant="ghost"
							size="sm"
							className={cn('h-11 rounded-full tab:h-8', count === 0 && 'opacity-50')}
							aria-disabled={count === 0}
							aria-busy={markingAll}
							onClick={() => void handleReadAll()}
						>
							{markingAll ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
							Прочитать все
						</Button>
					</div>
					{me ? <NotificationList userId={me.id} onNavigate={() => setOpen(false)} /> : null}
				</PopoverContent>
			</Popover>
			<UnreadTitlePrefix count={count} />
		</>
	)
}

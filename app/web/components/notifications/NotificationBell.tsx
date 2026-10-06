'use client'

import { Bell } from 'lucide-react'
import useSWR from 'swr'

import { useAuth } from '@/components/providers/AuthProvider'
import { Button } from '@/components/ui/button'
import { loadUnreadCount, notificationKeys } from '@/lib/notifications/api'
import { badgeLabel, bellAccessibleName } from '@/lib/notifications/format'

import UnreadTitlePrefix from './UnreadTitlePrefix'

export default function NotificationBell() {
	const { me } = useAuth()
	const { data } = useSWR(me ? notificationKeys.unreadCount(me.id) : null, () => loadUnreadCount(), {
		refreshInterval: 60_000,
		refreshWhenHidden: false,
		revalidateOnFocus: true,
	})
	const count = data ?? 0

	return (
		<>
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
			<UnreadTitlePrefix count={count} />
		</>
	)
}

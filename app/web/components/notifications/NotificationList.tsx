'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

import { Loader2 } from 'lucide-react'
import Link from 'next/link'
import useSWR from 'swr'

import { LoadErrorAlert } from '@/components/feedback/LoadErrorAlert'
import {
	loadNotificationsPage,
	notificationKeys,
	type NotificationItem,
	type NotificationsPage,
} from '@/lib/notifications/api'
import { formatNotificationFullDate, formatNotificationTime } from '@/lib/notifications/time'
import { cn } from '@/lib/utils/cn'

import NotificationListSkeleton from './NotificationListSkeleton'

type NotificationListProps = {
	userId: string
	onNavigate: () => void
}

type MoreState = {
	base: NotificationsPage
	pages: NotificationsPage[]
	error: unknown
}

const fetchFirstPage = () => loadNotificationsPage()

function mergeItems(pages: NotificationsPage[]): NotificationItem[] {
	const seen = new Set<string>()
	const items: NotificationItem[] = []
	for (const page of pages) {
		for (const item of page.items) {
			if (seen.has(item.id)) continue
			seen.add(item.id)
			items.push(item)
		}
	}
	return items
}

export default function NotificationList({ userId, onNavigate }: NotificationListProps) {
	const { data, error, mutate } = useSWR(notificationKeys.list(userId), fetchFirstPage)
	const [more, setMore] = useState<MoreState | null>(null)
	const [loadingMore, setLoadingMore] = useState(false)
	const focusIdRef = useRef<string | null>(null)
	const loadingRef = useRef(false)
	const links = useRef(new Map<string, HTMLAnchorElement>())

	const current = data && more && more.base === data ? more : null
	const pages = useMemo(() => (data ? [data, ...(current?.pages ?? [])] : []), [data, current])
	const items = useMemo(() => mergeItems(pages), [pages])
	const nextCursor = pages.length > 0 ? pages[pages.length - 1].nextCursor : null

	useEffect(() => {
		const id = focusIdRef.current
		if (!id) return
		focusIdRef.current = null
		links.current.get(id)?.focus()
	}, [items])

	const loadMore = async () => {
		if (!data || !nextCursor || loadingRef.current) return
		const base = data
		const known = new Set(items.map((item) => item.id))
		loadingRef.current = true
		setLoadingMore(true)
		setMore((state) => (state && state.base === base ? { ...state, error: null } : { base, pages: [], error: null }))
		try {
			const page = await loadNotificationsPage(nextCursor)
			if (page.nextCursor === null) {
				const first = page.items.find((item) => !known.has(item.id))
				if (first) focusIdRef.current = first.id
			}
			setMore((state) => ({
				base,
				pages: [...(state && state.base === base ? state.pages : []), page],
				error: null,
			}))
		} catch (failure) {
			setMore((state) => ({ base, pages: state && state.base === base ? state.pages : [], error: failure }))
		} finally {
			loadingRef.current = false
			setLoadingMore(false)
		}
	}

	if (!data) {
		if (error !== undefined) {
			return (
				<div className="p-2">
					<LoadErrorAlert title="Не удалось загрузить уведомления" error={error} onRetry={() => mutate()} />
				</div>
			)
		}
		return <NotificationListSkeleton />
	}

	if (items.length === 0) {
		return (
			<div className="px-4 py-8 text-center">
				<p className="text-sm text-muted-foreground">Уведомлений пока нет</p>
				<p className="mt-1 text-xs text-muted-foreground">Новые события появятся здесь.</p>
			</div>
		)
	}

	const now = new Date()
	const moreError = current?.error ?? null

	return (
		<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
			<ul className="space-y-1 p-2">
				{items.map((item) => (
					<li key={item.id}>
						<Link
							ref={(node) => {
								if (node) links.current.set(item.id, node)
								else links.current.delete(item.id)
							}}
							href={`/notifications/${encodeURIComponent(item.id)}`}
							prefetch={false}
							onClick={onNavigate}
							className="flex min-h-11 items-start gap-2 rounded-2xl px-2 py-2 transition-colors hover:bg-secondary/60 focus-visible:bg-secondary/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
						>
							<span aria-hidden="true" className="flex h-5 shrink-0 items-center">
								<span className={cn('size-2 rounded-full', item.read ? 'bg-transparent' : 'bg-primary')} />
							</span>
							<span className="min-w-0 flex-1">
								{item.read ? null : <span className="sr-only">Непрочитанное: </span>}
								<span
									className={cn(
										'line-clamp-3 text-sm leading-5 break-words',
										item.read ? 'text-muted-foreground' : 'font-medium text-foreground'
									)}
								>
									{item.text}
								</span>
								<time
									dateTime={item.lastEventAt}
									title={formatNotificationFullDate(item.lastEventAt)}
									className="mt-1 block text-xs text-muted-foreground"
								>
									{formatNotificationTime(item.lastEventAt, now)}
								</time>
							</span>
						</Link>
					</li>
				))}
			</ul>
			{moreError !== null ? (
				<div className="px-2 pb-2">
					<LoadErrorAlert title="Не удалось загрузить ещё уведомления" error={moreError} onRetry={loadMore} />
				</div>
			) : nextCursor ? (
				<div className="flex justify-center px-2 pb-2">
					<button
						type="button"
						onClick={() => void loadMore()}
						aria-busy={loadingMore || undefined}
						aria-disabled={loadingMore || undefined}
						className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full border border-border/70 bg-card px-5 text-sm transition-colors hover:border-primary/35 hover:bg-secondary/60 focus-visible:border-primary focus-visible:outline-none disabled:pointer-events-none disabled:opacity-70"
					>
						{loadingMore ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
						Показать ещё
					</button>
				</div>
			) : null}
		</div>
	)
}

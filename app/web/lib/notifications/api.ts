import { mutate } from 'swr'

import { MalformedBodyError, request, requestJson, type RequestOutcome } from '@/lib/http/request'

export const notificationKeys = {
	unreadCount: (userId: string) => `notifications/unread-count/${userId}`,
	list: (userId: string) => `notifications/list/${userId}`,
}

export type NotificationItem = {
	id: string
	kind: string
	text: string
	read: boolean
	lastEventAt: string
}

export type NotificationsPage = {
	items: NotificationItem[]
	nextCursor: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function parseUnreadCount(body: unknown): number {
	if (!isRecord(body)) throw new MalformedBodyError()
	const { count } = body
	if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) throw new MalformedBodyError()
	return count
}

function parseNotificationItem(value: unknown): NotificationItem {
	if (!isRecord(value)) throw new MalformedBodyError()
	const { id, kind, text, read, lastEventAt } = value
	if (typeof id !== 'string' || typeof kind !== 'string' || typeof text !== 'string') throw new MalformedBodyError()
	if (typeof read !== 'boolean') throw new MalformedBodyError()
	if (typeof lastEventAt !== 'string' || !Number.isFinite(Date.parse(lastEventAt))) throw new MalformedBodyError()
	return { id, kind, text, read, lastEventAt }
}

export function parseNotificationsPage(body: unknown): NotificationsPage {
	if (!isRecord(body)) throw new MalformedBodyError()
	const { items, nextCursor } = body
	if (!Array.isArray(items)) throw new MalformedBodyError()
	if (nextCursor !== null && typeof nextCursor !== 'string') throw new MalformedBodyError()
	return { items: items.map(parseNotificationItem), nextCursor }
}

export function loadUnreadCount(): Promise<number> {
	return requestJson('/api/notifications/unread-count', { parse: parseUnreadCount })
}

export function loadNotificationsPage(cursor?: string | null): Promise<NotificationsPage> {
	const url = cursor ? `/api/notifications?cursor=${encodeURIComponent(cursor)}` : '/api/notifications'
	return requestJson(url, { parse: parseNotificationsPage })
}

export function markAllNotificationsRead(): Promise<RequestOutcome<unknown>> {
	return request('/api/notifications/read-all', { method: 'POST' })
}

export function refreshNotifications(): Promise<unknown> {
	return mutate((key) => typeof key === 'string' && key.startsWith('notifications/'))
}

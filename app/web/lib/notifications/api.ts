import { MalformedBodyError, requestJson } from '@/lib/http/request'

export const notificationKeys = {
	unreadCount: (userId: string) => `notifications/unread-count/${userId}`,
}

export function parseUnreadCount(body: unknown): number {
	if (!body || typeof body !== 'object' || Array.isArray(body)) throw new MalformedBodyError()
	const { count } = body as Record<string, unknown>
	if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) throw new MalformedBodyError()
	return count
}

export function loadUnreadCount(): Promise<number> {
	return requestJson('/api/notifications/unread-count', { parse: parseUnreadCount })
}

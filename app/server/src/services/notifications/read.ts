import { and, desc, eq, isNull, sql, type SQL } from 'drizzle-orm'

import { db } from '../../db/index.js'
import { notificationEvents } from '../../db/schema.js'
import { isValidUUID } from '../../middleware/validateParams.js'
import { encodeCursor, type CursorPosition } from './cursor.js'
import { notificationText } from './kinds.js'

export type NotificationItem = { id: string; kind: string; text: string; read: boolean; lastEventAt: string }

export type NotificationsPage = { items: NotificationItem[]; nextCursor: string | null }

export function ownedBy(userId: string): SQL {
	return eq(notificationEvents.recipientId, userId)
}

export async function listNotifications(
	userId: string,
	options: { cursor: CursorPosition | null; limit: number }
): Promise<NotificationsPage> {
	const { cursor, limit } = options
	const rows = await db
		.select({
			id: notificationEvents.id,
			kind: notificationEvents.kind,
			params: notificationEvents.params,
			read: sql<boolean>`${notificationEvents.readAt} IS NOT NULL`,
			lastEventAt: sql<string>`to_char(${notificationEvents.lastEventAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
		})
		.from(notificationEvents)
		.where(
			and(
				ownedBy(userId),
				cursor
					? sql`(${notificationEvents.lastEventAt}, ${notificationEvents.id}) < (${cursor.ts}::timestamptz, ${cursor.id}::uuid)`
					: undefined
			)
		)
		.orderBy(desc(notificationEvents.lastEventAt), desc(notificationEvents.id))
		.limit(limit + 1)

	const shown = rows.slice(0, limit)
	const last = shown[shown.length - 1]
	const nextCursor = rows.length > limit && last ? encodeCursor({ ts: last.lastEventAt, id: last.id }) : null
	return {
		items: shown.map((row) => ({
			id: row.id,
			kind: row.kind,
			text: notificationText(row.kind, row.params),
			read: row.read,
			lastEventAt: row.lastEventAt,
		})),
		nextCursor,
	}
}

export async function countUnread(userId: string): Promise<number> {
	const [row] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(notificationEvents)
		.where(and(ownedBy(userId), isNull(notificationEvents.readAt)))
	return row?.count ?? 0
}

export async function markRead(userId: string, id: string): Promise<boolean> {
	if (!isValidUUID(id)) return false
	const rows = await db
		.update(notificationEvents)
		.set({ readAt: sql`coalesce(${notificationEvents.readAt}, now())` })
		.where(and(eq(notificationEvents.id, id), ownedBy(userId)))
		.returning({ id: notificationEvents.id })
	return rows.length > 0
}

export async function markAllRead(userId: string): Promise<number> {
	const rows = await db
		.update(notificationEvents)
		.set({ readAt: sql`now()` })
		.where(and(ownedBy(userId), isNull(notificationEvents.readAt)))
		.returning({ id: notificationEvents.id })
	return rows.length
}

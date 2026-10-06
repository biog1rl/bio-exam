import { and, eq, sql } from 'drizzle-orm'

import { db } from '../../db/index.js'
import { notificationEvents } from '../../db/schema.js'
import { isValidUUID } from '../../middleware/validateParams.js'
import { kindOpenHandler } from './kinds.js'
import { ownedBy } from './read.js'

export type OpenResult = { ok: true; href: string } | { ok: false }

export async function openNotification(
	userId: string,
	id: string,
	access: { canReadTest: (testId: string) => Promise<boolean> }
): Promise<OpenResult> {
	if (!isValidUUID(id)) return { ok: false }
	const [event] = await db
		.update(notificationEvents)
		.set({ readAt: sql`coalesce(${notificationEvents.readAt}, now())` })
		.where(and(eq(notificationEvents.id, id), ownedBy(userId)))
		.returning({
			kind: notificationEvents.kind,
			subjectType: notificationEvents.subjectType,
			subjectId: notificationEvents.subjectId,
		})
	if (!event) return { ok: false }
	const handler = kindOpenHandler(event.kind)
	if (!handler) return { ok: false }
	const href = await handler({
		userId,
		subjectType: event.subjectType,
		subjectId: event.subjectId,
		canReadTest: access.canReadTest,
	})
	return href ? { ok: true, href } : { ok: false }
}

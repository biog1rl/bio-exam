import { sql } from 'drizzle-orm'

import type { DB } from '../../db/index.js'
import { notificationEvents } from '../../db/schema.js'
import { DELIVERY_CHANNELS } from './channels.js'

export type NotificationTx = Parameters<Parameters<DB['transaction']>[0]>[0]

export type NotificationParams = Record<string, string | number | boolean | null>

export type NotificationSubject = { type: string; id: string }

export type NotificationInput = {
	recipientId: string
	actorId: string | null
	kind: string
	subject: NotificationSubject
	dedupeKey: string
	collapseKey?: string | null
	params: NotificationParams
}

function compareText(a: string, b: string): number {
	if (a < b) return -1
	if (a > b) return 1
	return 0
}

function uniqueSorted(inputs: readonly NotificationInput[]): NotificationInput[] {
	const byPair = new Map<string, NotificationInput>()
	for (const input of inputs) byPair.set(JSON.stringify([input.recipientId, input.dedupeKey]), input)
	return [...byPair.values()].sort(
		(a, b) => compareText(a.recipientId, b.recipientId) || compareText(a.dedupeKey, b.dedupeKey)
	)
}

export async function recordNotifications(tx: NotificationTx, inputs: readonly NotificationInput[]): Promise<void> {
	const rows = uniqueSorted(inputs)
	if (rows.length === 0) return
	const written = await tx
		.insert(notificationEvents)
		.values(
			rows.map((input) => ({
				recipientId: input.recipientId,
				actorId: input.actorId,
				kind: input.kind,
				subjectType: input.subject.type,
				subjectId: input.subject.id,
				dedupeKey: input.dedupeKey,
				collapseKey: input.collapseKey ?? null,
				params: input.params,
			}))
		)
		.onConflictDoUpdate({
			target: [notificationEvents.recipientId, notificationEvents.dedupeKey],
			set: {
				refSeq: sql`${notificationEvents.refSeq} + 1`,
				lastEventAt: sql`now()`,
				readAt: null,
				params: sql`excluded.params`,
				actorId: sql`excluded.actor_id`,
			},
		})
		.returning({ id: notificationEvents.id })
	const eventIds = written.map((row) => row.id)
	for (const channel of DELIVERY_CHANNELS) await channel.schedule(tx, eventIds)
}

export async function recordNotification(tx: NotificationTx, input: NotificationInput): Promise<void> {
	await recordNotifications(tx, [input])
}

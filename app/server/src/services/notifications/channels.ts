import { sql } from 'drizzle-orm'

import { notificationDeliveries } from '../../db/schema.js'
import type { NotificationTx } from './record.js'

export type DeliveryChannel = {
	name: string
	schedule(tx: NotificationTx, eventIds: readonly string[]): Promise<void>
}

const inboxChannel: DeliveryChannel = {
	name: 'inbox',
	async schedule(tx, eventIds) {
		if (eventIds.length === 0) return
		await tx
			.insert(notificationDeliveries)
			.values(eventIds.map((eventId) => ({ eventId, channel: inboxChannel.name, status: 'sent', sentAt: sql`now()` })))
			.onConflictDoUpdate({
				target: [notificationDeliveries.eventId, notificationDeliveries.channel],
				set: { status: 'sent', sentAt: sql`now()` },
			})
	},
}

export const DELIVERY_CHANNELS: readonly DeliveryChannel[] = [inboxChannel]

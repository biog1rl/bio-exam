import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { afterAll, beforeAll, describe, test } from 'vitest'

import { seedUser, startAuthApp, type AuthApp } from '../../test-support/auth-app.js'

type NotificationsModule = typeof import('./index.js')

type EventRow = {
	id: string
	recipient_id: string
	actor_id: string | null
	kind: string
	subject_type: string
	subject_id: string
	dedupe_key: string
	collapse_key: string | null
	params: Record<string, unknown>
	ref_seq: number
	read_at: Date | null
	last_event_at: Date
}

type DeliveryRow = {
	event_id: string
	channel: string
	status: string
	attempts: number
	next_attempt_at: Date | null
	lease_until: Date | null
	sent_at: Date | null
	last_error: string | null
}

let ctx: AuthApp
let notifications: NotificationsModule

async function newUser(prefix: string): Promise<string> {
	return seedUser(ctx, {
		login: `${prefix}_${crypto.randomUUID().slice(0, 8)}`,
		roles: ['student'],
		password: 'Passw0rd!notif',
	})
}

async function eventsOf(recipientId: string): Promise<EventRow[]> {
	const result = await ctx.pgPool.query<EventRow>(
		'SELECT * FROM notification_events WHERE recipient_id = $1 ORDER BY dedupe_key',
		[recipientId]
	)
	return result.rows
}

async function deliveriesOf(recipientId: string): Promise<DeliveryRow[]> {
	const result = await ctx.pgPool.query<DeliveryRow>(
		`SELECT d.* FROM notification_deliveries d
		JOIN notification_events e ON e.id = d.event_id
		WHERE e.recipient_id = $1
		ORDER BY e.dedupe_key, d.channel`,
		[recipientId]
	)
	return result.rows
}

function assigned(recipientId: string, actorId: string | null, subjectId: string, testTitle: string) {
	return {
		recipientId,
		actorId,
		kind: 'test.assigned',
		subject: { type: 'test', id: subjectId },
		dedupeKey: `test.assigned:${subjectId}`,
		params: { testTitle },
	}
}

beforeAll(async () => {
	ctx = await startAuthApp('test_notifications_record')
	notifications = await import('./index.js')
}, 60_000)

afterAll(async () => {
	await ctx?.stop()
})

describe('запись события журнала', () => {
	test('событие и доставка inbox пишутся одной транзакцией причины', async () => {
		const recipientId = await newUser('rec')
		const actorId = await newUser('act')
		const testId = crypto.randomUUID()

		await ctx.db.transaction((tx) =>
			notifications.recordNotification(tx, assigned(recipientId, actorId, testId, 'Строение клетки'))
		)

		const events = await eventsOf(recipientId)
		assert.equal(events.length, 1)
		const event = events[0]
		assert.ok(event)
		assert.equal(event.actor_id, actorId)
		assert.equal(event.kind, 'test.assigned')
		assert.equal(event.subject_type, 'test')
		assert.equal(event.subject_id, testId)
		assert.equal(event.dedupe_key, `test.assigned:${testId}`)
		assert.deepEqual(event.params, { testTitle: 'Строение клетки' })
		assert.equal(event.ref_seq, 1)
		assert.equal(event.read_at, null)
		const deliveries = await deliveriesOf(recipientId)
		assert.equal(deliveries.length, 1)
		const delivery = deliveries[0]
		assert.ok(delivery)
		assert.equal(delivery.event_id, event.id)
		assert.equal(delivery.channel, 'inbox')
		assert.equal(delivery.status, 'sent')
		assert.ok(delivery.sent_at)
	})

	test('откат транзакции причины не оставляет ни события, ни доставки', async () => {
		const recipientId = await newUser('rollback')

		await assert.rejects(
			ctx.db.transaction(async (tx) => {
				await notifications.recordNotification(tx, assigned(recipientId, null, crypto.randomUUID(), 'Откат'))
				throw new Error('rollback')
			}),
			/rollback/
		)

		assert.equal((await eventsOf(recipientId)).length, 0)
		assert.equal((await deliveriesOf(recipientId)).length, 0)
	})

	test('повтор причины по той же паре поднимает ref_seq и обновляет доставку, а не создаёт строку', async () => {
		const recipientId = await newUser('repeat')
		const firstActor = await newUser('first')
		const secondActor = await newUser('second')
		const testId = crypto.randomUUID()
		await ctx.db.transaction((tx) =>
			notifications.recordNotification(tx, assigned(recipientId, firstActor, testId, 'Первое название'))
		)
		await ctx.pgPool.query(
			`UPDATE notification_events SET read_at = now(), last_event_at = now() - interval '1 minute' WHERE recipient_id = $1`,
			[recipientId]
		)
		await ctx.pgPool.query(
			`UPDATE notification_deliveries SET sent_at = now() - interval '1 minute'
			WHERE event_id IN (SELECT id FROM notification_events WHERE recipient_id = $1)`,
			[recipientId]
		)
		const [before] = await eventsOf(recipientId)
		const [deliveryBefore] = await deliveriesOf(recipientId)
		assert.ok(before && deliveryBefore?.sent_at)

		await ctx.db.transaction((tx) =>
			notifications.recordNotification(tx, assigned(recipientId, secondActor, testId, 'Второе название'))
		)

		const events = await eventsOf(recipientId)
		assert.equal(events.length, 1)
		const [after] = events
		assert.ok(after)
		assert.equal(after.id, before.id)
		assert.equal(after.ref_seq, 2)
		assert.equal(after.read_at, null)
		assert.ok(after.last_event_at.getTime() > before.last_event_at.getTime())
		assert.deepEqual(after.params, { testTitle: 'Второе название' })
		assert.equal(after.actor_id, secondActor)
		const deliveries = await deliveriesOf(recipientId)
		assert.equal(deliveries.length, 1)
		const [deliveryAfter] = deliveries
		assert.ok(deliveryAfter?.sent_at)
		assert.ok(deliveryAfter.sent_at.getTime() > deliveryBefore.sent_at.getTime())
	})

	test('пакет с повторяющейся парой и вторым получателем не падает и сохраняет последнюю причину пары', async () => {
		const first = await newUser('batch_a')
		const second = await newUser('batch_b')
		const testId = crypto.randomUUID()

		await ctx.db.transaction((tx) =>
			notifications.recordNotifications(tx, [
				assigned(second, null, testId, 'Для второго'),
				assigned(first, null, testId, 'Старое название'),
				assigned(first, null, testId, 'Последнее название'),
			])
		)

		const firstEvents = await eventsOf(first)
		assert.equal(firstEvents.length, 1)
		assert.deepEqual(firstEvents[0]?.params, { testTitle: 'Последнее название' })
		assert.equal(firstEvents[0]?.ref_seq, 1)
		const secondEvents = await eventsOf(second)
		assert.equal(secondEvents.length, 1)
		assert.deepEqual(secondEvents[0]?.params, { testTitle: 'Для второго' })
		assert.equal((await deliveriesOf(first)).length, 1)
		assert.equal((await deliveriesOf(second)).length, 1)
	})

	test('пустой пакет не пишет строк и не падает', async () => {
		const before = await ctx.pgPool.query<{ count: number }>('SELECT count(*)::int AS count FROM notification_events')

		await ctx.db.transaction((tx) => notifications.recordNotifications(tx, []))

		const after = await ctx.pgPool.query<{ count: number }>('SELECT count(*)::int AS count FROM notification_events')
		assert.equal(after.rows[0]?.count, before.rows[0]?.count)
	})

	test('неизвестный вид хранится как есть, у доставки поля повтора и аренды пусты', async () => {
		const recipientId = await newUser('chat')
		const chatId = crypto.randomUUID()

		await ctx.db.transaction((tx) =>
			notifications.recordNotification(tx, {
				recipientId,
				actorId: null,
				kind: 'chat.message',
				subject: { type: 'chat', id: chatId },
				dedupeKey: `chat.message:${chatId}`,
				collapseKey: `chat:${chatId}`,
				params: { preview: 'Привет', unread: 3, muted: false },
			})
		)

		const [event] = await eventsOf(recipientId)
		assert.ok(event)
		assert.equal(event.kind, 'chat.message')
		assert.equal(event.subject_type, 'chat')
		assert.equal(event.subject_id, chatId)
		assert.equal(event.collapse_key, `chat:${chatId}`)
		assert.deepEqual(event.params, { preview: 'Привет', unread: 3, muted: false })
		const [delivery] = await deliveriesOf(recipientId)
		assert.ok(delivery)
		assert.equal(delivery.attempts, 0)
		assert.equal(delivery.next_attempt_at, null)
		assert.equal(delivery.lease_until, null)
		assert.equal(delivery.last_error, null)
	})
})

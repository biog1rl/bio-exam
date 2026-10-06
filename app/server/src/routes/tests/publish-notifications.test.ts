import { eq } from 'drizzle-orm'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, test } from 'vitest'

import {
	addQuestion,
	createAttemptTest,
	seedAttemptWorld,
	seedStudent,
	type AttemptWorld,
} from '../../test-support/attempt-world.js'
import { call, startAuthApp, type AuthApp } from '../../test-support/auth-app.js'
import { memoryStorage } from '../../test-support/storage.js'

type EventRow = {
	id: string
	actor_id: string | null
	kind: string
	params: Record<string, unknown>
	ref_seq: number
	read_at: Date | null
	last_event_at: Date
}

type TestState = { is_published: boolean; version: number }

function suffix(): string {
	return crypto.randomUUID().slice(0, 8)
}

describe('события публикации теста', () => {
	let ctx: AuthApp
	let world: AttemptWorld

	beforeAll(async () => {
		ctx = await startAuthApp('test_publish_notifications')
		await memoryStorage()
		world = await seedAttemptWorld(ctx, 'pubnotif')
	}, 60_000)

	afterAll(async () => {
		await ctx?.stop()
	})

	async function eventsOf(recipientId: string): Promise<EventRow[]> {
		const result = await ctx.pgPool.query<EventRow>(
			'SELECT * FROM notification_events WHERE recipient_id = $1 ORDER BY dedupe_key',
			[recipientId]
		)
		return result.rows
	}

	async function onlyEvent(recipientId: string): Promise<EventRow> {
		const events = await eventsOf(recipientId)
		assert.equal(events.length, 1)
		const event = events[0]
		assert.ok(event)
		return event
	}

	async function testState(testId: string): Promise<TestState> {
		const result = await ctx.pgPool.query<TestState>('SELECT is_published, version FROM tests WHERE id = $1', [testId])
		const row = result.rows[0]
		assert.ok(row)
		return row
	}

	async function student(): Promise<string> {
		return (await seedStudent(world, `stud_${suffix()}`)).id
	}

	async function draft(slug: string): Promise<string> {
		const testId = await createAttemptTest(world, { slug, isPublished: false })
		await addQuestion(world, testId, 'radio')
		return testId
	}

	function assign(testId: string, userId: string) {
		return call(ctx, 'POST', `/api/tests/${testId}/assignments`, { cookies: world.adminCookie, body: { userId } })
	}

	function settings(testId: string, slug: string, overrides: Record<string, unknown> = {}) {
		return call(ctx, 'PATCH', `/api/tests/${testId}/settings`, {
			cookies: world.adminCookie,
			body: { topicId: world.topicId, title: `Опубликованный ${slug}`, slug, isPublished: true, ...overrides },
		})
	}

	test('публикация черновика пишет событие каждому назначенному с названием на момент публикации', async () => {
		const slug = `pub-${suffix()}`
		const testId = await draft(slug)
		const [first, second] = [await student(), await student()]
		assert.equal((await assign(testId, first)).status, 200)
		assert.equal((await assign(testId, second)).status, 200)
		assert.equal((await eventsOf(first)).length, 0)
		assert.equal((await eventsOf(second)).length, 0)

		const reply = await settings(testId, slug)

		assert.equal(reply.status, 200)
		for (const userId of [first, second]) {
			const event = await onlyEvent(userId)
			assert.equal(event.kind, 'test.assigned')
			assert.equal(event.ref_seq, 1)
			assert.equal(event.read_at, null)
			assert.equal(event.actor_id, world.adminId)
			assert.equal(event.params.testTitle, `Опубликованный ${slug}`)
			const deliveries = await ctx.pgPool.query<{ channel: string; status: string }>(
				'SELECT channel, status FROM notification_deliveries WHERE event_id = $1',
				[event.id]
			)
			assert.deepEqual(deliveries.rows, [{ channel: 'inbox', status: 'sent' }])
		}
		const leaked = await ctx.pgPool.query<{ count: string }>(
			'SELECT count(*) FROM notification_events WHERE params::text LIKE $1',
			[`%Тест ${slug}%`]
		)
		assert.equal(Number(leaked.rows[0]?.count), 0)
		const [row] = await ctx.db
			.select({ isPublished: ctx.schema.tests.isPublished })
			.from(ctx.schema.tests)
			.where(eq(ctx.schema.tests.id, testId))
		assert.equal(row?.isPublished, true)
	})

	test('повторное сохранение опубликованного теста событий не пишет', async () => {
		const slug = `resave-${suffix()}`
		const testId = await draft(slug)
		const userId = await student()
		assert.equal((await assign(testId, userId)).status, 200)
		assert.equal((await settings(testId, slug)).status, 200)
		const before = await onlyEvent(userId)

		const reply = await settings(testId, slug, { description: 'Новое описание' })

		assert.equal(reply.status, 200)
		const after = await onlyEvent(userId)
		assert.equal(after.id, before.id)
		assert.equal(after.ref_seq, 1)
		assert.deepEqual(after.last_event_at, before.last_event_at)
	})

	test('снятие публикации событие не меняет, повторная публикация поднимает ref_seq и сбрасывает прочтение', async () => {
		const slug = `republish-${suffix()}`
		const testId = await draft(slug)
		const userId = await student()
		assert.equal((await assign(testId, userId)).status, 200)
		assert.equal((await settings(testId, slug)).status, 200)
		const first = await onlyEvent(userId)
		await ctx.pgPool.query(
			"UPDATE notification_events SET read_at = now(), last_event_at = last_event_at - interval '1 minute' WHERE id = $1",
			[first.id]
		)
		const shifted = await onlyEvent(userId)

		assert.equal((await settings(testId, slug, { isPublished: false })).status, 200)
		assert.deepEqual(await onlyEvent(userId), shifted)

		assert.equal((await settings(testId, slug)).status, 200)
		const again = await onlyEvent(userId)
		assert.equal(again.id, first.id)
		assert.equal(again.ref_seq, 2)
		assert.equal(again.read_at, null)
		assert.ok(again.last_event_at > shifted.last_event_at)
	})

	test('публикующий, назначенный сам себе, события не получает', async () => {
		const slug = `self-${suffix()}`
		const testId = await draft(slug)
		const userId = await student()
		assert.equal((await assign(testId, world.adminId)).status, 200)
		assert.equal((await assign(testId, userId)).status, 200)

		assert.equal((await settings(testId, slug)).status, 200)

		assert.equal((await eventsOf(world.adminId)).length, 0)
		assert.equal((await onlyEvent(userId)).ref_seq, 1)
	})

	test('публикация в выключенной теме событий не пишет', async () => {
		const [topic] = await ctx.db
			.insert(ctx.schema.topics)
			.values({ slug: `off-topic-${suffix()}`, title: 'Выключенная тема', isActive: false })
			.returning({ id: ctx.schema.topics.id })
		assert.ok(topic)
		const slug = `in-off-${suffix()}`
		const [created] = await ctx.db
			.insert(ctx.schema.tests)
			.values({ topicId: topic.id, slug, title: 'Тест в выключенной теме', isPublished: false })
			.returning({ id: ctx.schema.tests.id })
		assert.ok(created)
		const userId = await student()
		assert.equal((await assign(created.id, userId)).status, 200)
		await addQuestion(world, created.id, 'radio')

		const reply = await settings(created.id, slug, { topicId: topic.id })

		assert.equal(reply.status, 200)
		assert.equal((await testState(created.id)).is_published, true)
		assert.equal((await eventsOf(userId)).length, 0)
	})

	test('публикация с переносом по новому slug пишет событие в той же транзакции', async () => {
		const oldSlug = `move-old-${suffix()}`
		const newSlug = `move-new-${suffix()}`
		const testId = await draft(oldSlug)
		const userId = await student()
		assert.equal((await assign(testId, userId)).status, 200)

		const reply = await settings(testId, newSlug)

		assert.equal(reply.status, 200)
		assert.equal(reply.body.assetsMoved, true)
		const event = await onlyEvent(userId)
		assert.equal(event.ref_seq, 1)
		assert.equal(event.params.testTitle, `Опубликованный ${newSlug}`)
	})

	test('сбой записи события откатывает публикацию', async () => {
		const slug = `failwrite-${suffix()}`
		const testId = await draft(slug)
		const userId = await student()
		assert.equal((await assign(testId, userId)).status, 200)
		const before = await testState(testId)
		await ctx.pgPool.query(`
			CREATE FUNCTION test_fail_publish_notification() RETURNS trigger LANGUAGE plpgsql AS $$
			BEGIN RAISE EXCEPTION 'notification write failed'; END $$
		`)
		await ctx.pgPool.query(
			'CREATE TRIGGER test_fail_publish_notification BEFORE INSERT ON notification_events FOR EACH ROW EXECUTE FUNCTION test_fail_publish_notification()'
		)
		try {
			const reply = await settings(testId, slug)

			assert.equal(reply.status, 500)
			assert.deepEqual(await testState(testId), before)
			assert.equal(before.is_published, false)
			assert.equal((await eventsOf(userId)).length, 0)
		} finally {
			await ctx.pgPool.query('DROP TRIGGER test_fail_publish_notification ON notification_events')
			await ctx.pgPool.query('DROP FUNCTION test_fail_publish_notification()')
		}
	})

	test('сбой записи события при публикации с переносом откатывает публикацию и slug', async () => {
		const oldSlug = `failmove-old-${suffix()}`
		const testId = await draft(oldSlug)
		const userId = await student()
		assert.equal((await assign(testId, userId)).status, 200)
		await ctx.pgPool.query(`
			CREATE FUNCTION test_fail_publish_notification() RETURNS trigger LANGUAGE plpgsql AS $$
			BEGIN RAISE EXCEPTION 'notification write failed'; END $$
		`)
		await ctx.pgPool.query(
			'CREATE TRIGGER test_fail_publish_notification BEFORE INSERT ON notification_events FOR EACH ROW EXECUTE FUNCTION test_fail_publish_notification()'
		)
		try {
			const reply = await settings(testId, `failmove-new-${suffix()}`)

			assert.equal(reply.status, 500)
			assert.equal((await testState(testId)).is_published, false)
			const slugRow = await ctx.pgPool.query<{ slug: string }>('SELECT slug FROM tests WHERE id = $1', [testId])
			assert.equal(slugRow.rows[0]?.slug, oldSlug)
			assert.equal((await eventsOf(userId)).length, 0)
		} finally {
			await ctx.pgPool.query('DROP TRIGGER test_fail_publish_notification ON notification_events')
			await ctx.pgPool.query('DROP FUNCTION test_fail_publish_notification()')
		}
	})

	async function waitForLock(): Promise<void> {
		for (let i = 0; i < 400; i += 1) {
			const { rows } = await ctx.pgPool.query<{ count: number }>(
				"SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'"
			)
			if ((rows[0]?.count ?? 0) > 0) return
			await new Promise((resolve) => setTimeout(resolve, 25))
		}
		assert.fail('назначение не дождалось блокировки строки теста')
	}

	test('назначение, читающее тест пока публикация не зафиксирована, ждёт её и пишет событие', async () => {
		const slug = `race-${suffix()}`
		const testId = await draft(slug)
		const userId = await student()
		const client = new Client({ connectionString: ctx.pgPool.options.connectionString })
		await client.connect()
		try {
			await client.query('BEGIN')
			await client.query('UPDATE tests SET is_published = true, version = version + 1 WHERE id = $1', [testId])
			const pending = assign(testId, userId)
			await waitForLock()
			await client.query('COMMIT')

			const reply = await pending

			assert.equal(reply.status, 200)
		} finally {
			await client.end()
		}
		assert.equal((await onlyEvent(userId)).ref_seq, 1)
	})
})

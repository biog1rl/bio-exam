import { and, eq } from 'drizzle-orm'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { afterAll, beforeAll, describe, test } from 'vitest'

import {
	createAttemptTest,
	seedAttemptWorld,
	seedStudent,
	type AttemptWorld,
} from '../../test-support/attempt-world.js'
import { call, seedUser, startAuthApp, type AuthApp } from '../../test-support/auth-app.js'
import { seedTeacherZoneWorld, type TeacherZoneWorld } from '../../test-support/teacher-zone-world.js'

type NotificationsModule = typeof import('../../services/notifications/index.js')

type EventRow = {
	id: string
	actor_id: string | null
	kind: string
	subject_type: string
	subject_id: string
	dedupe_key: string
	params: Record<string, unknown>
	ref_seq: number
	read_at: Date | null
	last_event_at: Date
}

function suffix(): string {
	return crypto.randomUUID().slice(0, 8)
}

async function eventsOf(ctx: AuthApp, recipientId: string): Promise<EventRow[]> {
	const result = await ctx.pgPool.query<EventRow>(
		'SELECT * FROM notification_events WHERE recipient_id = $1 ORDER BY dedupe_key',
		[recipientId]
	)
	return result.rows
}

async function assignmentCount(ctx: AuthApp, testId: string, userId: string): Promise<number> {
	const result = await ctx.pgPool.query<{ count: string }>(
		'SELECT count(*) FROM test_assignments WHERE test_id = $1 AND user_id = $2',
		[testId, userId]
	)
	return Number(result.rows[0]?.count ?? 0)
}

async function onlyEvent(ctx: AuthApp, recipientId: string): Promise<EventRow> {
	const events = await eventsOf(ctx, recipientId)
	assert.equal(events.length, 1)
	const event = events[0]
	assert.ok(event)
	return event
}

describe('события назначения теста', () => {
	let ctx: AuthApp
	let world: AttemptWorld
	let notifications: NotificationsModule

	beforeAll(async () => {
		ctx = await startAuthApp('test_assignment_notifications')
		world = await seedAttemptWorld(ctx, 'assignnotif')
		notifications = await import('../../services/notifications/index.js')
	}, 60_000)

	afterAll(async () => {
		await ctx?.stop()
	})

	async function student(options: { isActive?: boolean } = {}): Promise<string> {
		if (options.isActive === false) {
			return seedUser(ctx, {
				login: `off_${suffix()}`,
				roles: ['user'],
				password: world.password,
				isActive: false,
			})
		}
		return (await seedStudent(world, `stud_${suffix()}`)).id
	}

	function assignDirect(testId: string, userId: string) {
		return call(ctx, 'POST', `/api/tests/${testId}/assignments`, { cookies: world.adminCookie, body: { userId } })
	}

	test('назначение опубликованного теста пишет событие и доставку inbox в одной транзакции', async () => {
		const userId = await student()
		const testId = await createAttemptTest(world, { slug: `pub-${suffix()}` })

		const reply = await assignDirect(testId, userId)

		assert.equal(reply.status, 200)
		assert.deepEqual(reply.body, { ok: true })
		const event = await onlyEvent(ctx, userId)
		assert.equal(event.kind, 'test.assigned')
		assert.equal(event.subject_type, 'test')
		assert.equal(event.subject_id, testId)
		assert.equal(event.dedupe_key, `test.assigned:${testId}`)
		assert.equal(event.actor_id, world.adminId)
		assert.equal(event.ref_seq, 1)
		assert.equal(event.read_at, null)
		const [row] = await ctx.db
			.select({ title: ctx.schema.tests.title })
			.from(ctx.schema.tests)
			.where(eq(ctx.schema.tests.id, testId))
		assert.equal(event.params.testTitle, row?.title)
		const deliveries = await ctx.pgPool.query<{ channel: string; status: string }>(
			'SELECT channel, status FROM notification_deliveries WHERE event_id = $1',
			[event.id]
		)
		assert.deepEqual(deliveries.rows, [{ channel: 'inbox', status: 'sent' }])
	})

	test('повтор запроса не даёт события; назначение после снятия поднимает ref_seq, сбрасывает прочтение и не трогает событие при снятии', async () => {
		const userId = await student()
		const testId = await createAttemptTest(world, { slug: `repeat-${suffix()}` })

		assert.equal((await assignDirect(testId, userId)).status, 200)
		assert.equal((await assignDirect(testId, userId)).status, 200)
		const first = await onlyEvent(ctx, userId)
		assert.equal(first.ref_seq, 1)

		await ctx.pgPool.query(
			"UPDATE notification_events SET read_at = now(), last_event_at = last_event_at - interval '1 minute' WHERE id = $1",
			[first.id]
		)
		const shifted = await onlyEvent(ctx, userId)
		const removed = await call(ctx, 'DELETE', `/api/tests/${testId}/assignments/${userId}`, {
			cookies: world.adminCookie,
		})
		assert.equal(removed.status, 200)
		assert.equal(await assignmentCount(ctx, testId, userId), 0)
		const afterRemoval = await onlyEvent(ctx, userId)
		assert.deepEqual(afterRemoval, shifted)

		assert.equal((await assignDirect(testId, userId)).status, 200)
		const again = await onlyEvent(ctx, userId)
		assert.equal(again.id, first.id)
		assert.equal(again.ref_seq, 2)
		assert.equal(again.read_at, null)
		assert.ok(again.last_event_at > shifted.last_event_at)
	})

	test('групповое назначение пишет события только вставленным ученикам', async () => {
		const [a, b, c] = [await student(), await student(), await student()]
		assert.ok(a && b && c)
		const testId = await createAttemptTest(world, { slug: `group-${suffix()}` })
		const [group] = await ctx.db
			.insert(ctx.schema.studentGroups)
			.values({ name: `Группа ${suffix()}`, createdBy: world.adminId })
			.returning({ id: ctx.schema.studentGroups.id })
		assert.ok(group)
		await ctx.db.insert(ctx.schema.userGroups).values([a, b, c].map((userId) => ({ groupId: group.id, userId })))
		assert.equal((await assignDirect(testId, a)).status, 200)

		const reply = await call(ctx, 'POST', `/api/tests/${testId}/assignments/group/${group.id}`, {
			cookies: world.adminCookie,
		})

		assert.equal(reply.status, 200)
		assert.deepEqual(reply.body, { ok: true, assigned: 2 })
		for (const userId of [a, b, c]) assert.equal((await onlyEvent(ctx, userId)).ref_seq, 1)
		const assignedRows = await ctx.pgPool.query<{ count: string }>(
			'SELECT count(*) FROM test_assignments WHERE test_id = $1',
			[testId]
		)
		assert.equal(Number(assignedRows.rows[0]?.count), 3)
	})

	test('назначение из профиля пишет событие', async () => {
		const userId = await student()
		const testId = await createAttemptTest(world, { slug: `profile-${suffix()}` })

		const reply = await call(ctx, 'POST', `/api/users/${userId}/test-assignments`, {
			cookies: world.adminCookie,
			body: { testId },
		})

		assert.equal(reply.status, 200)
		assert.deepEqual(reply.body, { ok: true })
		const event = await onlyEvent(ctx, userId)
		assert.equal(event.subject_id, testId)
		assert.equal(event.actor_id, world.adminId)
	})

	test('назначающий и получатель один человек: назначение есть, события нет', async () => {
		const testId = await createAttemptTest(world, { slug: `self-${suffix()}` })

		assert.equal((await assignDirect(testId, world.adminId)).status, 200)

		assert.equal(await assignmentCount(ctx, testId, world.adminId), 1)
		assert.equal((await eventsOf(ctx, world.adminId)).length, 0)
	})

	test('отключённый ученик получает событие', async () => {
		const userId = await student({ isActive: false })
		const testId = await createAttemptTest(world, { slug: `off-${suffix()}` })

		assert.equal((await assignDirect(testId, userId)).status, 200)

		assert.equal(await assignmentCount(ctx, testId, userId), 1)
		assert.equal((await onlyEvent(ctx, userId)).subject_id, testId)
	})

	test('неопубликованный тест: назначение есть, события нет, названия черновика в журнале нет', async () => {
		const slug = `draft-${suffix()}`
		const testId = await createAttemptTest(world, { slug, isPublished: false })
		const direct = await student()
		const grouped = await student()
		const [group] = await ctx.db
			.insert(ctx.schema.studentGroups)
			.values({ name: `Группа ${suffix()}`, createdBy: world.adminId })
			.returning({ id: ctx.schema.studentGroups.id })
		assert.ok(group)
		await ctx.db.insert(ctx.schema.userGroups).values({ groupId: group.id, userId: grouped })

		assert.equal((await assignDirect(testId, direct)).status, 200)
		const byGroup = await call(ctx, 'POST', `/api/tests/${testId}/assignments/group/${group.id}`, {
			cookies: world.adminCookie,
		})

		assert.equal(byGroup.status, 200)
		assert.deepEqual(byGroup.body, { ok: true, assigned: 1 })
		assert.equal(await assignmentCount(ctx, testId, direct), 1)
		assert.equal(await assignmentCount(ctx, testId, grouped), 1)
		assert.equal((await eventsOf(ctx, direct)).length, 0)
		assert.equal((await eventsOf(ctx, grouped)).length, 0)
		const leaked = await ctx.pgPool.query<{ count: string }>(
			'SELECT count(*) FROM notification_events WHERE params::text LIKE $1',
			[`%${slug}%`]
		)
		assert.equal(Number(leaked.rows[0]?.count), 0)
	})

	test('опубликованный тест в выключенной теме: назначение есть, события нет', async () => {
		const [topic] = await ctx.db
			.insert(ctx.schema.topics)
			.values({ slug: `off-topic-${suffix()}`, title: 'Выключенная тема', isActive: false })
			.returning({ id: ctx.schema.topics.id })
		assert.ok(topic)
		const [created] = await ctx.db
			.insert(ctx.schema.tests)
			.values({ topicId: topic.id, slug: `in-off-${suffix()}`, title: 'Тест в выключенной теме', isPublished: true })
			.returning({ id: ctx.schema.tests.id })
		assert.ok(created)
		const userId = await student()

		assert.equal((await assignDirect(created.id, userId)).status, 200)

		assert.equal(await assignmentCount(ctx, created.id, userId), 1)
		assert.equal((await eventsOf(ctx, userId)).length, 0)
	})

	test('откат причины откатывает событие', async () => {
		const userId = await student()
		const testId = await createAttemptTest(world, { slug: `rollback-${suffix()}` })
		const { testAssignments } = ctx.schema

		await assert.rejects(
			ctx.db.transaction(async (tx) => {
				await tx.insert(testAssignments).values({ testId, userId, assignedBy: world.adminId })
				await notifications.recordTestAssigned(tx, { testId, actorId: world.adminId, recipientIds: [userId] })
				const inside = await tx
					.select()
					.from(testAssignments)
					.where(and(eq(testAssignments.testId, testId), eq(testAssignments.userId, userId)))
				assert.equal(inside.length, 1)
				const insideEvents = await tx
					.select({ id: ctx.schema.notificationEvents.id })
					.from(ctx.schema.notificationEvents)
					.where(eq(ctx.schema.notificationEvents.recipientId, userId))
				assert.equal(insideEvents.length, 1)
				throw new Error('rollback')
			}),
			{ message: 'rollback' }
		)

		assert.equal(await assignmentCount(ctx, testId, userId), 0)
		assert.equal((await eventsOf(ctx, userId)).length, 0)
	})

	test('два одинаковых параллельных назначения оставляют одно событие', async () => {
		const userId = await student()
		const testId = await createAttemptTest(world, { slug: `parallel-${suffix()}` })

		const replies = await Promise.all([assignDirect(testId, userId), assignDirect(testId, userId)])

		for (const reply of replies) {
			assert.equal(reply.status, 200)
			assert.deepEqual(reply.body, { ok: true })
		}
		assert.equal(await assignmentCount(ctx, testId, userId), 1)
		assert.equal((await onlyEvent(ctx, userId)).ref_seq, 1)
	})

	test('сбой записи события откатывает назначение в маршруте', async () => {
		const userId = await student()
		const testId = await createAttemptTest(world, { slug: `failwrite-${suffix()}` })
		await ctx.pgPool.query(`
			CREATE FUNCTION test_fail_notification() RETURNS trigger LANGUAGE plpgsql AS $$
			BEGIN RAISE EXCEPTION 'notification write failed'; END $$
		`)
		await ctx.pgPool.query(
			'CREATE TRIGGER test_fail_notification BEFORE INSERT ON notification_events FOR EACH ROW EXECUTE FUNCTION test_fail_notification()'
		)
		try {
			const reply = await assignDirect(testId, userId)

			assert.equal(reply.status, 500)
			assert.equal(await assignmentCount(ctx, testId, userId), 0)
			assert.equal((await eventsOf(ctx, userId)).length, 0)
		} finally {
			await ctx.pgPool.query('DROP TRIGGER test_fail_notification ON notification_events')
			await ctx.pgPool.query('DROP FUNCTION test_fail_notification()')
		}
	})
})

describe('события назначения учителем', () => {
	let ctx: AuthApp
	let w: TeacherZoneWorld

	beforeAll(async () => {
		ctx = await startAuthApp('test_assignment_notifications_teacher')
		w = await seedTeacherZoneWorld(ctx, 'assignteach')
	}, 120_000)

	afterAll(async () => {
		await ctx?.stop()
	})

	test('учитель назначает тест своей группе: событие с actor_id учителя', async () => {
		const pupil = await w.freshUser()
		const groupId = await w.freshGroup({ owner: w.users.teacherA.id, members: [pupil.id] })
		const created = await w.freshTest('X')

		const reply = await call(ctx, 'POST', `/api/tests/${created.id}/assignments/group/${groupId}`, {
			cookies: w.users.teacherA.cookie,
		})

		assert.equal(reply.status, 200)
		assert.deepEqual(reply.body, { ok: true, assigned: 1 })
		const event = await onlyEvent(ctx, pupil.id)
		assert.equal(event.actor_id, w.users.teacherA.id)
		assert.equal(event.subject_id, created.id)
	})

	test('группа чужого учителя: 403, ни назначения, ни события', async () => {
		const pupil = await w.freshUser()
		const groupId = await w.freshGroup({ owner: w.users.teacherB.id, members: [pupil.id] })
		const created = await w.freshTest('X')

		const reply = await call(ctx, 'POST', `/api/tests/${created.id}/assignments/group/${groupId}`, {
			cookies: w.users.teacherA.cookie,
		})

		assert.equal(reply.status, 403)
		assert.equal(await assignmentCount(ctx, created.id, pupil.id), 0)
		assert.equal((await eventsOf(ctx, pupil.id)).length, 0)
	})
})

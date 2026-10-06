import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { afterAll, beforeAll, describe, test } from 'vitest'

import { createAttemptTest, seedAttemptWorld, seedStudent, type AttemptWorld } from '../test-support/attempt-world.js'
import { call, startAuthApp, type AuthApp } from '../test-support/auth-app.js'

type NotificationsModule = typeof import('../services/notifications/index.js')

type ListBody = { items: { id: string; kind: string; text: string; read: boolean }[] }

function suffix(): string {
	return crypto.randomUUID().slice(0, 8)
}

describe('глубокая ссылка уведомления с повторной проверкой доступа', () => {
	let ctx: AuthApp
	let world: AttemptWorld
	let notifications: NotificationsModule

	beforeAll(async () => {
		ctx = await startAuthApp('test_notification_open')
		world = await seedAttemptWorld(ctx, 'notifopen')
		notifications = await import('../services/notifications/index.js')
	}, 60_000)

	afterAll(async () => {
		await ctx?.stop()
	})

	function assign(testId: string, userId: string) {
		return call(ctx, 'POST', `/api/tests/${testId}/assignments`, { cookies: world.adminCookie, body: { userId } })
	}

	function open(cookie: string, id: string) {
		return call(ctx, 'GET', `/api/notifications/${id}/open`, { cookies: cookie })
	}

	async function list(cookie: string): Promise<ListBody['items']> {
		const reply = await call(ctx, 'GET', '/api/notifications', { cookies: cookie })
		assert.equal(reply.status, 200)
		return (reply.body as unknown as ListBody).items
	}

	async function eventRow(recipientId: string, subjectId?: string) {
		const result = await ctx.pgPool.query<{ id: string; read_at: Date | null; ref_seq: number }>(
			'SELECT id, read_at, ref_seq FROM notification_events WHERE recipient_id = $1 AND ($2::uuid IS NULL OR subject_id = $2::uuid)',
			[recipientId, subjectId ?? null]
		)
		assert.equal(result.rows.length, 1)
		return result.rows[0]!
	}

	async function assignedScenario(slug: string) {
		const student = await seedStudent(world, `stud_${suffix()}`)
		const testId = await createAttemptTest(world, { slug: `${slug}-${suffix()}` })
		assert.equal((await assign(testId, student.id)).status, 200)
		const event = await eventRow(student.id)
		const [row] = await ctx.pgPool
			.query<{ slug: string }>('SELECT slug FROM tests WHERE id = $1', [testId])
			.then((result) => result.rows)
		return { student, testId, eventId: event.id, testSlug: row!.slug }
	}

	function assertNoAccess(reply: { status: number; body: Record<string, unknown> }): void {
		assert.equal(reply.status, 403)
		assert.deepEqual(reply.body, { error: 'NO_ACCESS' })
	}

	async function readAt(eventId: string): Promise<Date | null> {
		const result = await ctx.pgPool.query<{ read_at: Date | null }>(
			'SELECT read_at FROM notification_events WHERE id = $1',
			[eventId]
		)
		return result.rows[0]!.read_at
	}

	test('назначенный тест открывается из события ссылкой на страницу теста и отмечается прочитанным', async () => {
		const { student, eventId, testSlug } = await assignedScenario('open-ok')
		const items = await list(student.cookie)
		assert.equal(items.length, 1)
		assert.equal(items[0]!.id, eventId)

		const opened = await open(student.cookie, eventId)

		assert.equal(opened.status, 200)
		assert.deepEqual(opened.body, { href: `/tests/${world.topicSlug}/${testSlug}` })
		const count = await call(ctx, 'GET', '/api/notifications/unread-count', { cookies: student.cookie })
		assert.deepEqual(count.body, { count: 0 })
		assert.equal((await open(student.cookie, eventId)).status, 200)
	})

	test('снятие назначения даёт отказ, событие остаётся, повторное назначение возвращает ссылку', async () => {
		const { student, testId, eventId, testSlug } = await assignedScenario('revoke')
		const before = await list(student.cookie)

		const removed = await call(ctx, 'DELETE', `/api/tests/${testId}/assignments/${student.id}`, {
			cookies: world.adminCookie,
		})
		assert.equal(removed.status, 200)

		assertNoAccess(await open(student.cookie, eventId))
		const after = await list(student.cookie)
		assert.equal(after.length, 1)
		assert.equal(after[0]!.text, before[0]!.text)
		assert.match(after[0]!.text, /«Тест revoke-/)

		assert.equal((await assign(testId, student.id)).status, 200)
		const again = await eventRow(student.id)
		assert.equal(again.id, eventId)
		assert.equal(again.ref_seq, 2)
		assert.equal(again.read_at, null)
		const opened = await open(student.cookie, eventId)
		assert.equal(opened.status, 200)
		assert.deepEqual(opened.body, { href: `/tests/${world.topicSlug}/${testSlug}` })
	})

	test('снятие публикации даёт отказ, возврат публикации возвращает ссылку', async () => {
		const { student, testId, eventId } = await assignedScenario('unpublish')

		await ctx.pgPool.query('UPDATE tests SET is_published = false WHERE id = $1', [testId])
		assertNoAccess(await open(student.cookie, eventId))

		await ctx.pgPool.query('UPDATE tests SET is_published = true WHERE id = $1', [testId])
		assert.equal((await open(student.cookie, eventId)).status, 200)
	})

	test('отключённая тема даёт отказ', async () => {
		const student = await seedStudent(world, `stud_${suffix()}`)
		const [topic] = await ctx.db
			.insert(ctx.schema.topics)
			.values({ slug: `off-${suffix()}`, title: 'Тема для отключения', isActive: true })
			.returning({ id: ctx.schema.topics.id })
		assert.ok(topic)
		const [created] = await ctx.db
			.insert(ctx.schema.tests)
			.values({ topicId: topic.id, slug: `off-test-${suffix()}`, title: 'Тест в отключаемой теме', isPublished: true })
			.returning({ id: ctx.schema.tests.id })
		assert.ok(created)
		assert.equal((await assign(created.id, student.id)).status, 200)
		const event = await eventRow(student.id)
		assert.equal((await open(student.cookie, event.id)).status, 200)

		await ctx.pgPool.query('UPDATE topics SET is_active = false WHERE id = $1', [topic.id])

		assertNoAccess(await open(student.cookie, event.id))
	})

	test('удаление теста оставляет событие и даёт отказ', async () => {
		const { student, testId, eventId } = await assignedScenario('deleted')

		await ctx.pgPool.query('DELETE FROM tests WHERE id = $1', [testId])

		assertNoAccess(await open(student.cookie, eventId))
		assert.equal((await list(student.cookie)).length, 1)
	})

	test('group leave keeps access while the assignment exists (D-09)', async () => {
		const student = await seedStudent(world, `stud_${suffix()}`)
		const testId = await createAttemptTest(world, { slug: `group-leave-${suffix()}` })
		const [group] = await ctx.db
			.insert(ctx.schema.studentGroups)
			.values({ name: `Группа ${suffix()}`, createdBy: world.adminId })
			.returning({ id: ctx.schema.studentGroups.id })
		assert.ok(group)
		await ctx.db.insert(ctx.schema.userGroups).values({ groupId: group.id, userId: student.id })
		const assigned = await call(ctx, 'POST', `/api/tests/${testId}/assignments/group/${group.id}`, {
			cookies: world.adminCookie,
		})
		assert.equal(assigned.status, 200)
		const event = await eventRow(student.id)

		await ctx.pgPool.query('DELETE FROM user_groups WHERE group_id = $1 AND user_id = $2', [group.id, student.id])

		const opened = await open(student.cookie, event.id)
		assert.equal(opened.status, 200)
		assert.equal(typeof opened.body.href, 'string')
	})

	test('чужое, несуществующее и неверное по формату событие дают один отказ; чужое остаётся непрочитанным', async () => {
		const owner = await assignedScenario('foreign')
		const stranger = await seedStudent(world, `stud_${suffix()}`)

		assertNoAccess(await open(stranger.cookie, owner.eventId))
		assert.equal(await readAt(owner.eventId), null)
		assertNoAccess(await open(stranger.cookie, crypto.randomUUID()))
		assertNoAccess(await open(stranger.cookie, 'abc'))
	})

	test('неизвестный вид даёт отказ и отмечается прочитанным', async () => {
		const student = await seedStudent(world, `stud_${suffix()}`)
		const chatId = crypto.randomUUID()
		await ctx.db.transaction((tx) =>
			notifications.recordNotification(tx, {
				recipientId: student.id,
				actorId: world.adminId,
				kind: 'chat.message',
				subject: { type: 'chat', id: chatId },
				dedupeKey: `chat.message:${chatId}`,
				params: {},
			})
		)
		const event = await eventRow(student.id)
		assert.equal(event.read_at, null)

		assertNoAccess(await open(student.cookie, event.id))

		assert.notEqual(await readAt(event.id), null)
	})

	test.each([
		{ name: 'персонал открывает тест без назначения', subjectType: 'test', status: 200 },
		{ name: 'субъект не теста даёт отказ', subjectType: 'question', status: 403 },
	])('$name', async ({ subjectType, status }) => {
		const testId = await createAttemptTest(world, { slug: `staff-${suffix()}` })
		const [row] = await ctx.pgPool
			.query<{ slug: string }>('SELECT slug FROM tests WHERE id = $1', [testId])
			.then((result) => result.rows)
		await ctx.db.transaction((tx) =>
			notifications.recordNotification(tx, {
				recipientId: world.adminId,
				actorId: null,
				kind: 'test.assigned',
				subject: { type: subjectType, id: testId },
				dedupeKey: `test.assigned:${testId}`,
				params: { testTitle: 'Тест' },
			})
		)
		const event = await eventRow(world.adminId, testId)

		const reply = await open(world.adminCookie, event.id)

		assert.equal(reply.status, status)
		if (status === 200) assert.deepEqual(reply.body, { href: `/tests/${world.topicSlug}/${row!.slug}` })
		else assert.deepEqual(reply.body, { error: 'NO_ACCESS' })
	})

	test('без сессии 401', async () => {
		const reply = await call(ctx, 'GET', `/api/notifications/${crypto.randomUUID()}/open`)
		assert.equal(reply.status, 401)
		assert.deepEqual(reply.body, { error: 'Unauthorized' })
	})
})

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { afterAll, beforeAll, describe, test } from 'vitest'

import { seedAttemptWorld, seedStudent, type AttemptWorld } from '../test-support/attempt-world.js'
import { call, startAuthApp, type AuthApp } from '../test-support/auth-app.js'

type NotificationsModule = typeof import('../services/notifications/index.js')
type Overrides = Partial<Parameters<NotificationsModule['recordNotification']>[1]>

type ListBody = {
	items: { id: string; kind: string; text: string; read: boolean; lastEventAt: string }[]
	nextCursor: string | null
}

function suffix(): string {
	return crypto.randomUUID().slice(0, 8)
}

function cursorOf(value: unknown): string {
	return Buffer.from(JSON.stringify(value)).toString('base64url')
}

describe('чтение журнала уведомлений', () => {
	let ctx: AuthApp
	let world: AttemptWorld
	let notifications: NotificationsModule

	beforeAll(async () => {
		ctx = await startAuthApp('test_notifications_routes')
		world = await seedAttemptWorld(ctx, 'notifroutes')
		notifications = await import('../services/notifications/index.js')
	}, 60_000)

	afterAll(async () => {
		await ctx?.stop()
	})

	async function user(): Promise<{ id: string; cookie: string }> {
		return seedStudent(world, `stud_${suffix()}`)
	}

	async function record(recipientId: string, overrides: Overrides = {}): Promise<void> {
		const id = crypto.randomUUID()
		await ctx.db.transaction((tx) =>
			notifications.recordNotification(tx, {
				recipientId,
				actorId: world.adminId,
				kind: 'test.assigned',
				subject: { type: 'test', id },
				dedupeKey: `test.assigned:${id}`,
				params: { testTitle: `Тест ${id.slice(0, 8)}` },
				...overrides,
			})
		)
	}

	async function recordMany(recipientId: string, count: number): Promise<void> {
		await ctx.db.transaction((tx) =>
			notifications.recordNotifications(
				tx,
				Array.from({ length: count }, (_, index) => {
					const id = crypto.randomUUID()
					return {
						recipientId,
						actorId: world.adminId,
						kind: 'test.assigned',
						subject: { type: 'test', id },
						dedupeKey: `test.assigned:${id}:${index}`,
						params: { testTitle: `Тест ${index}` },
					}
				})
			)
		)
	}

	async function list(cookie: string, query = ''): Promise<{ status: number; body: ListBody }> {
		const reply = await call(ctx, 'GET', `/api/notifications${query}`, { cookies: cookie })
		return { status: reply.status, body: reply.body as unknown as ListBody }
	}

	async function unread(cookie: string): Promise<number> {
		const reply = await call(ctx, 'GET', '/api/notifications/unread-count', { cookies: cookie })
		assert.equal(reply.status, 200)
		return reply.body.count as number
	}

	async function eventIds(recipientId: string): Promise<string[]> {
		const result = await ctx.pgPool.query<{ id: string }>(
			'SELECT id FROM notification_events WHERE recipient_id = $1',
			[recipientId]
		)
		return result.rows.map((row) => row.id)
	}

	test('число непрочитанных точное и только своё; без сессии 401', async () => {
		const a = await user()
		const b = await user()
		await recordMany(a.id, 11)
		await recordMany(b.id, 2)

		const own = await call(ctx, 'GET', '/api/notifications/unread-count', { cookies: a.cookie })
		assert.equal(own.status, 200)
		assert.deepEqual(own.body, { count: 11 })
		assert.deepEqual((await call(ctx, 'GET', '/api/notifications/unread-count', { cookies: b.cookie })).body, {
			count: 2,
		})

		const anonymous = await call(ctx, 'GET', '/api/notifications/unread-count')
		assert.equal(anonymous.status, 401)
		assert.deepEqual(anonymous.body, { error: 'Unauthorized' })
	})

	test('список: только свои события, форма item и порядок по убыванию', async () => {
		const a = await user()
		const b = await user()
		await recordMany(a.id, 3)
		await recordMany(b.id, 2)
		const own = new Set(await eventIds(a.id))

		const reply = await list(a.cookie)

		assert.equal(reply.status, 200)
		assert.equal(reply.body.items.length, 3)
		assert.equal(reply.body.nextCursor, null)
		for (const item of reply.body.items) {
			assert.deepEqual(Object.keys(item).sort(), ['id', 'kind', 'lastEventAt', 'read', 'text'])
			assert.ok(own.has(item.id))
			assert.equal(item.read, false)
			assert.ok(Number.isFinite(Date.parse(item.lastEventAt)))
		}
		const ids = reply.body.items.map((item) => item.id)
		assert.deepEqual(ids, [...ids].sort().reverse())
		const anonymous = await call(ctx, 'GET', '/api/notifications')
		assert.equal(anonymous.status, 401)
		assert.deepEqual(anonymous.body, { error: 'Unauthorized' })
	})

	test('страницы по 1 не теряют строки с разницей в микросекунды', async () => {
		const a = await user()
		await record(a.id)
		await record(a.id)
		const [first, second] = await eventIds(a.id)
		assert.ok(first && second)
		await ctx.pgPool.query(
			"UPDATE notification_events SET last_event_at = '2026-10-06T14:05:00.123456Z' WHERE id = $1",
			[first]
		)
		await ctx.pgPool.query(
			"UPDATE notification_events SET last_event_at = '2026-10-06T14:05:00.123400Z' WHERE id = $1",
			[second]
		)

		const page1 = await list(a.cookie, '?limit=1')
		assert.equal(page1.status, 200)
		assert.deepEqual(
			page1.body.items.map((item) => [item.id, item.lastEventAt]),
			[[first, '2026-10-06T14:05:00.123456Z']]
		)
		assert.ok(page1.body.nextCursor)

		const page2 = await list(a.cookie, `?limit=1&cursor=${page1.body.nextCursor}`)
		assert.equal(page2.status, 200)
		assert.deepEqual(
			page2.body.items.map((item) => [item.id, item.lastEventAt]),
			[[second, '2026-10-06T14:05:00.123400Z']]
		)
		assert.equal(page2.body.nextCursor, null)
	})

	test('страницы по 1 при равном last_event_at отдают три разных id по убыванию', async () => {
		const a = await user()
		await recordMany(a.id, 3)
		const expected = (await eventIds(a.id)).sort().reverse()

		const seen: string[] = []
		let cursor: string | null = null
		for (let page = 0; page < 3; page += 1) {
			const reply: { status: number; body: ListBody } = await list(
				a.cookie,
				`?limit=1${cursor ? `&cursor=${cursor}` : ''}`
			)
			assert.equal(reply.status, 200)
			assert.equal(reply.body.items.length, 1)
			seen.push(reply.body.items[0]!.id)
			cursor = reply.body.nextCursor
		}

		assert.deepEqual(seen, expected)
		assert.equal(cursor, null)
	})

	test('по умолчанию 20 строк: 21 событие дают две страницы', async () => {
		const c = await user()
		await recordMany(c.id, 21)

		const page1 = await list(c.cookie)
		assert.equal(page1.body.items.length, 20)
		assert.ok(page1.body.nextCursor)

		const page2 = await list(c.cookie, `?cursor=${page1.body.nextCursor}`)
		assert.equal(page2.body.items.length, 1)
		assert.equal(page2.body.nextCursor, null)
		const all = new Set([...page1.body.items, ...page2.body.items].map((item) => item.id))
		assert.equal(all.size, 21)
	})

	const validTime = '2026-10-06T14:05:00.123456Z'
	const someUuid = '7f1b6a52-3c0e-4a46-9d5a-0a1b2c3d4e5f'

	test.each([
		['limit 0', '?limit=0'],
		['limit 51', '?limit=51'],
		['limit abc', '?limit=abc'],
		['cursor abc', '?cursor=abc'],
		['cursor с несуществующей датой', `?cursor=${cursorOf(['2026-13-45T00:00:00.000000Z', someUuid])}`],
		['cursor с не-uuid', `?cursor=${cursorOf([validTime, 'not-a-uuid'])}`],
		['cursor без микросекунд', `?cursor=${cursorOf(['2026-10-06T14:05:00.123Z', someUuid])}`],
		['cursor пустой', '?cursor='],
	])('неверный запрос списка: %s - 400', async (_name, query) => {
		const a = await user()
		const reply = await call(ctx, 'GET', `/api/notifications${query}`, { cookies: a.cookie })
		assert.equal(reply.status, 400)
		assert.equal(reply.body.error, 'Invalid request')
	})

	test.each([
		['название', 'test.assigned', { testTitle: 'Строение клетки' }, 'Вам назначен тест «Строение клетки»'],
		['кавычки внутри', 'test.assigned', { testTitle: 'Тест "Клетка"' }, 'Вам назначен тест «Тест "Клетка"»'],
		['пустые params', 'test.assigned', {}, 'Вам назначен тест'],
		['пустое название', 'test.assigned', { testTitle: '' }, 'Вам назначен тест'],
		['число вместо названия', 'test.assigned', { testTitle: 42 }, 'Вам назначен тест'],
		['неизвестный вид', 'chat.message', { testTitle: 'Строение клетки' }, 'Новое уведомление'],
	])('текст строки в списке: %s', async (_name, kind, params, text) => {
		const a = await user()
		await record(a.id, { kind, params })

		const reply = await list(a.cookie)

		assert.equal(reply.status, 200)
		assert.deepEqual(
			reply.body.items.map((item) => [item.kind, item.text]),
			[[kind, text]]
		)
	})

	test.each([
		['test.assigned', { testTitle: ' Клетка ' }, 'Вам назначен тест « Клетка »'],
		['test.assigned', { testTitle: '   ' }, 'Вам назначен тест'],
		['test.assigned', null, 'Вам назначен тест'],
		['test.assigned', [], 'Вам назначен тест'],
		['test.assigned', 'строка', 'Вам назначен тест'],
		['constructor', {}, 'Новое уведомление'],
		['__proto__', {}, 'Новое уведомление'],
		['toString', {}, 'Новое уведомление'],
	])('notificationText(%s, %j)', (kind, params, text) => {
		assert.equal(notifications.notificationText(kind, params), text)
	})

	test('прочитать своё: 200, в списке read, число уменьшилось, повтор сохраняет первый read_at', async () => {
		const a = await user()
		await recordMany(a.id, 2)
		const [target] = (await list(a.cookie)).body.items
		assert.ok(target)

		const first = await call(ctx, 'POST', `/api/notifications/${target.id}/read`, { cookies: a.cookie })
		assert.equal(first.status, 200)
		assert.deepEqual(first.body, { ok: true })
		assert.equal(await unread(a.cookie), 1)
		const listed = (await list(a.cookie)).body.items.find((item) => item.id === target.id)
		assert.equal(listed?.read, true)
		const readAt = await ctx.pgPool.query<{ read_at: Date }>('SELECT read_at FROM notification_events WHERE id = $1', [
			target.id,
		])

		const again = await call(ctx, 'POST', `/api/notifications/${target.id}/read`, { cookies: a.cookie })
		assert.equal(again.status, 200)
		const readAtAgain = await ctx.pgPool.query<{ read_at: Date }>(
			'SELECT read_at FROM notification_events WHERE id = $1',
			[target.id]
		)
		assert.deepEqual(readAtAgain.rows, readAt.rows)
		assert.equal(await unread(a.cookie), 1)
	})

	test.each([
		['чужое событие', 'foreign'],
		['несуществующий uuid', crypto.randomUUID()],
		['не uuid', 'abc'],
	])('прочитать: %s - одинаковый 404, чужое остаётся непрочитанным', async (_name, target) => {
		const a = await user()
		const b = await user()
		await record(b.id)
		const [foreign] = await eventIds(b.id)
		assert.ok(foreign)

		const reply = await call(ctx, 'POST', `/api/notifications/${target === 'foreign' ? foreign : target}/read`, {
			cookies: a.cookie,
		})

		assert.equal(reply.status, 404)
		assert.deepEqual(reply.body, { error: 'Not found' })
		assert.equal(await unread(b.cookie), 1)
	})

	test('прочитать все: свои события, число другого пользователя не меняется', async () => {
		const a = await user()
		const b = await user()
		await recordMany(a.id, 3)
		await recordMany(b.id, 2)

		const reply = await call(ctx, 'POST', '/api/notifications/read-all', { cookies: a.cookie })

		assert.equal(reply.status, 200)
		assert.deepEqual(reply.body, { ok: true })
		assert.equal(await unread(a.cookie), 0)
		assert.equal(await unread(b.cookie), 2)
		assert.ok((await list(a.cookie)).body.items.every((item) => item.read))
	})

	test('отметки без сессии - 401', async () => {
		const anonymousAll = await call(ctx, 'POST', '/api/notifications/read-all')
		assert.equal(anonymousAll.status, 401)
		assert.deepEqual(anonymousAll.body, { error: 'Unauthorized' })
		const anonymousOne = await call(ctx, 'POST', `/api/notifications/${crypto.randomUUID()}/read`)
		assert.equal(anonymousOne.status, 401)
		assert.deepEqual(anonymousOne.body, { error: 'Unauthorized' })
	})
})

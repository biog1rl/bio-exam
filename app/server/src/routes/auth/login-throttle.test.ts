import assert from 'node:assert/strict'
import { afterAll, beforeAll, describe, test } from 'vitest'

import { pairKey } from '../../services/login-throttle/progression.js'
import {
	call,
	login,
	seedUser,
	startAuthApp,
	type AuthApp,
	type CookieJar,
	type Reply,
} from '../../test-support/auth-app.js'

const PASSWORD = 'throttle-password-1'
const WRONG = 'wrong-password'

let ctx: AuthApp
const ids = new Map<string, string>()

type ThrottleRow = { bucket_key: string; failures: number; window_sec: number | null }

async function throttleRows(name: string): Promise<ThrottleRow[]> {
	const result = await ctx.pgPool.query<ThrottleRow>(
		`SELECT bucket_key, failures, extract(epoch FROM (blocked_until - now()))::float8 AS window_sec
		 FROM login_throttle WHERE login = $1 ORDER BY bucket_key`,
		[name]
	)
	return result.rows
}

async function pairRow(name: string, ip: string): Promise<ThrottleRow | undefined> {
	const result = await ctx.pgPool.query<ThrottleRow>(
		`SELECT bucket_key, failures, extract(epoch FROM (blocked_until - now()))::float8 AS window_sec
		 FROM login_throttle WHERE bucket_key = $1`,
		[pairKey(name, ip)]
	)
	return result.rows[0]
}

async function expireWindows(name: string): Promise<void> {
	await ctx.pgPool.query(
		"UPDATE login_throttle SET blocked_until = now() - interval '1 second' WHERE login = $1 AND blocked_until IS NOT NULL",
		[name]
	)
}

function retryAfter(reply: Reply): number {
	const raw = reply.headers.get('retry-after')
	assert.ok(raw, 'Retry-After header is missing')
	assert.match(raw, /^\d+$/)
	return Number(raw)
}

beforeAll(async () => {
	ctx = await startAuthApp('test_auth_throttle')
	for (const name of [
		'victim',
		'success_pair',
		'foreign_owner',
		'shared_owner',
		'spread_owner',
		'parallel_owner',
		'blocked_owner',
		'clear_target',
		'clear_plain',
	]) {
		ids.set(name, await seedUser(ctx, { login: name, roles: ['user'], password: PASSWORD }))
	}
	ids.set('clear_admin', await seedUser(ctx, { login: 'clear_admin', roles: ['admin'], password: PASSWORD }))
	const [nameless] = await ctx.db
		.insert(ctx.schema.users)
		.values({ login: null, isActive: true })
		.returning({ id: ctx.schema.users.id })
	assert.ok(nameless)
	ids.set('nameless', nameless.id)
}, 60_000)

afterAll(async () => {
	await ctx?.stop()
})

describe('пара (логин, IP)', () => {
	const ip = '203.0.113.1'

	test('шесть неудач без паузы, седьмая попытка 429 с Retry-After 30 и одинаковым телом для существующего и несуществующего логина', async () => {
		const blocked: Reply[] = []
		for (const name of ['ghost', 'victim']) {
			for (let attempt = 1; attempt <= 6; attempt += 1) {
				const reply = await login(ctx, name, WRONG, { ip })
				assert.equal(reply.status, 401, `${name} attempt ${attempt}`)
			}
			const seventh = await login(ctx, name, WRONG, { ip })
			assert.equal(seventh.status, 429, `${name} attempt 7`)
			const seconds = retryAfter(seventh)
			assert.ok(seconds >= 29 && seconds <= 31, `Retry-After ${seconds}`)
			blocked.push(seventh)
		}
		assert.deepEqual(blocked[0]?.body, blocked[1]?.body)
		assert.deepEqual(Object.keys(blocked[0]?.body ?? {}), ['error'])
	})

	test('после истечения окна следующая неудача 401 и окно 60 с, и снова 60 с: потолок пары равен LOGIN_CAP_MS', async () => {
		for (let round = 0; round < 2; round += 1) {
			await expireWindows('victim')
			const reply = await login(ctx, 'victim', WRONG, { ip })
			assert.equal(reply.status, 401, `round ${round + 1}`)
			const row = await pairRow('victim', ip)
			assert.ok(row?.window_sec !== null && row?.window_sec !== undefined)
			assert.ok(row.window_sec > 58 && row.window_sec <= 60, `window ${row.window_sec}`)
			const blocked = await login(ctx, 'victim', WRONG, { ip })
			assert.equal(blocked.status, 429)
			assert.ok(retryAfter(blocked) <= 60)
		}
	})

	test('верный пароль после трёх неудач даёт 200 и удаляет корзину пары', async () => {
		const ip2 = '203.0.113.2'
		for (let attempt = 0; attempt < 3; attempt += 1) {
			assert.equal((await login(ctx, 'success_pair', WRONG, { ip: ip2 })).status, 401)
		}
		assert.equal((await pairRow('success_pair', ip2))?.failures, 3)
		const reply = await login(ctx, 'success_pair', PASSWORD, { ip: ip2 })
		assert.equal(reply.status, 200)
		assert.equal(await pairRow('success_pair', ip2), undefined)
	})
})

describe('AUTH-06: владелец и атакующий', () => {
	test('AUTH-06-foreign-ip: пять неудач с чужого IP не мешают владельцу войти со своего', async () => {
		for (let attempt = 0; attempt < 5; attempt += 1) {
			assert.equal((await login(ctx, 'foreign_owner', WRONG, { ip: '203.0.113.10' })).status, 401)
		}
		const reply = await login(ctx, 'foreign_owner', PASSWORD, { ip: '198.51.100.20' })
		assert.equal(reply.status, 200)
	})

	test('общий IP: владелец ждёт не дольше 60 с после серии неудач атакующего с того же адреса', async () => {
		const sharedIp = '203.0.113.30'
		for (let attempt = 1; attempt <= 11; attempt += 1) {
			await expireWindows('shared_owner')
			const reply = await login(ctx, 'shared_owner', WRONG, { ip: sharedIp })
			assert.equal(reply.status, 401, `attempt ${attempt}`)
		}
		const owner = await login(ctx, 'shared_owner', PASSWORD, { ip: sharedIp })
		assert.equal(owner.status, 429)
		assert.ok(retryAfter(owner) <= 60, `Retry-After ${retryAfter(owner)}`)
		const rows = await throttleRows('shared_owner')
		assert.ok(rows.length > 0)
		for (const row of rows) {
			assert.ok(row.window_sec === null || row.window_sec <= 60, `${row.bucket_key} window ${row.window_sec}`)
		}
		await ctx.pgPool.query(
			"UPDATE login_throttle SET blocked_until = blocked_until - interval '60 seconds' WHERE login = $1 AND blocked_until IS NOT NULL",
			['shared_owner']
		)
		const later = await login(ctx, 'shared_owner', PASSWORD, { ip: sharedIp })
		assert.equal(later.status, 200)
	})

	test('вторичная корзина: 21 неудача с 21 адреса закрывает логин для нового адреса не дольше чем на 60 с', async () => {
		for (let attempt = 1; attempt <= 21; attempt += 1) {
			const reply = await login(ctx, 'spread_owner', WRONG, { ip: `192.0.2.${attempt}` })
			assert.equal(reply.status, 401, `attempt ${attempt}`)
		}
		const next = await login(ctx, 'spread_owner', PASSWORD, { ip: '192.0.2.200' })
		assert.equal(next.status, 429)
		const seconds = retryAfter(next)
		assert.ok(seconds > 0 && seconds <= 60, `Retry-After ${seconds}`)
	})
})

describe('атомарность и порядок проверки', () => {
	test('12 одновременных неудач на одну пару дают не больше 6 ответов 401, остальные 429', async () => {
		const ip = '203.0.113.40'
		const replies = await Promise.all(Array.from({ length: 12 }, () => login(ctx, 'parallel_owner', WRONG, { ip })))
		const statuses = replies.map((reply) => reply.status)
		const unauthorized = statuses.filter((status) => status === 401).length
		assert.ok(unauthorized <= 6, `statuses ${statuses.join(',')}`)
		assert.equal(unauthorized + statuses.filter((status) => status === 429).length, 12)
	})

	test('заблокированная пара получает 429 без запроса к users, незаблокированная попытка доходит до users', async () => {
		const ip = '203.0.113.50'
		for (let attempt = 0; attempt < 6; attempt += 1) {
			assert.equal((await login(ctx, 'blocked_owner', WRONG, { ip })).status, 401)
		}
		const before = await pairRow('blocked_owner', ip)
		assert.equal(before?.failures, 6)
		await ctx.pgPool.query('ALTER TABLE users RENAME TO users_off')
		try {
			const blocked = await login(ctx, 'blocked_owner', PASSWORD, { ip })
			assert.equal(blocked.status, 429)
			const open = await login(ctx, 'blocked_owner', PASSWORD, { ip: '203.0.113.51' })
			assert.equal(open.status, 500)
		} finally {
			await ctx.pgPool.query('ALTER TABLE users_off RENAME TO users')
		}
		assert.equal((await pairRow('blocked_owner', ip))?.failures, 6)
	})
})

describe('DELETE /api/users/:id/login-throttle', () => {
	const ip = '203.0.113.60'

	function userId(name: string): string {
		const id = ids.get(name)
		assert.ok(id, `no seeded user ${name}`)
		return id
	}

	async function signIn(name: string): Promise<CookieJar> {
		const reply = await login(ctx, name, PASSWORD, { ip: '198.51.100.60' })
		assert.equal(reply.status, 200)
		return reply.jar
	}

	test('администратор снимает ограничение: строки логина удалены, заблокированная пара входит сразу, повтор идемпотентен', async () => {
		for (let attempt = 0; attempt < 6; attempt += 1) {
			assert.equal((await login(ctx, 'clear_target', WRONG, { ip })).status, 401)
		}
		assert.equal((await login(ctx, 'clear_target', PASSWORD, { ip })).status, 429)
		const before = (await throttleRows('clear_target')).length
		assert.ok(before > 0)

		const admin = await signIn('clear_admin')
		const path = `/api/users/${userId('clear_target')}/login-throttle`
		const cleared = await call(ctx, 'DELETE', path, { cookies: admin })
		assert.equal(cleared.status, 200)
		assert.deepEqual(cleared.body, { ok: true, cleared: before })
		assert.deepEqual(await throttleRows('clear_target'), [])

		assert.equal((await login(ctx, 'clear_target', PASSWORD, { ip })).status, 200)

		await ctx.pgPool.query('DELETE FROM login_throttle WHERE login = $1', ['clear_target'])
		const again = await call(ctx, 'DELETE', path, { cookies: admin })
		assert.equal(again.status, 200)
		assert.deepEqual(again.body, { ok: true, cleared: 0 })
	})

	test('роль user получает 403, без сессии 401', async () => {
		const plain = await signIn('clear_plain')
		const path = `/api/users/${userId('clear_target')}/login-throttle`
		assert.equal((await call(ctx, 'DELETE', path, { cookies: plain })).status, 403)
		assert.equal((await call(ctx, 'DELETE', path)).status, 401)
	})

	test('пользователь без login даёт cleared 0, несуществующий uuid 404', async () => {
		const admin = await signIn('clear_admin')
		const nameless = await call(ctx, 'DELETE', `/api/users/${userId('nameless')}/login-throttle`, { cookies: admin })
		assert.equal(nameless.status, 200)
		assert.deepEqual(nameless.body, { ok: true, cleared: 0 })
		const missing = await call(ctx, 'DELETE', `/api/users/${crypto.randomUUID()}/login-throttle`, { cookies: admin })
		assert.equal(missing.status, 404)
	})
})

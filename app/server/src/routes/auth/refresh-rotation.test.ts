import jwt from 'jsonwebtoken'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { afterAll, beforeAll, describe, test, vi } from 'vitest'

import { AUTH_CONFIG } from '../../config/auth.js'
import {
	call,
	login,
	mergeCookies,
	seedUser,
	startAuthApp,
	type AuthApp,
	type CookieJar,
	type Reply,
} from '../../test-support/auth-app.js'

const PASSWORD = 'rotation-password-1'
const ACCESS = 'bio_exam_session'
const REFRESH = 'refresh_token'

let ctx: AuthApp
const ids = new Map<string, string>()

function userId(name: string): string {
	const id = ids.get(name)
	assert.ok(id, `no seeded user ${name}`)
	return id
}

function claimsOf(token: string | undefined): Record<string, unknown> {
	assert.ok(token, 'no access token')
	const decoded = jwt.decode(token)
	assert.ok(decoded && typeof decoded === 'object', 'access token is not a JWT object')
	return decoded as Record<string, unknown>
}

function sessionIdOf(jar: CookieJar): string {
	const sid = claimsOf(jar.get(ACCESS)).sid
	assert.equal(typeof sid, 'string')
	return sid as string
}

async function signIn(name: string): Promise<CookieJar> {
	const reply = await login(ctx, name, PASSWORD)
	assert.equal(reply.status, 200, `login of ${name}`)
	return reply.jar
}

async function sessionRow(sessionId: string) {
	const result = await ctx.pgPool.query<{ revoked_at: Date | null; revoke_reason: string | null }>(
		'SELECT revoked_at, revoke_reason FROM auth_sessions WHERE id = $1',
		[sessionId]
	)
	return result.rows[0] ?? null
}

async function tokenRow(raw: string) {
	const result = await ctx.pgPool.query<{
		used_at: Date | null
		revoked_at: Date | null
		session_id: string | null
	}>(
		"SELECT used_at, revoked_at, session_id FROM refresh_tokens WHERE token_hash = encode(sha256(convert_to($1, 'UTF8')), 'hex')",
		[raw]
	)
	return result.rows[0] ?? null
}

async function sessionTokens(sessionId: string) {
	const result = await ctx.pgPool.query<{ revoked_at: Date | null }>(
		'SELECT revoked_at FROM refresh_tokens WHERE session_id = $1',
		[sessionId]
	)
	return result.rows
}

function assertCleared(reply: Reply): void {
	for (const name of [ACCESS, REFRESH]) {
		const cookie = reply.setCookies.get(name)
		assert.ok(cookie, `${name} is not cleared`)
		assert.equal(cookie.value, '')
		assert.equal(cookie.attributes.get('max-age'), '0')
		assert.equal(cookie.attributes.get('path'), '/')
	}
}

function hashOf(raw: string): string {
	return crypto.createHash('sha256').update(raw).digest('hex')
}

function signLegacy(payload: Record<string, unknown>, expiresIn: number): string {
	return jwt.sign(payload, AUTH_CONFIG.jwtSecret, { expiresIn })
}

async function withTrigger(table: string, timing: string, fn: () => Promise<void>): Promise<void> {
	const name = `test_block_${table}_${timing.toLowerCase().replace(/\s+/g, '_')}`
	await ctx.pgPool.query(
		`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'blocked by ${name}'; END $$`
	)
	await ctx.pgPool.query(`CREATE TRIGGER ${name} ${timing} ON ${table} FOR EACH ROW EXECUTE FUNCTION ${name}()`)
	try {
		await fn()
	} finally {
		await ctx.pgPool.query(`DROP TRIGGER IF EXISTS ${name} ON ${table}`)
		await ctx.pgPool.query(`DROP FUNCTION IF EXISTS ${name}()`)
	}
}

beforeAll(async () => {
	ctx = await startAuthApp('test_auth_rotation')
	for (const name of [
		'rot_logout',
		'rot_expired_access',
		'rot_refresh_only',
		'rot_logout_db_error',
		'rot_capture',
		'rot_sequential',
		'rot_tx_failure',
		'rot_legacy',
		'rot_claims',
		'rot_revoked',
		'rot_inactive',
		'rot_window',
		'rot_replay_late',
		'rot_replay_successor',
		'rot_replay_revoked',
		'rot_parallel',
		'rot_replay_log',
		'rot_parallel_replay',
		'rot_parallel_regrant',
		'rot_replay_vs_rotation',
		'rot_replay_other_session',
	]) {
		ids.set(name, await seedUser(ctx, { login: name, roles: ['user'], password: PASSWORD }))
	}
}, 60_000)

afterAll(async () => {
	await ctx?.stop()
})

describe('выход отзывает сессию', () => {
	test('logout с действующими cookie: 200, cookie очищены, сессия и её токены отозваны, старые access и refresh 401', async () => {
		const jar = await signIn('rot_logout')
		const sid = sessionIdOf(jar)
		assert.equal((await call(ctx, 'GET', '/api/auth/me', { cookies: jar })).status, 200)
		const refreshed = await call(ctx, 'POST', '/api/auth/refresh', { cookies: jar })
		assert.equal(refreshed.status, 200)
		const current = mergeCookies(jar, refreshed.setCookies)

		const loggedOut = await call(ctx, 'POST', '/api/auth/logout', { cookies: current })
		assert.equal(loggedOut.status, 200)
		assertCleared(loggedOut)

		const session = await sessionRow(sid)
		assert.ok(session?.revoked_at, 'session is not revoked')
		assert.equal(session.revoke_reason, 'logout')
		const tokens = await sessionTokens(sid)
		assert.equal(tokens.length, 2)
		assert.ok(tokens.every((token) => token.revoked_at !== null))

		const me = await call(ctx, 'GET', '/api/auth/me', { cookies: `${ACCESS}=${current.get(ACCESS)}` })
		assert.equal(me.status, 401)
		const again = await call(ctx, 'POST', '/api/auth/refresh', { cookies: `${REFRESH}=${current.get(REFRESH)}` })
		assert.equal(again.status, 401)
		assert.equal(again.setCookies.size, 0)
	})

	test('logout с истёкшим access и живым refresh отзывает сессию', async () => {
		const jar = await signIn('rot_expired_access')
		const sid = sessionIdOf(jar)
		const expired = signLegacy({ sub: userId('rot_expired_access'), sid, login: 'rot_expired_access' }, -60)
		const loggedOut = await call(ctx, 'POST', '/api/auth/logout', {
			cookies: `${ACCESS}=${expired}; ${REFRESH}=${jar.get(REFRESH)}`,
		})
		assert.equal(loggedOut.status, 200)
		assertCleared(loggedOut)
		assert.equal((await sessionRow(sid))?.revoke_reason, 'logout')
		assert.equal((await call(ctx, 'GET', '/api/auth/me', { cookies: jar })).status, 401)
	})

	test('logout только с истёкшим access отзывает сессию по sid, только с refresh — по сессии токена', async () => {
		const byAccess = await signIn('rot_refresh_only')
		const accessSid = sessionIdOf(byAccess)
		const expired = signLegacy({ sub: userId('rot_refresh_only'), sid: accessSid, login: 'rot_refresh_only' }, -60)
		assert.equal((await call(ctx, 'POST', '/api/auth/logout', { cookies: `${ACCESS}=${expired}` })).status, 200)
		assert.ok((await sessionRow(accessSid))?.revoked_at, 'session from expired access is not revoked')

		const byRefresh = await signIn('rot_refresh_only')
		const refreshSid = sessionIdOf(byRefresh)
		const reply = await call(ctx, 'POST', '/api/auth/logout', { cookies: `${REFRESH}=${byRefresh.get(REFRESH)}` })
		assert.equal(reply.status, 200)
		assertCleared(reply)
		assert.equal((await sessionRow(refreshSid))?.revoke_reason, 'logout')
		assert.equal((await call(ctx, 'GET', '/api/auth/me', { cookies: byRefresh })).status, 401)
	})

	test('logout без cookie: 200 и очистка', async () => {
		const reply = await call(ctx, 'POST', '/api/auth/logout')
		assert.equal(reply.status, 200)
		assertCleared(reply)
	})

	test('ошибка БД при отзыве: 500 с очисткой обеих cookie, сессия не отозвана, повторный logout 200', async () => {
		const jar = await signIn('rot_logout_db_error')
		const sid = sessionIdOf(jar)
		await withTrigger('auth_sessions', 'BEFORE UPDATE', async () => {
			const failed = await call(ctx, 'POST', '/api/auth/logout', { cookies: jar })
			assert.equal(failed.status, 500)
			assertCleared(failed)
			assert.ok(!JSON.stringify(failed.body).includes(jar.get(REFRESH) ?? '\u0000'))
		})
		assert.equal((await sessionRow(sid))?.revoked_at, null)
		const tokens = await sessionTokens(sid)
		assert.ok(tokens.every((token) => token.revoked_at === null))
		const retried = await call(ctx, 'POST', '/api/auth/logout', { cookies: jar })
		assert.equal(retried.status, 200)
		assert.equal((await sessionRow(sid))?.revoke_reason, 'logout')
	})
})

describe('refresh: атомарный захват', () => {
	test('захват ставит used_at и не трогает revoked_at; преемник в той же сессии', async () => {
		const jar = await signIn('rot_capture')
		const sid = sessionIdOf(jar)
		const raw = jar.get(REFRESH)
		assert.ok(raw)
		const reply = await call(ctx, 'POST', '/api/auth/refresh', { cookies: jar })
		assert.equal(reply.status, 200)
		const captured = await tokenRow(raw)
		assert.ok(captured?.used_at, 'used_at is not set')
		assert.equal(captured.revoked_at, null)
		const successor = await tokenRow(reply.setCookies.get(REFRESH)?.value ?? '')
		assert.equal(successor?.session_id, sid)
		assert.equal(successor.used_at, null)
		assert.equal(sessionIdOf(mergeCookies(jar, reply.setCookies)), sid)
	})

	test('два refresh одним токеном последовательно: оба 200, второй без нового refresh; в сессии ровно два токена', async () => {
		const jar = await signIn('rot_sequential')
		const sid = sessionIdOf(jar)
		const cookies = `${REFRESH}=${jar.get(REFRESH)}`
		const first = await call(ctx, 'POST', '/api/auth/refresh', { cookies })
		const second = await call(ctx, 'POST', '/api/auth/refresh', { cookies })
		assert.deepEqual([first.status, second.status], [200, 200])
		assert.equal(second.setCookies.has(REFRESH), false)
		assert.equal((await sessionTokens(sid)).length, 2)
	})

	test('отказ транзакции: 500 без Set-Cookie, токен не израсходован; после снятия сбоя тот же токен обновляется', async () => {
		const jar = await signIn('rot_tx_failure')
		const raw = jar.get(REFRESH)
		assert.ok(raw)
		await withTrigger('refresh_tokens', 'BEFORE INSERT', async () => {
			const failed = await call(ctx, 'POST', '/api/auth/refresh', { cookies: `${REFRESH}=${raw}` })
			assert.equal(failed.status, 500)
			assert.equal(failed.setCookies.size, 0)
			assert.deepEqual(failed.headers.getSetCookie(), [])
			assert.ok(!JSON.stringify(failed.body).includes(raw))
		})
		assert.equal((await tokenRow(raw))?.used_at, null)
		const retried = await call(ctx, 'POST', '/api/auth/refresh', { cookies: `${REFRESH}=${raw}` })
		assert.equal(retried.status, 200)
		assert.ok(retried.setCookies.get(REFRESH)?.value)
	})

	test('действующий refresh-токен без session_id получает сессию с id токена', async () => {
		const id = userId('rot_legacy')
		const raw = 'legacy-refresh-token-without-session'
		const inserted = await ctx.pgPool.query<{ id: string }>(
			"INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, encode(sha256(convert_to($2, 'UTF8')), 'hex'), now() + interval '1 day') RETURNING id",
			[id, raw]
		)
		const tokenId = inserted.rows[0]?.id
		assert.ok(tokenId)
		const reply = await call(ctx, 'POST', '/api/auth/refresh', { cookies: `${REFRESH}=${raw}` })
		assert.equal(reply.status, 200)
		const session = await ctx.pgPool.query<{ user_id: string }>('SELECT user_id FROM auth_sessions WHERE id = $1', [
			tokenId,
		])
		assert.equal(session.rows[0]?.user_id, id)
		assert.equal((await tokenRow(raw))?.session_id, tokenId)
		const claims = claimsOf(reply.setCookies.get(ACCESS)?.value)
		assert.equal(claims.sid, tokenId)
		assert.equal(claims.login, 'rot_legacy')
		const me = await call(ctx, 'GET', '/api/auth/me', { cookies: mergeCookies(new Map(), reply.setCookies) })
		assert.equal(me.status, 200)
	})
})

describe('проверка access-токена', () => {
	test('access содержит sub, sid, login и не содержит roles; после refresh login сохраняется', async () => {
		const jar = await signIn('rot_claims')
		const claims = claimsOf(jar.get(ACCESS))
		assert.equal(claims.sub, userId('rot_claims'))
		assert.equal(typeof claims.sid, 'string')
		assert.equal(claims.login, 'rot_claims')
		assert.equal('roles' in claims, false)
		assert.equal(Number(claims.exp) - Number(claims.iat), AUTH_CONFIG.accessTokenTtlSec)
		const reply = await call(ctx, 'POST', '/api/auth/refresh', { cookies: jar })
		assert.equal(reply.status, 200)
		const after = claimsOf(reply.setCookies.get(ACCESS)?.value)
		assert.equal(after.login, 'rot_claims')
		assert.equal(after.sid, claims.sid)
		assert.equal('roles' in after, false)
		assert.equal(reply.setCookies.get(ACCESS)?.attributes.get('max-age'), String(AUTH_CONFIG.accessTokenTtlSec))
	})

	test('access без sid (старый формат) → 401', async () => {
		const legacy = signLegacy({ sub: userId('rot_claims'), login: 'rot_claims', roles: ['user'] }, 600)
		const reply = await call(ctx, 'GET', '/api/auth/me', { cookies: `${ACCESS}=${legacy}` })
		assert.equal(reply.status, 401)
	})

	test('access отозванной сессии → 401', async () => {
		const jar = await signIn('rot_revoked')
		assert.equal((await call(ctx, 'GET', '/api/auth/me', { cookies: jar })).status, 200)
		await ctx.pgPool.query("UPDATE auth_sessions SET revoked_at = now(), revoke_reason = 'test' WHERE id = $1", [
			sessionIdOf(jar),
		])
		assert.equal((await call(ctx, 'GET', '/api/auth/me', { cookies: jar })).status, 401)
	})

	test('access пользователя с is_active = false → 401, refresh отклоняется без расхода токена', async () => {
		const jar = await signIn('rot_inactive')
		assert.equal((await call(ctx, 'GET', '/api/auth/me', { cookies: jar })).status, 200)
		await ctx.pgPool.query('UPDATE users SET is_active = false WHERE id = $1', [userId('rot_inactive')])
		assert.equal((await call(ctx, 'GET', '/api/auth/me', { cookies: jar })).status, 401)
		const raw = jar.get(REFRESH)
		assert.ok(raw)
		const reply = await call(ctx, 'POST', '/api/auth/refresh', { cookies: jar })
		assert.equal(reply.status, 401)
		assert.equal(reply.setCookies.size, 0)
		assert.equal((await tokenRow(raw))?.used_at, null)
	})
})

async function countSessionTokens(sessionId: string): Promise<number> {
	return (await sessionTokens(sessionId)).length
}

async function shiftUsedAt(raw: string, seconds: number): Promise<void> {
	const result = await ctx.pgPool.query(
		"UPDATE refresh_tokens SET used_at = used_at - make_interval(secs => $2) WHERE token_hash = encode(sha256(convert_to($1, 'UTF8')), 'hex') AND used_at IS NOT NULL",
		[raw, seconds]
	)
	assert.equal(result.rowCount, 1)
}

async function ageSessionTokens(sessionId: string, seconds: number): Promise<void> {
	await ctx.pgPool.query(
		'UPDATE refresh_tokens SET created_at = created_at - make_interval(secs => $2), used_at = used_at - make_interval(secs => $2) WHERE session_id = $1',
		[sessionId, seconds]
	)
}

async function rotate(raw: string): Promise<Reply> {
	return call(ctx, 'POST', '/api/auth/refresh', { cookies: `${REFRESH}=${raw}` })
}

function refreshOf(reply: Reply): string {
	const value = reply.setCookies.get(REFRESH)?.value
	assert.ok(value, 'no refresh token in reply')
	return value
}

describe('refresh: окно гонки и replay', () => {
	test('повтор захваченного токена через 1 с: 200, только новый access той же сессии, новых токенов нет, сессия жива', async () => {
		const jar = await signIn('rot_window')
		const sid = sessionIdOf(jar)
		const t0 = jar.get(REFRESH)
		assert.ok(t0)
		const first = await rotate(t0)
		assert.equal(first.status, 200)
		refreshOf(first)
		await new Promise((resolve) => setTimeout(resolve, 1000))
		const repeated = await rotate(t0)
		assert.equal(repeated.status, 200)
		assert.deepEqual(Array.from(repeated.setCookies.keys()), [ACCESS])
		assert.equal(claimsOf(repeated.setCookies.get(ACCESS)?.value).sid, sid)
		assert.equal(await countSessionTokens(sid), 2)
		assert.equal((await sessionRow(sid))?.revoked_at, null)
		const me = await call(ctx, 'GET', '/api/auth/me', { cookies: mergeCookies(new Map(), repeated.setCookies) })
		assert.equal(me.status, 200)
	})

	test('ответ ротации потерян: повтор позже 30 с выдаёт новый refresh, потерянный преемник отозван; предъявленный отозванный преемник закрывает сессию с replay', async () => {
		const jar = await signIn('rot_replay_late')
		const sid = sessionIdOf(jar)
		const t0 = jar.get(REFRESH)
		assert.ok(t0)
		const first = await rotate(t0)
		assert.equal(first.status, 200)
		const lost = refreshOf(first)
		await ageSessionTokens(sid, 900)
		const regrant = await rotate(t0)
		assert.equal(regrant.status, 200)
		const t2 = refreshOf(regrant)
		assert.notEqual(t2, lost)
		assert.equal(claimsOf(regrant.setCookies.get(ACCESS)?.value).sid, sid)
		assert.equal((await sessionRow(sid))?.revoked_at, null)
		assert.ok((await tokenRow(lost))?.revoked_at, 'lost successor is not revoked')
		assert.equal(await countSessionTokens(sid), 3)
		const current = mergeCookies(jar, regrant.setCookies)
		assert.equal((await call(ctx, 'GET', '/api/auth/me', { cookies: current })).status, 200)
		const next = await rotate(t2)
		assert.equal(next.status, 200)
		refreshOf(next)
		const stolen = await rotate(lost)
		assert.equal(stolen.status, 401)
		const session = await sessionRow(sid)
		assert.ok(session?.revoked_at, 'session is not revoked')
		assert.equal(session.revoke_reason, 'replay')
		assert.equal(
			(await call(ctx, 'GET', '/api/auth/me', { cookies: mergeCookies(current, next.setCookies) })).status,
			401
		)
	})

	test('пять параллельных повторов после потерянного ответа: все 200, новый refresh ровно в одном ответе, сессия жива', async () => {
		const jar = await signIn('rot_parallel_regrant')
		const sid = sessionIdOf(jar)
		const t0 = jar.get(REFRESH)
		assert.ok(t0)
		const first = await rotate(t0)
		assert.equal(first.status, 200)
		const lost = refreshOf(first)
		await ageSessionTokens(sid, 900)
		const replies = await Promise.all(Array.from({ length: 5 }, () => rotate(t0)))
		assert.deepEqual(
			replies.map((reply) => reply.status),
			[200, 200, 200, 200, 200]
		)
		const issued = replies.filter((reply) => (reply.setCookies.get(REFRESH)?.value ?? '') !== '')
		assert.equal(issued.length, 1)
		assert.equal(await countSessionTokens(sid), 3)
		assert.ok((await tokenRow(lost))?.revoked_at, 'lost successor is not revoked')
		assert.equal((await sessionRow(sid))?.revoked_at, null)
		assert.equal((await rotate(refreshOf(issued[0] as Reply))).status, 200)
	})

	test('повтор токена, у которого преемник уже использован: 401 и отзыв сессии с replay', async () => {
		const jar = await signIn('rot_replay_successor')
		const sid = sessionIdOf(jar)
		const t0 = jar.get(REFRESH)
		assert.ok(t0)
		const first = await rotate(t0)
		assert.equal(first.status, 200)
		const second = await rotate(refreshOf(first))
		assert.equal(second.status, 200)
		refreshOf(second)
		await shiftUsedAt(t0, 5)
		const replay = await rotate(t0)
		assert.equal(replay.status, 401)
		const session = await sessionRow(sid)
		assert.ok(session?.revoked_at, 'session is not revoked')
		assert.equal(session.revoke_reason, 'replay')
		assert.ok((await sessionTokens(sid)).every((token) => token.revoked_at !== null))
	})

	test('повтор токена из отозванной сессии: 401 без новых строк и без смены причины отзыва', async () => {
		const jar = await signIn('rot_replay_revoked')
		const sid = sessionIdOf(jar)
		const t0 = jar.get(REFRESH)
		assert.ok(t0)
		const first = await rotate(t0)
		assert.equal(first.status, 200)
		const current = mergeCookies(jar, first.setCookies)
		assert.equal((await call(ctx, 'POST', '/api/auth/logout', { cookies: current })).status, 200)
		const replay = await rotate(t0)
		assert.equal(replay.status, 401)
		assert.equal(replay.setCookies.size, 0)
		assert.equal(await countSessionTokens(sid), 2)
		assert.equal((await sessionRow(sid))?.revoke_reason, 'logout')
	})

	test('пять параллельных refresh одним токеном: все 200, ровно один преемник и ровно один ответ с refresh_token', async () => {
		const jar = await signIn('rot_parallel')
		const sid = sessionIdOf(jar)
		const t0 = jar.get(REFRESH)
		assert.ok(t0)
		const replies = await Promise.all(Array.from({ length: 5 }, () => rotate(t0)))
		assert.deepEqual(
			replies.map((reply) => reply.status),
			[200, 200, 200, 200, 200]
		)
		assert.equal(await countSessionTokens(sid), 2)
		const issued = replies.filter((reply) => (reply.setCookies.get(REFRESH)?.value ?? '') !== '')
		assert.equal(issued.length, 1)
		for (const reply of replies) assert.equal(claimsOf(reply.setCookies.get(ACCESS)?.value).sid, sid)
		assert.equal((await sessionRow(sid))?.revoked_at, null)
	})

	test('событие replay пишется через req.log.warn с userId и sessionId, без токена и хэша', async () => {
		const { logger } = await import('../../lib/logger.js')
		const jar = await signIn('rot_replay_log')
		const sid = sessionIdOf(jar)
		const t0 = jar.get(REFRESH)
		assert.ok(t0)
		const first = await rotate(t0)
		assert.equal(first.status, 200)
		const t1 = refreshOf(first)
		const second = await rotate(t1)
		assert.equal(second.status, 200)
		const t2 = refreshOf(second)
		await shiftUsedAt(t0, 31)
		const warn = vi.spyOn(logger, 'warn')
		try {
			const replay = await rotate(t0)
			assert.equal(replay.status, 401)
			const events = warn.mock.calls.filter(
				([payload]) => typeof payload === 'object' && payload !== null && 'event' in payload
			)
			assert.equal(events.length, 1)
			const [payload] = events[0] ?? []
			assert.deepEqual(payload, { userId: userId('rot_replay_log'), sessionId: sid, event: 'refresh_replay' })
			const logged = JSON.stringify(warn.mock.calls)
			for (const secret of [t0, t1, t2, hashOf(t0), hashOf(t1), hashOf(t2)])
				assert.equal(logged.includes(secret), false)
		} finally {
			warn.mockRestore()
		}
	})

	test('пять параллельных replay токена с использованным преемником: все 401, сессия отозвана один раз с replay, без 500', async () => {
		const jar = await signIn('rot_parallel_replay')
		const sid = sessionIdOf(jar)
		const t0 = jar.get(REFRESH)
		assert.ok(t0)
		const first = await rotate(t0)
		assert.equal(first.status, 200)
		const second = await rotate(refreshOf(first))
		assert.equal(second.status, 200)
		const t2 = refreshOf(second)
		await shiftUsedAt(t0, 31)
		const replies = await Promise.all(Array.from({ length: 5 }, () => rotate(t0)))
		assert.deepEqual(
			replies.map((reply) => reply.status),
			[401, 401, 401, 401, 401]
		)
		const session = await sessionRow(sid)
		assert.ok(session?.revoked_at, 'session is not revoked')
		assert.equal(session.revoke_reason, 'replay')
		assert.ok((await sessionTokens(sid)).every((token) => token.revoked_at !== null))
		assert.equal((await rotate(t2)).status, 401)
	})

	test('replay старого токена параллельно с ротацией преемника: без 500 и deadlock, сессия отозвана с replay', async () => {
		const jar = await signIn('rot_replay_vs_rotation')
		const sid = sessionIdOf(jar)
		const t0 = jar.get(REFRESH)
		assert.ok(t0)
		const first = await rotate(t0)
		assert.equal(first.status, 200)
		const t1 = refreshOf(first)
		await shiftUsedAt(t0, 31)
		const name = 'test_slow_refresh_insert'
		await ctx.pgPool.query(
			`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(0.6); RETURN NEW; END $$`
		)
		await ctx.pgPool.query(
			`CREATE TRIGGER ${name} AFTER INSERT ON refresh_tokens FOR EACH ROW EXECUTE FUNCTION ${name}()`
		)
		let rotation: Reply
		let replay: Reply
		try {
			const rotating = rotate(t1)
			await new Promise((resolve) => setTimeout(resolve, 200))
			replay = await rotate(t0)
			rotation = await rotating
		} finally {
			await ctx.pgPool.query(`DROP TRIGGER IF EXISTS ${name} ON refresh_tokens`)
			await ctx.pgPool.query(`DROP FUNCTION IF EXISTS ${name}()`)
		}
		assert.equal(replay.status, 401)
		assert.notEqual(rotation.status, 500)
		const session = await sessionRow(sid)
		assert.ok(session?.revoked_at, 'session is not revoked')
		assert.equal(session.revoke_reason, 'replay')
		if (rotation.status === 200) {
			assert.equal((await rotate(refreshOf(rotation))).status, 401)
			const access = mergeCookies(jar, rotation.setCookies)
			assert.equal((await call(ctx, 'GET', '/api/auth/me', { cookies: access })).status, 401)
		}
	}, 20_000)

	test('replay в сессии A не трогает сессию B того же пользователя', async () => {
		const jarA = await signIn('rot_replay_other_session')
		const jarB = await signIn('rot_replay_other_session')
		const sidA = sessionIdOf(jarA)
		const sidB = sessionIdOf(jarB)
		assert.notEqual(sidA, sidB)
		const a0 = jarA.get(REFRESH)
		assert.ok(a0)
		const first = await rotate(a0)
		assert.equal(first.status, 200)
		assert.equal((await rotate(refreshOf(first))).status, 200)
		await shiftUsedAt(a0, 31)
		assert.equal((await rotate(a0)).status, 401)
		assert.equal((await sessionRow(sidA))?.revoke_reason, 'replay')
		assert.equal((await sessionRow(sidB))?.revoked_at, null)
		assert.ok((await sessionTokens(sidB)).every((token) => token.revoked_at === null))
		assert.equal((await call(ctx, 'GET', '/api/auth/me', { cookies: jarB })).status, 200)
		const b0 = jarB.get(REFRESH)
		assert.ok(b0)
		const rotatedB = await rotate(b0)
		assert.equal(rotatedB.status, 200)
		assert.equal(claimsOf(rotatedB.setCookies.get(ACCESS)?.value).sid, sidB)
	})
})

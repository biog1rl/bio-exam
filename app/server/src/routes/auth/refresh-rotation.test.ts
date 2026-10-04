import jwt from 'jsonwebtoken'
import assert from 'node:assert/strict'
import { afterAll, beforeAll, describe, test } from 'vitest'

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

	test('два refresh одним токеном последовательно: 200, затем 401; в сессии ровно два токена', async () => {
		const jar = await signIn('rot_sequential')
		const sid = sessionIdOf(jar)
		const cookies = `${REFRESH}=${jar.get(REFRESH)}`
		const first = await call(ctx, 'POST', '/api/auth/refresh', { cookies })
		const second = await call(ctx, 'POST', '/api/auth/refresh', { cookies })
		assert.deepEqual([first.status, second.status], [200, 401])
		assert.equal(second.setCookies.size, 0)
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

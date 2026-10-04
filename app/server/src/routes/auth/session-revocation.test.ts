import jwt from 'jsonwebtoken'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { afterAll, beforeAll, describe, test } from 'vitest'

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

const PASSWORD = 'revocation-password-1'
const NEW_PASSWORD = 'revocation-password-2'
const ACCESS = 'bio_exam_session'
const REFRESH = 'refresh_token'
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/

let ctx: AuthApp
let adminJar: CookieJar
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

async function signIn(name: string, password = PASSWORD): Promise<CookieJar> {
	const reply = await login(ctx, name, password)
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

async function insertLegacyToken(name: string): Promise<string> {
	const raw = crypto.randomBytes(32).toString('hex')
	await ctx.pgPool.query(
		"INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, encode(sha256(convert_to($2, 'UTF8')), 'hex'), now() + interval '1 day')",
		[userId(name), raw]
	)
	return raw
}

async function legacyTokenRevoked(raw: string): Promise<boolean> {
	const result = await ctx.pgPool.query<{ revoked_at: Date | null; session_id: string | null }>(
		"SELECT revoked_at, session_id FROM refresh_tokens WHERE token_hash = encode(sha256(convert_to($1, 'UTF8')), 'hex')",
		[raw]
	)
	const row = result.rows[0]
	assert.ok(row, 'legacy token is missing')
	return row.revoked_at !== null
}

async function sessionTokens(sessionId: string) {
	const result = await ctx.pgPool.query<{ revoked_at: Date | null; used_at: Date | null }>(
		'SELECT revoked_at, used_at FROM refresh_tokens WHERE session_id = $1',
		[sessionId]
	)
	return result.rows
}

function assertAccessExpiresAt(reply: Reply, accessToken: string | undefined): void {
	const value = reply.body.accessExpiresAt
	assert.equal(typeof value, 'string', 'accessExpiresAt is not a string')
	assert.match(value as string, ISO_UTC)
	const exp = Number(claimsOf(accessToken).exp)
	assert.ok(Math.abs(Date.parse(value as string) - exp * 1000) <= 1000, `accessExpiresAt ${value} vs exp ${exp}`)
}

beforeAll(async () => {
	ctx = await startAuthApp('test_auth_revocation')
	const seeds: Array<[string, string[]]> = [
		['rev_admin', ['admin']],
		['rev_plain', ['user']],
		['rev_password', ['user']],
		['rev_deactivated', ['user']],
		['rev_roles', ['user']],
		['rev_target', ['user']],
		['rev_expiry', ['user']],
		['rev_legacy_admin', ['user']],
		['rev_legacy_password', ['user']],
		['rev_invite_accept', ['user']],
		['rev_invite_active', ['user']],
	]
	for (const [name, roles] of seeds) {
		ids.set(name, await seedUser(ctx, { login: name, roles, password: PASSWORD }))
	}
	adminJar = await signIn('rev_admin')
}, 60_000)

afterAll(async () => {
	await ctx?.stop()
})

describe('смена пароля', () => {
	test('отзывает остальные сессии пользователя с password_change, текущая продолжает работать', async () => {
		const first = await signIn('rev_password')
		const second = await signIn('rev_password')
		const firstSid = sessionIdOf(first)
		const secondSid = sessionIdOf(second)

		const changed = await call(ctx, 'POST', '/api/users/profile/password', {
			cookies: first,
			body: { oldPassword: PASSWORD, newPassword: NEW_PASSWORD },
		})
		assert.equal(changed.status, 200)

		assert.equal((await call(ctx, 'GET', '/api/auth/me', { cookies: first })).status, 200)
		assert.equal((await call(ctx, 'GET', '/api/auth/me', { cookies: second })).status, 401)
		assert.equal(
			(await call(ctx, 'POST', '/api/auth/refresh', { cookies: `${REFRESH}=${second.get(REFRESH)}` })).status,
			401
		)

		const revoked = await sessionRow(secondSid)
		assert.ok(revoked?.revoked_at, 'second session is not revoked')
		assert.equal(revoked.revoke_reason, 'password_change')
		assert.ok((await sessionTokens(secondSid)).every((token) => token.revoked_at !== null))

		assert.equal((await sessionRow(firstSid))?.revoked_at, null)
		assert.ok((await sessionTokens(firstSid)).every((token) => token.revoked_at === null))
		const refreshed = await call(ctx, 'POST', '/api/auth/refresh', { cookies: `${REFRESH}=${first.get(REFRESH)}` })
		assert.equal(refreshed.status, 200)
	})
})

describe('PATCH /api/users/:id', () => {
	test('isActive=false отзывает все сессии пользователя с deactivated, следующий запрос 401', async () => {
		const first = await signIn('rev_deactivated')
		const second = await signIn('rev_deactivated')
		const reply = await call(ctx, 'PATCH', `/api/users/${userId('rev_deactivated')}`, {
			cookies: adminJar,
			body: { isActive: false },
		})
		assert.equal(reply.status, 200)
		for (const jar of [first, second]) {
			const session = await sessionRow(sessionIdOf(jar))
			assert.ok(session?.revoked_at, 'session is not revoked')
			assert.equal(session.revoke_reason, 'deactivated')
			assert.ok((await sessionTokens(sessionIdOf(jar))).every((token) => token.revoked_at !== null))
			assert.equal((await call(ctx, 'GET', '/api/auth/me', { cookies: jar })).status, 401)
		}
		assert.equal((await sessionRow(sessionIdOf(adminJar)))?.revoked_at, null)
	})

	test('смена ролей без isActive сессии не отзывает', async () => {
		const jar = await signIn('rev_roles')
		const reply = await call(ctx, 'PATCH', `/api/users/${userId('rev_roles')}`, {
			cookies: adminJar,
			body: { roles: ['user'], firstName: 'Роли' },
		})
		assert.equal(reply.status, 200)
		assert.equal((await sessionRow(sessionIdOf(jar)))?.revoked_at, null)
		assert.equal((await call(ctx, 'GET', '/api/auth/me', { cookies: jar })).status, 200)
	})
})

describe('POST /api/users/:id/sessions/revoke', () => {
	test('администратор отзывает все сессии пользователя с admin; повтор даёт revoked 0', async () => {
		const first = await signIn('rev_target')
		const second = await signIn('rev_target')
		const path = `/api/users/${userId('rev_target')}/sessions/revoke`

		const reply = await call(ctx, 'POST', path, { cookies: adminJar })
		assert.equal(reply.status, 200)
		assert.deepEqual(reply.body, { ok: true, revoked: 2 })
		for (const jar of [first, second]) {
			const session = await sessionRow(sessionIdOf(jar))
			assert.ok(session?.revoked_at, 'session is not revoked')
			assert.equal(session.revoke_reason, 'admin')
			assert.ok((await sessionTokens(sessionIdOf(jar))).every((token) => token.revoked_at !== null))
			assert.equal((await call(ctx, 'GET', '/api/auth/me', { cookies: jar })).status, 401)
		}

		const again = await call(ctx, 'POST', path, { cookies: adminJar })
		assert.equal(again.status, 200)
		assert.deepEqual(again.body, { ok: true, revoked: 0 })
		assert.equal((await call(ctx, 'GET', '/api/auth/me', { cookies: adminJar })).status, 200)
	})

	test('роль user получает 403, сессии цели не тронуты', async () => {
		const target = await signIn('rev_expiry')
		const plain = await signIn('rev_plain')
		const reply = await call(ctx, 'POST', `/api/users/${userId('rev_expiry')}/sessions/revoke`, { cookies: plain })
		assert.equal(reply.status, 403)
		assert.equal((await sessionRow(sessionIdOf(target)))?.revoked_at, null)
	})

	test('без сессии 401, несуществующий пользователь 404, невалидный id 400', async () => {
		const anonymous = await call(ctx, 'POST', `/api/users/${userId('rev_plain')}/sessions/revoke`)
		assert.equal(anonymous.status, 401)
		const missing = await call(ctx, 'POST', `/api/users/${crypto.randomUUID()}/sessions/revoke`, { cookies: adminJar })
		assert.equal(missing.status, 404)
		const invalid = await call(ctx, 'POST', '/api/users/not-a-uuid/sessions/revoke', { cookies: adminJar })
		assert.equal(invalid.status, 400)
	})
})

describe('accessExpiresAt', () => {
	test('login, refresh, повтор refresh в окне и /api/auth/me отдают момент exp текущего access', async () => {
		const loggedIn = await login(ctx, 'rev_expiry', PASSWORD)
		assert.equal(loggedIn.status, 200)
		assert.equal(loggedIn.body.ok, true)
		assertAccessExpiresAt(loggedIn, loggedIn.jar.get(ACCESS))

		const me = await call(ctx, 'GET', '/api/auth/me', { cookies: loggedIn.jar })
		assert.equal(me.status, 200)
		assert.equal(typeof me.body.user, 'object')
		assertAccessExpiresAt(me, loggedIn.jar.get(ACCESS))

		const t0 = loggedIn.jar.get(REFRESH)
		const rotated = await call(ctx, 'POST', '/api/auth/refresh', { cookies: `${REFRESH}=${t0}` })
		assert.equal(rotated.status, 200)
		assert.equal(rotated.body.ok, true)
		assertAccessExpiresAt(rotated, rotated.setCookies.get(ACCESS)?.value)

		const reused = await call(ctx, 'POST', '/api/auth/refresh', { cookies: `${REFRESH}=${t0}` })
		assert.equal(reused.status, 200)
		assert.equal(reused.setCookies.has(REFRESH), false)
		assertAccessExpiresAt(reused, reused.setCookies.get(ACCESS)?.value)

		const current = mergeCookies(loggedIn.jar, rotated.setCookies)
		const meAfter = await call(ctx, 'GET', '/api/auth/me', { cookies: current })
		assertAccessExpiresAt(meAfter, current.get(ACCESS))
	})
})

describe('refresh-токен без сессии', () => {
	test('«завершить все сеансы» отзывает токен без session_id: refresh 401', async () => {
		const legacy = await insertLegacyToken('rev_legacy_admin')
		const reply = await call(ctx, 'POST', `/api/users/${userId('rev_legacy_admin')}/sessions/revoke`, {
			cookies: adminJar,
		})
		assert.equal(reply.status, 200)
		assert.equal(await legacyTokenRevoked(legacy), true)
		assert.equal((await call(ctx, 'POST', '/api/auth/refresh', { cookies: `${REFRESH}=${legacy}` })).status, 401)
	})

	test('смена пароля отзывает токен без session_id, текущая сессия работает', async () => {
		const legacy = await insertLegacyToken('rev_legacy_password')
		const jar = await signIn('rev_legacy_password')
		const changed = await call(ctx, 'POST', '/api/users/profile/password', {
			cookies: jar,
			body: { oldPassword: PASSWORD, newPassword: NEW_PASSWORD },
		})
		assert.equal(changed.status, 200)
		assert.equal(await legacyTokenRevoked(legacy), true)
		assert.equal((await call(ctx, 'POST', '/api/auth/refresh', { cookies: `${REFRESH}=${legacy}` })).status, 401)
		assert.equal((await call(ctx, 'GET', '/api/auth/me', { cookies: jar })).status, 200)
	})
})

describe('приглашения', () => {
	function tokenOf(reply: Reply): string {
		const link = reply.body.inviteLink
		assert.equal(typeof link, 'string')
		const token = (link as string).split('/invite/')[1]
		assert.ok(token, `no token in ${link}`)
		return token
	}

	test('POST /api/auth/invites для активного пользователя: 409, приглашение не создаётся', async () => {
		const id = userId('rev_invite_active')
		const reply = await call(ctx, 'POST', '/api/auth/invites', { cookies: adminJar, body: { userId: id } })
		assert.equal(reply.status, 409)
		assert.equal(typeof reply.body.error, 'string')
		assert.ok((reply.body.error as string).length > 0)
		const invites = await ctx.pgPool.query('SELECT id FROM invites WHERE user_id = $1', [id])
		assert.equal(invites.rowCount, 0)
	})

	test('accept приглашения отзывает прежние сессии пользователя с password_change', async () => {
		const id = userId('rev_invite_accept')
		const deactivated = await call(ctx, 'PATCH', `/api/users/${id}`, { cookies: adminJar, body: { isActive: false } })
		assert.equal(deactivated.status, 200)
		const issued = await call(ctx, 'POST', '/api/auth/invites', { cookies: adminJar, body: { userId: id } })
		assert.equal(issued.status, 200)
		const token = tokenOf(issued)
		const reactivated = await call(ctx, 'PATCH', `/api/users/${id}`, { cookies: adminJar, body: { isActive: true } })
		assert.equal(reactivated.status, 200)

		const jar = await signIn('rev_invite_accept')
		const sid = sessionIdOf(jar)
		const accepted = await call(ctx, 'POST', '/api/auth/invites/accept', {
			body: { token, login: 'rev_invite_accept', password: NEW_PASSWORD },
		})
		assert.equal(accepted.status, 200)

		const session = await sessionRow(sid)
		assert.ok(session?.revoked_at, 'session is not revoked')
		assert.equal(session.revoke_reason, 'password_change')
		assert.ok((await sessionTokens(sid)).every((row) => row.revoked_at !== null))
		assert.equal((await call(ctx, 'GET', '/api/auth/me', { cookies: jar })).status, 401)
		assert.equal(
			(await call(ctx, 'POST', '/api/auth/refresh', { cookies: `${REFRESH}=${jar.get(REFRESH)}` })).status,
			401
		)
		assert.equal((await login(ctx, 'rev_invite_accept', NEW_PASSWORD)).status, 200)
	}, 20_000)
})

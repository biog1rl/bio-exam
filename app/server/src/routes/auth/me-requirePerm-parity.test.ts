import { PERMISSION_DOMAINS, type PermissionKey } from '@bio-exam/rbac'

import assert from 'node:assert/strict'
import { afterAll, beforeAll, describe, test } from 'vitest'

import {
	call,
	cookieHeader,
	login,
	seedUser,
	startAuthApp,
	type AuthApp,
	type CookieJar,
} from '../../test-support/auth-app.js'
import { startTestServer } from '../../test-support/http.js'

const PASSWORD = 'parity-password-1'

const ALL_KEYS = Object.entries(PERMISSION_DOMAINS).flatMap(([domain, info]) =>
	info.actions.map((action) => `${domain}.${action}` as PermissionKey)
)

let ctx: AuthApp
let probe: { baseUrl: string; close: () => Promise<void> } | null = null
const ids = new Map<string, string>()

function userId(name: string): string {
	const id = ids.get(name)
	assert.ok(id, `no seeded user ${name}`)
	return id
}

beforeAll(async () => {
	ctx = await startAuthApp('test_auth_parity')
	const seeds: Array<[string, string[]]> = [
		['parity_admin', ['admin']],
		['parity_teacher', ['teacher']],
		['parity_role_deny_admin', ['admin']],
		['parity_user', ['user']],
		['parity_allow_user', ['user']],
		['parity_deny_user', ['admin']],
	]
	for (const [name, roles] of seeds) {
		ids.set(name, await seedUser(ctx, { login: name, roles, password: PASSWORD }))
	}
	await ctx.pgPool.query(
		"INSERT INTO rbac_user_grants (user_id, domain, action, allow) VALUES ($1, 'tests', 'read', true)",
		[userId('parity_allow_user')]
	)
	await ctx.pgPool.query(
		"INSERT INTO rbac_user_grants (user_id, domain, action, allow) VALUES ($1, 'users', 'read', false)",
		[userId('parity_deny_user')]
	)

	const { default: express } = await import('express')
	const { sessionOptional } = await import('../../middleware/auth/session.js')
	const { requirePermKey } = await import('../../middleware/auth/requirePerm.js')
	const probeApp = express()
	probeApp.use(express.json())
	probeApp.use(sessionOptional())
	probeApp.get(
		'/probe/:key',
		(req, res, next) => requirePermKey(req.params.key as PermissionKey)(req, res, next),
		(_req, res) => {
			res.json({ ok: true })
		}
	)
	probe = await startTestServer(probeApp)
}, 60_000)

afterAll(async () => {
	await probe?.close()
	await ctx?.stop()
})

async function signIn(name: string): Promise<CookieJar> {
	const reply = await login(ctx, name, PASSWORD)
	assert.equal(reply.status, 200, `login ${name}`)
	return reply.jar
}

async function probeStatus(jar: CookieJar, key: PermissionKey): Promise<number> {
	assert.ok(probe, 'probe server is not started')
	const response = await fetch(`${probe.baseUrl}/probe/${encodeURIComponent(key)}`, {
		headers: { cookie: cookieHeader(jar) },
	})
	await response.text()
	return response.status
}

async function assertParity(name: string): Promise<Set<string>> {
	const jar = await signIn(name)
	const me = await call(ctx, 'GET', '/api/auth/me', { cookies: jar })
	assert.equal(me.status, 200, `/api/auth/me for ${name}`)
	const user = me.body.user as { perms: string[] }
	const perms = new Set(user.perms)
	const mismatches: string[] = []
	for (const key of ALL_KEYS) {
		const status = await probeStatus(jar, key)
		const expected = perms.has(key) ? 200 : 403
		if (status !== expected) mismatches.push(`${key}: perms ${perms.has(key)}, requirePermKey ${status}`)
	}
	assert.deepEqual(mismatches, [], `${name}: /api/auth/me and requirePermKey disagree`)
	return perms
}

describe('parity /api/auth/me ↔ requirePermKey', () => {
	test('admin: все ключи PERMISSION_DOMAINS совпадают, у admin есть каждый ключ', async () => {
		const perms = await assertParity('parity_admin')
		assert.deepEqual([...perms].sort(), [...ALL_KEYS].sort())
		assert.ok(ALL_KEYS.includes('zone.all'))
		assert.ok(perms.has('zone.all'))
	})

	test('teacher: все ключи совпадают, права ровно D-02 без zone.all', async () => {
		const perms = await assertParity('parity_teacher')
		assert.deepEqual([...perms].sort(), [
			'groups.manage_groups',
			'tests.manage_assignments',
			'tests.read',
			'tests.write',
			'users.invite',
			'users.read',
		])
		assert.ok(!perms.has('zone.all'))
	})

	test('user: все ключи совпадают', async () => {
		const perms = await assertParity('parity_user')
		assert.ok(!perms.has('users.read'))
		assert.ok(!perms.has('tests.read'))
	})

	test('user + allow tests.read в rbac_user_grants: все ключи совпадают, tests.read есть', async () => {
		const perms = await assertParity('parity_allow_user')
		assert.ok(perms.has('tests.read'))
	})

	test('admin + deny users.read в rbac_user_grants: все ключи совпадают, users.read нет', async () => {
		const perms = await assertParity('parity_deny_user')
		assert.ok(!perms.has('users.read'))
		assert.ok(perms.has('users.edit'))
	})

	test('admin + deny settings.manage в rbac_role_grants: все ключи совпадают, settings.manage нет', async () => {
		await ctx.pgPool.query(
			"INSERT INTO rbac_role_grants (role_key, domain, action, allow) VALUES ('admin', 'settings', 'manage', false)"
		)
		try {
			const perms = await assertParity('parity_role_deny_admin')
			assert.ok(!perms.has('settings.manage'))
			assert.ok(perms.has('rbac.read'))
		} finally {
			await ctx.pgPool.query(
				"DELETE FROM rbac_role_grants WHERE role_key = 'admin' AND domain = 'settings' AND action = 'manage'"
			)
		}
	})
})

describe('GET /api/rbac/user/:id/grants через модуль прав', () => {
	type GrantsReply = {
		roles: string[]
		roleKeys: string[]
		userOverrides: Array<{ domain: string; action: string; allow: boolean }>
		effective: string[]
	}

	async function grantsOf(adminJar: CookieJar, name: string): Promise<GrantsReply> {
		const reply = await call(ctx, 'GET', `/api/rbac/user/${userId(name)}/grants`, { cookies: adminJar })
		assert.equal(reply.status, 200, `grants for ${name}`)
		assert.deepEqual(Object.keys(reply.body).sort(), ['effective', 'roleKeys', 'roles', 'userOverrides'])
		return reply.body as unknown as GrantsReply
	}

	test('admin: роли, права роли и эффективные права без переопределений', async () => {
		const adminJar = await signIn('parity_admin')
		const grants = await grantsOf(adminJar, 'parity_admin')
		assert.deepEqual(grants.roles, ['admin'])
		assert.deepEqual([...grants.roleKeys].sort(), [...ALL_KEYS].sort())
		assert.deepEqual(grants.userOverrides, [])
		assert.deepEqual([...grants.effective].sort(), [...ALL_KEYS].sort())
	})

	test('user + allow tests.read: переопределение видно отдельно, эффективные права совпадают с /api/auth/me', async () => {
		const adminJar = await signIn('parity_admin')
		const grants = await grantsOf(adminJar, 'parity_allow_user')
		assert.deepEqual(grants.roles, ['user'])
		assert.deepEqual(grants.roleKeys, [])
		assert.deepEqual(grants.userOverrides, [{ domain: 'tests', action: 'read', allow: true }])
		const me = await call(ctx, 'GET', '/api/auth/me', { cookies: await signIn('parity_allow_user') })
		const perms = (me.body.user as { perms: string[] }).perms
		assert.deepEqual([...grants.effective].sort(), [...perms].sort())
		assert.ok(grants.effective.includes('tests.read'))
	})
})

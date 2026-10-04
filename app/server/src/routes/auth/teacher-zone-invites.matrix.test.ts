import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { afterAll, beforeAll, describe, test } from 'vitest'

import { call, startAuthApp, type AuthApp, type Reply } from '../../test-support/auth-app.js'
import {
	seedTeacherZoneWorld,
	type TeacherZoneWorld,
	type ZoneProfile,
	type ZoneUser,
} from '../../test-support/teacher-zone-world.js'

const KNOWN_DEFECTS = new Set<string>([
	'admin GET /api/rbac/roles',
	'admin POST /invites roleKey nope',
	'admin POST /invites roleKey user group of teacherB',
	'admin POST /invites without roleKey',
	'adminNoZone DELETE /api/users/:own/login-throttle',
	'adminNoZone POST /api/users/:own/sessions/revoke',
	'teacherA DELETE /api/users/:own/login-throttle',
	'teacherA POST /api/users/:own/sessions/revoke',
	'teacherA POST /invites group of teacherB',
	'teacherA POST /invites own group',
	'teacherA POST /invites roleKey admin',
	'teacherA POST /invites roleKey teacher',
	'teacherA POST /invites userId allow tests.write',
	'teacherA POST /invites userId deactivated',
	'teacherA POST /invites userId teacherOff',
	'teacherA POST /invites without groupId',
])

function check(id: string, title: string, fn: () => Promise<void>): void {
	const run = KNOWN_DEFECTS.has(id) ? test.fails : test
	run(`${id}: ${title}`, fn)
}

type Row = { profile: ZoneProfile; route: string; title: string; run: (profile: ZoneProfile) => Promise<void> }

type Target = 'own' | 'ungrouped' | 'teacher'

let ctx: AuthApp
let w: TeacherZoneWorld

function send(profile: ZoneProfile, method: string, path: string, body?: unknown): Promise<Reply> {
	return call(ctx, method, path, { cookies: w.users[profile].cookie, body })
}

function expectStatus(reply: { status: number; body?: unknown }, status: number): void {
	assert.equal(reply.status, status, `ожидался ${status}, пришёл ${reply.status}: ${JSON.stringify(reply.body)}`)
}

function uniqueLogin(): string {
	return `${w.prefix}_inv_${crypto.randomUUID().slice(0, 8)}`
}

function inviteBody(login: string, extra: Record<string, unknown>): Record<string, unknown> {
	return { login, firstName: `Имя ${login}`, lastName: `Фамилия ${login}`, ...extra }
}

async function userIdByLogin(login: string): Promise<string | null> {
	const result = await ctx.pgPool.query<{ id: string }>('SELECT id FROM users WHERE login = $1', [login])
	return result.rows[0]?.id ?? null
}

async function expectNoUser(login: string): Promise<void> {
	assert.equal(await userIdByLogin(login), null, `пользователь ${login} создан`)
}

async function roleKeysOf(userId: string): Promise<string[]> {
	const result = await ctx.pgPool.query<{ role_key: string }>(
		'SELECT role_key FROM user_roles WHERE user_id = $1 ORDER BY role_key',
		[userId]
	)
	return result.rows.map((item) => item.role_key)
}

async function inGroup(userId: string, groupId: string): Promise<boolean> {
	const result = await ctx.pgPool.query('SELECT 1 FROM user_groups WHERE user_id = $1 AND group_id = $2', [
		userId,
		groupId,
	])
	return (result.rowCount ?? 0) > 0
}

async function inviteCount(userId: string): Promise<number> {
	const result = await ctx.pgPool.query<{ count: string }>('SELECT count(*) AS count FROM invites WHERE user_id = $1', [
		userId,
	])
	return Number(result.rows[0]?.count ?? 0)
}

function teacherAGroup(members: string[] = []): Promise<string> {
	return w.freshGroup({ owner: w.users.teacherA.id, members })
}

function teacherBGroup(): Promise<string> {
	return w.freshGroup({ owner: w.users.teacherB.id })
}

async function target(kind: Target): Promise<ZoneUser> {
	if (kind === 'teacher') return w.freshUser({ role: 'teacher' })
	const student = await w.freshUser()
	if (kind === 'own') await teacherAGroup([student.id])
	return student
}

async function throttleRows(login: string): Promise<number> {
	const result = await ctx.pgPool.query<{ count: string }>(
		'SELECT count(*) AS count FROM login_throttle WHERE login = $1',
		[login]
	)
	return Number(result.rows[0]?.count ?? 0)
}

async function blockLogin(login: string): Promise<void> {
	await ctx.pgPool.query(
		"INSERT INTO login_throttle (bucket_key, login, failures, blocked_until) VALUES ($1, $2, 6, now() + interval '10 minutes')",
		[`${login}:${crypto.randomUUID()}`, login]
	)
}

async function meStatus(cookie: string): Promise<number> {
	return (await call(ctx, 'GET', '/api/auth/me', { cookies: cookie })).status
}

const ROWS: Row[] = []

function row(profiles: ZoneProfile[], route: string, title: string, run: (profile: ZoneProfile) => Promise<void>) {
	for (const profile of profiles) ROWS.push({ profile, route, title, run })
}

row(['teacherA'], 'POST /invites roleKey admin', '403 и пользователь не создан', async (p) => {
	const group = await teacherAGroup()
	const login = uniqueLogin()
	expectStatus(await send(p, 'POST', '/api/auth/invites', inviteBody(login, { roleKey: 'admin', groupId: group })), 403)
	await expectNoUser(login)
})
row(['teacherA'], 'POST /invites roleKey teacher', '403 и пользователь не создан', async (p) => {
	const group = await teacherAGroup()
	const login = uniqueLogin()
	expectStatus(
		await send(p, 'POST', '/api/auth/invites', inviteBody(login, { roleKey: 'teacher', groupId: group })),
		403
	)
	await expectNoUser(login)
})
row(
	['teacherA'],
	'POST /invites own group',
	'200, новый ученик неактивен, роль только user, в группе, created_by teacherA',
	async (p) => {
		const group = await teacherAGroup()
		const login = uniqueLogin()
		const reply = await send(p, 'POST', '/api/auth/invites', inviteBody(login, { groupId: group }))
		expectStatus(reply, 200)
		assert.equal(typeof reply.body.inviteLink, 'string')
		const result = await ctx.pgPool.query<{ id: string; is_active: boolean; created_by: string | null }>(
			'SELECT id, is_active, created_by FROM users WHERE login = $1',
			[login]
		)
		const created = result.rows[0]
		assert.ok(created, 'пользователь не создан')
		assert.equal(created.is_active, false)
		assert.equal(created.created_by, w.users.teacherA.id)
		assert.deepEqual(await roleKeysOf(created.id), ['user'])
		assert.ok(await inGroup(created.id, group), 'новый ученик не в группе')
	}
)
row(['teacherA'], 'POST /invites roleKey user', '200, роль только user', async (p) => {
	const group = await teacherAGroup()
	const login = uniqueLogin()
	expectStatus(await send(p, 'POST', '/api/auth/invites', inviteBody(login, { roleKey: 'user', groupId: group })), 200)
	const id = await userIdByLogin(login)
	assert.ok(id, 'пользователь не создан')
	assert.deepEqual(await roleKeysOf(id), ['user'])
})
row(['teacherA'], 'POST /invites without groupId', '400 и пользователь не создан', async (p) => {
	const login = uniqueLogin()
	expectStatus(await send(p, 'POST', '/api/auth/invites', inviteBody(login, {})), 400)
	await expectNoUser(login)
})
row(['teacherA'], 'POST /invites group of teacherB', '403 и пользователь не создан', async (p) => {
	const group = await teacherBGroup()
	const login = uniqueLogin()
	expectStatus(await send(p, 'POST', '/api/auth/invites', inviteBody(login, { groupId: group })), 403)
	await expectNoUser(login)
})
row(['s1'], 'POST /invites', '403 и пользователь не создан', async (p) => {
	const group = await teacherAGroup()
	const login = uniqueLogin()
	expectStatus(await send(p, 'POST', '/api/auth/invites', inviteBody(login, { groupId: group })), 403)
	await expectNoUser(login)
})

row(['teacherA'], 'POST /invites userId invited', '200 и ссылка выдана', async (p) => {
	const reply = await send(p, 'POST', '/api/auth/invites', { userId: w.users.invited.id })
	expectStatus(reply, 200)
	assert.equal(typeof reply.body.inviteLink, 'string')
	assert.equal(reply.body.userId, w.users.invited.id)
})
row(['teacherA'], 'POST /invites userId teacherOff', '403', async (p) => {
	expectStatus(await send(p, 'POST', '/api/auth/invites', { userId: w.users.teacherOff.id }), 403)
})
row(['teacherA'], 'POST /invites userId s1', '409 активному', async (p) => {
	expectStatus(await send(p, 'POST', '/api/auth/invites', { userId: w.users.s1.id }), 409)
})
row(
	['teacherA'],
	'POST /invites userId deactivated',
	'409 деактивированному ученику своей группы и ссылка не создана',
	async (p) => {
		const student = await w.freshUser({ isActive: false, activated: true })
		await teacherAGroup([student.id])
		expectStatus(await send(p, 'POST', '/api/auth/invites', { userId: student.id }), 409)
		assert.equal(await inviteCount(student.id), 0)
	}
)
row(
	['teacherA'],
	'POST /invites userId allow tests.write',
	'403 «Ученику» с allow-переопределением и ссылка не создана',
	async (p) => {
		const person = await w.freshUser({ isActive: false, activated: false, allow: ['tests.write'] })
		await teacherAGroup([person.id])
		expectStatus(await send(p, 'POST', '/api/auth/invites', { userId: person.id }), 403)
		assert.equal(await inviteCount(person.id), 0)
	}
)

row(['admin'], 'POST /invites roleKey teacher', '200 и роль teacher', async (p) => {
	const login = uniqueLogin()
	expectStatus(await send(p, 'POST', '/api/auth/invites', inviteBody(login, { roleKey: 'teacher' })), 200)
	const id = await userIdByLogin(login)
	assert.ok(id, 'пользователь не создан')
	assert.deepEqual(await roleKeysOf(id), ['teacher'])
})
row(['admin'], 'POST /invites roleKey user group of teacherB', '200 и новый пользователь в группе', async (p) => {
	const group = await teacherBGroup()
	const login = uniqueLogin()
	expectStatus(await send(p, 'POST', '/api/auth/invites', inviteBody(login, { roleKey: 'user', groupId: group })), 200)
	const id = await userIdByLogin(login)
	assert.ok(id, 'пользователь не создан')
	assert.ok(await inGroup(id, group), 'новый пользователь не в группе')
})
row(['admin'], 'POST /invites without roleKey', '400 и пользователь не создан', async (p) => {
	const login = uniqueLogin()
	expectStatus(await send(p, 'POST', '/api/auth/invites', inviteBody(login, {})), 400)
	await expectNoUser(login)
})
row(['admin'], 'POST /invites roleKey nope', '400 и пользователь не создан', async (p) => {
	const login = uniqueLogin()
	expectStatus(await send(p, 'POST', '/api/auth/invites', inviteBody(login, { roleKey: 'nope' })), 400)
	await expectNoUser(login)
})
row(['admin'], 'POST /invites userId s1', '409 активному', async (p) => {
	expectStatus(await send(p, 'POST', '/api/auth/invites', { userId: w.users.s1.id }), 409)
})
row(['admin'], 'POST /invites userId deactivated', '200 деактивированному ученику', async (p) => {
	const student = await w.freshUser({ isActive: false, activated: true })
	const reply = await send(p, 'POST', '/api/auth/invites', { userId: student.id })
	expectStatus(reply, 200)
	assert.equal(typeof reply.body.inviteLink, 'string')
	assert.equal(await inviteCount(student.id), 1)
})

const ASSIST_CASES: Array<[ZoneProfile, Target, number]> = [
	['teacherA', 'own', 200],
	['admin', 'own', 200],
	['adminNoZone', 'own', 403],
	['teacherA', 'ungrouped', 403],
	['teacherA', 'teacher', 403],
	['s1', 'ungrouped', 403],
]

for (const [profile, kind, expected] of ASSIST_CASES) {
	row([profile], `DELETE /api/users/:${kind}/login-throttle`, String(expected), async (p) => {
		const person = await target(kind)
		await blockLogin(person.login)
		const reply = await send(p, 'DELETE', `/api/users/${person.id}/login-throttle`)
		expectStatus(reply, expected)
		if (expected === 200) {
			assert.ok(Number(reply.body.cleared) >= 1, `cleared ${JSON.stringify(reply.body)}`)
			assert.equal(await throttleRows(person.login), 0)
		} else {
			assert.equal(await throttleRows(person.login), 1)
		}
	})
	row([profile], `POST /api/users/:${kind}/sessions/revoke`, String(expected), async (p) => {
		const person = await target(kind)
		const reply = await send(p, 'POST', `/api/users/${person.id}/sessions/revoke`)
		expectStatus(reply, expected)
		if (expected === 200) {
			assert.ok(Number(reply.body.revoked) >= 1, `revoked ${JSON.stringify(reply.body)}`)
			assert.equal(await meStatus(person.cookie), 401)
		} else {
			assert.equal(await meStatus(person.cookie), 200)
		}
	})
}

for (const [profile, expected] of [
	['admin', 404],
	['teacherA', 403],
] as Array<[ZoneProfile, number]>) {
	row([profile], 'DELETE /api/users/:missing/login-throttle', String(expected), async (p) => {
		expectStatus(await send(p, 'DELETE', `/api/users/${crypto.randomUUID()}/login-throttle`), expected)
	})
	row([profile], 'POST /api/users/:missing/sessions/revoke', String(expected), async (p) => {
		expectStatus(await send(p, 'POST', `/api/users/${crypto.randomUUID()}/sessions/revoke`), expected)
	})
}

row(['admin'], 'GET /api/rbac/roles', '200, признаки ownsZone и groupMember по ролям', async (p) => {
	const reply = await send(p, 'GET', '/api/rbac/roles')
	expectStatus(reply, 200)
	assert.ok(Array.isArray(reply.body.roles), 'нет списка ролей')
	const traits = Object.fromEntries(
		(reply.body.roles as Array<Record<string, unknown>>).map((item) => [
			String(item.key),
			{ ownsZone: item.ownsZone, groupMember: item.groupMember },
		])
	)
	assert.deepEqual(traits.admin, { ownsZone: false, groupMember: false })
	assert.deepEqual(traits.teacher, { ownsZone: true, groupMember: false })
	assert.deepEqual(traits.user, { ownsZone: false, groupMember: true })
})
row(['teacherA'], 'GET /api/rbac/roles', '403', async (p) => {
	expectStatus(await send(p, 'GET', '/api/rbac/roles'), 403)
})

beforeAll(async () => {
	ctx = await startAuthApp('test_tz_invites')
	w = await seedTeacherZoneWorld(ctx, 'tzinv')
}, 180_000)

afterAll(async () => {
	await ctx?.stop()
})

describe('матрица зоны учителя: приглашения, помощь со входом, признаки ролей', () => {
	const seen = new Set<string>()
	for (const item of ROWS) {
		const id = `${item.profile} ${item.route}`
		assert.ok(!seen.has(id), `повтор id ${id}`)
		seen.add(id)
		check(id, item.title, () => item.run(item.profile))
	}
	for (const id of KNOWN_DEFECTS) assert.ok(seen.has(id), `KNOWN_DEFECTS без строки ${id}`)
})

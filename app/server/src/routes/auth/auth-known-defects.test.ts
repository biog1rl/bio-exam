import assert from 'node:assert/strict'
import { afterAll, beforeAll, describe, test } from 'vitest'

import { call, login, seedUser, startAuthApp, type AuthApp, type CookieJar } from '../../test-support/auth-app.js'

const KNOWN_DEFECTS = new Set([
	'AUTH-01-db-error',
	'AUTH-02-role-removed',
	'AUTH-03-d4-allow',
	'AUTH-04-logout',
	'AUTH-05-parallel-refresh',
	'AUTH-06-foreign-ip',
])

const PASSWORD = 'defects-password-1'
const ATTACKER_IP = '203.0.113.10'
const OWNER_IP = '198.51.100.20'

let ctx: AuthApp
let topicSlug = ''
const ids = new Map<string, string>()

function defectTest(id: string, title: string, fn: () => Promise<void>): void {
	const name = `${id}: ${title}`
	if (KNOWN_DEFECTS.has(id)) test.fails(name, fn)
	else test(name, fn)
}

function userId(name: string): string {
	const id = ids.get(name)
	assert.ok(id, `no seeded user ${name}`)
	return id
}

function required<T>(value: T | null | undefined, what: string): T {
	assert.ok(value, `${what} is not prepared`)
	return value
}

async function countRefreshTokens(id: string): Promise<number> {
	const result = await ctx.pgPool.query<{ count: string }>(
		'SELECT count(*) AS count FROM refresh_tokens WHERE user_id = $1',
		[id]
	)
	return Number(result.rows[0]?.count ?? 0)
}

beforeAll(async () => {
	ctx = await startAuthApp('test_auth_defects')
	const seeds: Array<[string, string[]]> = [
		['defect_db_probe', ['admin']],
		['defect_db_admin', ['admin']],
		['defect_role_admin', ['admin']],
		['defect_d4_admin', ['admin']],
		['defect_d4_grantee', ['user']],
		['defect_logout_user', ['user']],
		['defect_refresh_user', ['user']],
		['defect_lock_owner', ['user']],
	]
	for (const [name, roles] of seeds) {
		ids.set(name, await seedUser(ctx, { login: name, roles, password: PASSWORD }))
	}

	const { db, schema } = ctx
	const [topic] = await db
		.insert(schema.topics)
		.values({ slug: 'defects-topic', title: 'Тема дефектов', isActive: true })
		.returning({ id: schema.topics.id, slug: schema.topics.slug })
	assert.ok(topic)
	topicSlug = topic.slug
	await db
		.insert(schema.tests)
		.values({ topicId: topic.id, slug: 'defects-free', title: 'Тест без назначения', isPublished: true })
	await db
		.insert(schema.rbacUserGrants)
		.values({ userId: userId('defect_d4_grantee'), domain: 'tests', action: 'read', allow: true })
}, 60_000)

afterAll(async () => {
	await ctx?.stop()
})

describe('AUTH-01-db-error: ошибка БД прав', () => {
	let adminJar: CookieJar | null = null

	test('подготовка: вход прошёл, /api/auth/me и /api/rbac/roles отвечают 200 до вмешательства', async () => {
		const probe = await login(ctx, 'defect_db_probe', PASSWORD)
		assert.equal(probe.status, 200)
		assert.equal((await call(ctx, 'GET', '/api/auth/me', { cookies: probe.jar })).status, 200)
		assert.equal((await call(ctx, 'GET', '/api/rbac/roles', { cookies: probe.jar })).status, 200)
		const admin = await login(ctx, 'defect_db_admin', PASSWORD)
		assert.equal(admin.status, 200)
		adminJar = admin.jar
	})

	defectTest(
		'AUTH-01-db-error',
		'при недоступной rbac_user_grants /api/auth/me и /api/rbac/roles отвечают ошибкой без запасного набора — исправляется в 04-04',
		async () => {
			const jar = required(adminJar, 'admin session')
			await ctx.pgPool.query('ALTER TABLE rbac_user_grants RENAME TO rbac_user_grants_off')
			try {
				const me = await call(ctx, 'GET', '/api/auth/me', { cookies: jar })
				const roles = await call(ctx, 'GET', '/api/rbac/roles', { cookies: jar })
				assert.ok(
					me.status >= 500 && roles.status >= 500,
					`/api/auth/me status ${me.status}, /api/rbac/roles status ${roles.status}`
				)
			} finally {
				await ctx.pgPool.query('ALTER TABLE rbac_user_grants_off RENAME TO rbac_user_grants')
			}
		}
	)
})

describe('AUTH-02-role-removed: снятие роли после входа', () => {
	let adminJar: CookieJar | null = null

	test('подготовка: admin вошёл, /api/rbac/roles и /api/settings/chart-default-range отвечают 200', async () => {
		const admin = await login(ctx, 'defect_role_admin', PASSWORD)
		assert.equal(admin.status, 200)
		assert.equal((await call(ctx, 'GET', '/api/rbac/roles', { cookies: admin.jar })).status, 200)
		assert.equal((await call(ctx, 'GET', '/api/settings/chart-default-range', { cookies: admin.jar })).status, 200)
		adminJar = admin.jar
	})

	defectTest(
		'AUTH-02-role-removed',
		'после снятия роли admin в user_roles следующий запрос получает 403 — исправляется в 04-05',
		async () => {
			const jar = required(adminJar, 'admin session')
			const id = userId('defect_role_admin')
			await ctx.pgPool.query("DELETE FROM user_roles WHERE user_id = $1 AND role_key = 'admin'", [id])
			await ctx.pgPool.query("INSERT INTO user_roles (user_id, role_key) VALUES ($1, 'user') ON CONFLICT DO NOTHING", [
				id,
			])
			const roles = await call(ctx, 'GET', '/api/rbac/roles', { cookies: jar })
			const settings = await call(ctx, 'GET', '/api/settings/chart-default-range', { cookies: jar })
			assert.deepEqual([roles.status, settings.status], [403, 403])
		}
	)
})

describe('AUTH-03-d4-allow: allow tests.read без назначения', () => {
	let granteeJar: CookieJar | null = null

	test('подготовка: вход прошёл, admin получает тест 200, у пользователя есть allow tests.read', async () => {
		const admin = await login(ctx, 'defect_d4_admin', PASSWORD)
		assert.equal(admin.status, 200)
		const adminReply = await call(ctx, 'GET', `/api/tests/public/topics/${topicSlug}/tests/defects-free`, {
			cookies: admin.jar,
		})
		assert.equal(adminReply.status, 200)
		const grants = await ctx.pgPool.query(
			"SELECT 1 FROM rbac_user_grants WHERE user_id = $1 AND domain = 'tests' AND action = 'read' AND allow = true",
			[userId('defect_d4_grantee')]
		)
		assert.equal(grants.rowCount, 1)
		const grantee = await login(ctx, 'defect_d4_grantee', PASSWORD)
		assert.equal(grantee.status, 200)
		granteeJar = grantee.jar
	})

	defectTest(
		'AUTH-03-d4-allow',
		'пользователь с allow tests.read без назначения получает тест 200 — исправляется в 04-05',
		async () => {
			const jar = required(granteeJar, 'grantee session')
			const reply = await call(ctx, 'GET', `/api/tests/public/topics/${topicSlug}/tests/defects-free`, {
				cookies: jar,
			})
			assert.equal(reply.status, 200)
		}
	)
})

describe('AUTH-04-logout: access-токен после выхода', () => {
	let oldSession: string | null = null

	test('подготовка: вход прошёл, /api/auth/me 200, выход 200', async () => {
		const user = await login(ctx, 'defect_logout_user', PASSWORD)
		assert.equal(user.status, 200)
		assert.equal((await call(ctx, 'GET', '/api/auth/me', { cookies: user.jar })).status, 200)
		const loggedOut = await call(ctx, 'POST', '/api/auth/logout', { cookies: user.jar })
		assert.equal(loggedOut.status, 200)
		oldSession = user.jar.get('bio_exam_session') ?? null
		assert.ok(oldSession)
	})

	defectTest(
		'AUTH-04-logout',
		'после выхода старый bio_exam_session получает 401 на /api/auth/me — исправляется в 04-06',
		async () => {
			const session = required(oldSession, 'old session')
			const reply = await call(ctx, 'GET', '/api/auth/me', { cookies: `bio_exam_session=${session}` })
			assert.equal(reply.status, 401)
		}
	)
})

describe('AUTH-05-parallel-refresh: два одновременных refresh', () => {
	let refreshToken: string | null = null

	test('подготовка: вход прошёл, у пользователя одна строка refresh_tokens', async () => {
		const user = await login(ctx, 'defect_refresh_user', PASSWORD)
		assert.equal(user.status, 200)
		refreshToken = user.jar.get('refresh_token') ?? null
		assert.ok(refreshToken)
		assert.equal(await countRefreshTokens(userId('defect_refresh_user')), 1)
	})

	defectTest(
		'AUTH-05-parallel-refresh',
		'два одновременных refresh одним токеном дают ровно одного преемника — исправляется в 04-07',
		async () => {
			const token = required(refreshToken, 'refresh token')
			const cookies = `refresh_token=${token}`
			const replies = await Promise.all([
				call(ctx, 'POST', '/api/auth/refresh', { cookies }),
				call(ctx, 'POST', '/api/auth/refresh', { cookies }),
			])
			assert.deepEqual(
				replies.map((reply) => reply.status),
				[200, 200]
			)
			assert.equal(await countRefreshTokens(userId('defect_refresh_user')), 2)
			const issued = replies.filter((reply) => (reply.setCookies.get('refresh_token')?.value ?? '') !== '')
			assert.equal(issued.length, 1)
		}
	)
})

describe('AUTH-06-foreign-ip: неудачи с чужого IP', () => {
	test('подготовка: пять неверных паролей с IP атакующего, каждый 401', async () => {
		for (let attempt = 0; attempt < 5; attempt += 1) {
			const reply = await login(ctx, 'defect_lock_owner', 'wrong-password', { ip: ATTACKER_IP })
			assert.equal(reply.status, 401, `attempt ${attempt + 1}`)
		}
	})

	defectTest(
		'AUTH-06-foreign-ip',
		'владелец входит с другого IP верным паролем 200 после пяти чужих неудач — исправляется в 04-08',
		async () => {
			const reply = await login(ctx, 'defect_lock_owner', PASSWORD, { ip: OWNER_IP })
			assert.equal(reply.status, 200)
		}
	)
})

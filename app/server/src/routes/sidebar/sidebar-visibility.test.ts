import assert from 'node:assert/strict'
import { afterAll, beforeAll, describe, test } from 'vitest'

import { call, login, seedUser, startAuthApp, type AuthApp, type CookieJar } from '../../test-support/auth-app.js'

const PASSWORD = 'sidebar-visibility-password-1'

let ctx: AuthApp
let adminJar: CookieJar
let teacherJar: CookieJar
let studentJar: CookieJar

function urls(body: Record<string, unknown>): string[] {
	const items = body.items as { url: string }[]
	return items.map((item) => item.url)
}

beforeAll(async () => {
	ctx = await startAuthApp('test_sidebar_visibility')
	await seedUser(ctx, { login: 'sbvis_admin', roles: ['admin'], password: PASSWORD })
	await seedUser(ctx, { login: 'sbvis_teacher', roles: ['teacher'], password: PASSWORD })
	await seedUser(ctx, { login: 'sbvis_student', roles: ['user'], password: PASSWORD })
	await ctx.db.insert(ctx.schema.sidebarItems).values([
		{ title: 'Правила экзамена', url: 'https://example.test/rules', icon: 'BookOpen', order: 0 },
		{ title: 'Банк', url: '/admin/tests', icon: 'Library', order: 1 },
		{ title: 'Права', url: '/admin/settings/rbac', icon: 'Lock', order: 2 },
		{ title: 'Скрытый', url: '/tests', icon: 'Eye', order: 3, isActive: false },
	])
	adminJar = (await login(ctx, 'sbvis_admin', PASSWORD)).jar
	teacherJar = (await login(ctx, 'sbvis_teacher', PASSWORD)).jar
	studentJar = (await login(ctx, 'sbvis_student', PASSWORD)).jar
}, 60_000)

afterAll(async () => {
	await ctx?.stop()
})

describe('GET /api/sidebar', () => {
	test('без сессии — 401', async () => {
		const reply = await call(ctx, 'GET', '/api/sidebar')
		assert.equal(reply.status, 401)
	})

	test('ученик получает только ссылки вне закрытых разделов', async () => {
		const reply = await call(ctx, 'GET', '/api/sidebar', { cookies: studentJar })
		assert.equal(reply.status, 200)
		assert.deepEqual(urls(reply.body), ['https://example.test/rules'])
	})

	test('учитель получает банк заданий, но не права доступа', async () => {
		const reply = await call(ctx, 'GET', '/api/sidebar', { cookies: teacherJar })
		assert.equal(reply.status, 200)
		assert.deepEqual(urls(reply.body), ['https://example.test/rules', '/admin/tests'])
	})

	test('администратор получает все активные ссылки по порядку', async () => {
		const reply = await call(ctx, 'GET', '/api/sidebar', { cookies: adminJar })
		assert.equal(reply.status, 200)
		assert.deepEqual(urls(reply.body), ['https://example.test/rules', '/admin/tests', '/admin/settings/rbac'])
	})
})

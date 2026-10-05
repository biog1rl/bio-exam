import assert from 'node:assert/strict'
import { afterAll, beforeAll, describe, test } from 'vitest'

import { call, login, seedUser, startAuthApp, type AuthApp, type CookieJar } from '../../test-support/auth-app.js'
import { LINK_URL_MESSAGE } from './schema.js'

const PASSWORD = 'sidebar-write-password-1'

let ctx: AuthApp
let adminJar: CookieJar
let teacherJar: CookieJar

beforeAll(async () => {
	ctx = await startAuthApp('test_sidebar_write')
	await seedUser(ctx, { login: 'sbwr_admin', roles: ['admin'], password: PASSWORD })
	await seedUser(ctx, { login: 'sbwr_teacher', roles: ['teacher'], password: PASSWORD })
	adminJar = (await login(ctx, 'sbwr_admin', PASSWORD)).jar
	teacherJar = (await login(ctx, 'sbwr_teacher', PASSWORD)).jar
}, 60_000)

afterAll(async () => {
	await ctx?.stop()
})

describe('POST и PUT /api/sidebar проверяют пункт меню', () => {
	test('без settings.manage — 403', async () => {
		const reply = await call(ctx, 'POST', '/api/sidebar', {
			cookies: teacherJar,
			body: { title: 'x', url: '/x', icon: 'Cat' },
		})
		assert.equal(reply.status, 403)
	})

	for (const url of ['javascript:alert(1)', '//evil.example/x', 'data:text/html,x', 'tests']) {
		test(`адрес ${url} отклоняется с русским сообщением`, async () => {
			const reply = await call(ctx, 'POST', '/api/sidebar', {
				cookies: adminJar,
				body: { title: 'Ссылка', url, icon: 'Cat' },
			})
			assert.equal(reply.status, 400)
			assert.equal(reply.body.error, LINK_URL_MESSAGE)
		})
	}

	test('допустимый пункт сохраняется с обрезанными пробелами и значениями по умолчанию', async () => {
		const reply = await call(ctx, 'POST', '/api/sidebar', {
			cookies: adminJar,
			body: { title: '  Правила  ', url: ' https://example.test/rules ', icon: 'BookOpen', extra: 'ignored' },
		})
		assert.equal(reply.status, 200)
		const item = reply.body.item as Record<string, unknown>
		assert.equal(item.title, 'Правила')
		assert.equal(item.url, 'https://example.test/rules')
		assert.equal(item.target, '_self')
		assert.equal(item.order, 0)
		assert.equal('extra' in item, false)

		const badUpdate = await call(ctx, 'PUT', `/api/sidebar/${String(item.id)}`, {
			cookies: adminJar,
			body: { url: 'javascript:alert(1)' },
		})
		assert.equal(badUpdate.status, 400)
		assert.equal(badUpdate.body.error, LINK_URL_MESSAGE)

		const hide = await call(ctx, 'PUT', `/api/sidebar/${String(item.id)}`, {
			cookies: adminJar,
			body: { isActive: false },
		})
		assert.equal(hide.status, 200)
		assert.equal((hide.body.item as Record<string, unknown>).isActive, false)
	})

	test('PUT и DELETE с неверным id — 400, а не ошибка базы', async () => {
		const put = await call(ctx, 'PUT', '/api/sidebar/not-a-uuid', { cookies: adminJar, body: { title: 'x' } })
		assert.equal(put.status, 400)
		const del = await call(ctx, 'DELETE', '/api/sidebar/not-a-uuid', { cookies: adminJar })
		assert.equal(del.status, 400)
	})

	test('PATCH /reorder принимает только список из UUID и целых чисел', async () => {
		const bad = await call(ctx, 'PATCH', '/api/sidebar/reorder', {
			cookies: adminJar,
			body: { items: [{ id: 'x', order: 1 }] },
		})
		assert.equal(bad.status, 400)
		const notArray = await call(ctx, 'PATCH', '/api/sidebar/reorder', { cookies: adminJar, body: { items: 'x' } })
		assert.equal(notArray.status, 400)
	})
})

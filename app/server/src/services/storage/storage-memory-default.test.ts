import assert from 'node:assert/strict'
import { afterAll, beforeAll, describe, test, vi } from 'vitest'

import {
	cookieHeader,
	login,
	seedUser,
	startAuthApp,
	type AuthApp,
	type CookieJar,
} from '../../test-support/auth-app.js'
import { memoryStorage } from '../../test-support/storage.js'

const PASSWORD = 'memory-default-password-1'

let ctx: AuthApp
let jar: CookieJar

beforeAll(async () => {
	vi.stubEnv('STORAGE_DRIVER', '')
	ctx = await startAuthApp('test_storage_memory_default')
	await seedUser(ctx, { login: 'storage_memory_admin', roles: ['admin'], password: PASSWORD })
	const reply = await login(ctx, 'storage_memory_admin', PASSWORD)
	assert.equal(reply.status, 200)
	jar = reply.jar
})

afterAll(async () => {
	await ctx?.stop()
	vi.unstubAllEnvs()
})

describe('isolated process without STORAGE_DRIVER uses the in-memory adapter', () => {
	test('GET /api/docs/assets/proxy returns the bytes put into memoryStorage', async () => {
		const bytes = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x01, 0xfe, 0xff, 0x57, 0x45, 0x42, 0x50])
		const memory = await memoryStorage()
		memory.put('images/tracer.webp', bytes, 'image/webp')

		const response = await fetch(`${ctx.baseUrl}/api/docs/assets/proxy?path=images%2Ftracer.webp`, {
			headers: { cookie: cookieHeader(jar) },
		})

		assert.equal(response.status, 200)
		assert.equal(response.headers.get('content-type'), 'image/webp')
		assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes)
	})
})

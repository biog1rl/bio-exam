import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, test, vi } from 'vitest'

vi.mock('@/lib/session/client', () => ({
	apiFetch: vi.fn(),
	AuthExpiredError: class AuthExpiredError extends Error {},
}))

import { MalformedBodyError, RequestError } from '@/lib/http/request'
import { apiFetch } from '@/lib/session/client'

import { deleteRoleGrant, parseRbacRoles, rbacKeys, rbacRolesFetcher, setRoleGrant } from './api'

const apiFetchMock = vi.mocked(apiFetch)

function json(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

beforeEach(() => {
	apiFetchMock.mockReset()
})

describe('rbacKeys', () => {
	test('та же строка, что ключ useRoleTraits: кэш SWR общий', () => {
		const source = readFileSync(fileURLToPath(new URL('../users/role-traits.ts', import.meta.url)), 'utf8')
		const match = /const ROLE_TRAITS_URL = '([^']+)'/.exec(source)
		assert.ok(match)
		assert.equal(match[1], rbacKeys.roles())
	})
})

describe('parseRbacRoles', () => {
	test('конверт ролей возвращается тем же объектом', () => {
		const body = { roles: [], overrides: [] }
		assert.equal(parseRbacRoles(body), body)
	})

	test('ответ с ошибкой и чужие формы — MalformedBodyError', () => {
		for (const body of [
			{ error: 'Forbidden' },
			null,
			undefined,
			[],
			'roles',
			{ roles: [] },
			{ overrides: [] },
			{ roles: {}, overrides: [] },
			{ roles: [], overrides: null },
		]) {
			assert.throws(() => parseRbacRoles(body), MalformedBodyError)
		}
	})
})

describe('rbacRolesFetcher', () => {
	test('200 с { error } — RequestError вида malformed', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, { error: 'Forbidden' }))
		await assert.rejects(rbacRolesFetcher(rbacKeys.roles()), (error: unknown) => {
			assert.ok(error instanceof RequestError)
			assert.equal(error.kind, 'malformed')
			return true
		})
	})
})

describe('гранты роли', () => {
	test.each([
		{
			name: 'setRoleGrant — POST /api/rbac/grant с allow',
			run: () => setRoleGrant({ roleKey: 'teacher', domain: 'tests', action: 'write', allow: true }),
			method: 'POST',
			body: { roleKey: 'teacher', domain: 'tests', action: 'write', allow: true },
		},
		{
			name: 'deleteRoleGrant — DELETE /api/rbac/grant без allow',
			run: () => deleteRoleGrant({ roleKey: 'teacher', domain: 'tests', action: 'write' }),
			method: 'DELETE',
			body: { roleKey: 'teacher', domain: 'tests', action: 'write' },
		},
	])('$name', async ({ run, method, body }) => {
		apiFetchMock.mockResolvedValueOnce(json(200, { ok: true }))
		const outcome = await run()
		assert.deepEqual(outcome, { ok: true, status: 200, data: { ok: true } })
		const [url, init] = apiFetchMock.mock.calls[0] ?? []
		assert.equal(url, '/api/rbac/grant')
		assert.equal(init?.method, method)
		assert.equal(init?.body, JSON.stringify(body))
		assert.equal(new Headers(init?.headers).get('content-type'), 'application/json')
	})

	test('400 с английским текстом — сырой текст сервера не попадает в сообщение', async () => {
		apiFetchMock.mockResolvedValueOnce(json(400, { error: 'Bad request' }))
		const outcome = await setRoleGrant({ roleKey: 'teacher', domain: 'tests', action: 'write', allow: false })
		assert.equal(outcome.ok, false)
		if (outcome.ok) return
		assert.equal(outcome.kind, 'http')
		assert.equal(outcome.message, 'Ошибка сохранения')
	})
})

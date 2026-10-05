import assert from 'node:assert/strict'
import { beforeEach, describe, test, vi } from 'vitest'

vi.mock('@/lib/session/client', () => ({
	apiFetch: vi.fn(),
	AuthExpiredError: class AuthExpiredError extends Error {},
}))

import { apiFetch } from '@/lib/session/client'

import { createInvite, parseInviteLink, reissueInvite } from './invites-api'

const apiFetchMock = vi.mocked(apiFetch)

const USER_ID = '11111111-1111-4111-8111-111111111111'
const GROUP_ID = '33333333-3333-4333-8333-333333333333'
const LINK = 'http://localhost:3000/invite/token'

function json(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function lastCall(): { url: string; init: RequestInit | undefined } {
	const call = apiFetchMock.mock.calls.at(-1)
	assert.ok(call)
	return { url: call[0], init: call[1] }
}

function headerValue(init: RequestInit | undefined, name: string): string | undefined {
	return ((init?.headers ?? {}) as Record<string, string>)[name]
}

beforeEach(() => {
	apiFetchMock.mockReset()
})

describe('createInvite', () => {
	test('POST /api/auth/invites с json, ответ — ссылка', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, { inviteLink: LINK, userId: USER_ID }))
		const body = { login: 'student', firstName: 'Иван', lastName: 'Иванов', groupId: GROUP_ID }

		const outcome = await createInvite(body)

		const { url, init } = lastCall()
		assert.equal(url, '/api/auth/invites')
		assert.equal(init?.method, 'POST')
		assert.equal(headerValue(init, 'Content-Type'), 'application/json')
		assert.deepEqual(JSON.parse(String(init?.body)), body)
		assert.equal(outcome.ok, true)
		if (outcome.ok) assert.equal(outcome.data.inviteLink, LINK)
	})

	test('ответ без ссылки — malformed', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, { userId: USER_ID }))

		const outcome = await createInvite({ login: 'student' })

		assert.equal(outcome.ok, false)
		if (!outcome.ok) assert.equal(outcome.kind, 'malformed')
	})
})

describe('reissueInvite', () => {
	test('POST /api/auth/invites с { userId }', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, { inviteLink: LINK, userId: USER_ID }))

		const outcome = await reissueInvite(USER_ID)

		const { url, init } = lastCall()
		assert.equal(url, '/api/auth/invites')
		assert.equal(init?.method, 'POST')
		assert.deepEqual(JSON.parse(String(init?.body)), { userId: USER_ID })
		assert.equal(outcome.ok, true)
		if (outcome.ok) assert.equal(outcome.data.inviteLink, LINK)
	})
})

describe('parseInviteLink', () => {
	test('непустая строка ссылки проходит', () => {
		const body = { inviteLink: LINK }
		assert.equal(parseInviteLink(body), body)
	})

	test('пустая ссылка, не строка или не объект — ошибка разбора', () => {
		assert.throws(() => parseInviteLink({ inviteLink: '' }))
		assert.throws(() => parseInviteLink({ inviteLink: 1 }))
		assert.throws(() => parseInviteLink(null))
	})
})

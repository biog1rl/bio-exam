import assert from 'node:assert/strict'
import { beforeEach, describe, test, vi } from 'vitest'

vi.mock('@/lib/session/client', () => ({
	apiFetch: vi.fn(),
	AuthExpiredError: class AuthExpiredError extends Error {},
}))

import { apiFetch } from '@/lib/session/client'

import { changeOwnPassword, deleteAvatar, parseAvatarUpload, updateOwnProfile, uploadAvatar } from './profile-api'

const apiFetchMock = vi.mocked(apiFetch)

function json(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function lastCall(): { url: string; init: RequestInit | undefined } {
	const call = apiFetchMock.mock.calls.at(-1)
	assert.ok(call)
	return { url: call[0], init: call[1] }
}

function headerMap(init: RequestInit | undefined): Record<string, string> {
	return (init?.headers ?? {}) as Record<string, string>
}

function headerNames(init: RequestInit | undefined): string[] {
	return Object.keys(headerMap(init)).map((name) => name.toLowerCase())
}

function headerValue(init: RequestInit | undefined, name: string): string | undefined {
	return headerMap(init)[name]
}

beforeEach(() => {
	apiFetchMock.mockReset()
})

describe('uploadAvatar', () => {
	test('POST /api/users/avatar с тем же FormData и без Content-Type', async () => {
		const form = new FormData()
		form.append('cropX', '1')
		const avatar = { avatarUrl: '/api/docs/assets/proxy?path=a', avatarCroppedUrl: '/api/docs/assets/proxy?path=b' }
		apiFetchMock.mockResolvedValueOnce(json(200, { ...avatar, cropParams: {} }))

		const outcome = await uploadAvatar(form)

		const { url, init } = lastCall()
		assert.equal(url, '/api/users/avatar')
		assert.equal(init?.method, 'POST')
		assert.equal(init?.body, form)
		assert.equal(headerNames(init).includes('content-type'), false)
		assert.equal(outcome.ok, true)
		if (outcome.ok) {
			assert.equal(outcome.data.avatarUrl, avatar.avatarUrl)
			assert.equal(outcome.data.avatarCroppedUrl, avatar.avatarCroppedUrl)
		}
	})

	test('ответ без адресов аватара — malformed', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, { message: 'ok' }))

		const outcome = await uploadAvatar(new FormData())

		assert.equal(outcome.ok, false)
		if (!outcome.ok) assert.equal(outcome.kind, 'malformed')
	})
})

describe('parseAvatarUpload', () => {
	test('адреса строкой или null проходят', () => {
		const body = { avatarUrl: null, avatarCroppedUrl: '/x' }
		assert.equal(parseAvatarUpload(body), body)
	})

	test('адрес не строкой — ошибка разбора', () => {
		assert.throws(() => parseAvatarUpload({ avatarUrl: 1, avatarCroppedUrl: null }))
		assert.throws(() => parseAvatarUpload(null))
	})
})

describe('deleteAvatar', () => {
	test('DELETE /api/users/avatar', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, { message: 'Аватар удален' }))

		const outcome = await deleteAvatar()

		const { url, init } = lastCall()
		assert.equal(url, '/api/users/avatar')
		assert.equal(init?.method, 'DELETE')
		assert.equal(init?.body, undefined)
		assert.equal(outcome.ok, true)
	})
})

describe('updateOwnProfile', () => {
	test('PATCH /api/users/profile с json, пустые поля уходят как null', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, { user: {} }))
		const body = { firstName: 'Иван', lastName: null, login: 'ivan', avatarColor: null, initials: null }

		const outcome = await updateOwnProfile(body)

		const { url, init } = lastCall()
		assert.equal(url, '/api/users/profile')
		assert.equal(init?.method, 'PATCH')
		assert.equal(headerValue(init, 'Content-Type'), 'application/json')
		assert.deepEqual(JSON.parse(String(init?.body)), body)
		assert.equal(outcome.ok, true)
	})
})

describe('changeOwnPassword', () => {
	test('POST /api/users/profile/password с json', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, { message: 'ok' }))

		const outcome = await changeOwnPassword({ oldPassword: 'old-pass', newPassword: 'new-pass' })

		const { url, init } = lastCall()
		assert.equal(url, '/api/users/profile/password')
		assert.equal(init?.method, 'POST')
		assert.deepEqual(JSON.parse(String(init?.body)), { oldPassword: 'old-pass', newPassword: 'new-pass' })
		assert.equal(outcome.ok, true)
	})
})

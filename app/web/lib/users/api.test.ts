import assert from 'node:assert/strict'
import { beforeEach, describe, test, vi } from 'vitest'

vi.mock('@/lib/session/client', () => ({
	apiFetch: vi.fn(),
	AuthExpiredError: class AuthExpiredError extends Error {},
}))

import { MalformedBodyError, RequestError } from '@/lib/http/request'
import { apiFetch, AuthExpiredError } from '@/lib/session/client'

import {
	assignTest,
	clearLoginThrottle,
	deleteUser,
	getUserByLogin,
	parseUserAssignments,
	parseUserAttempts,
	parseUserEnvelope,
	parseUserGrants,
	parseUsersList,
	removeUserGrant,
	revokeUserSessions,
	setUserGrant,
	setUserGroups,
	unassignTest,
	updateUser,
	userAssignmentsFetcher,
	userAttemptsFetcher,
	userByLoginFetcher,
	userGrantsFetcher,
	userGrantsKey,
	usersKeys,
	usersListFetcher,
} from './api'

const apiFetchMock = vi.mocked(apiFetch)

const USER_ID = '11111111-1111-4111-8111-111111111111'
const TEST_ID = '22222222-2222-4222-8222-222222222222'
const GROUP_ID = '33333333-3333-4333-8333-333333333333'

function json(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function lastCall(): { url: string; init: RequestInit | undefined } {
	const call = apiFetchMock.mock.calls.at(-1)
	assert.ok(call)
	return { url: call[0], init: call[1] }
}

beforeEach(() => {
	apiFetchMock.mockReset()
})

describe('usersKeys', () => {
	test('список — общий ключ /api/users', () => {
		assert.equal(usersKeys.list(), '/api/users')
	})

	test('по логину логин кодируется encodeURIComponent', () => {
		assert.equal(usersKeys.byLogin('Ivan Petrov'), '/api/users/by-login/Ivan%20Petrov')
		assert.equal(usersKeys.byLogin('a/b?c'), '/api/users/by-login/a%2Fb%3Fc')
	})

	test('по id, назначения и попытки — пути пользователя', () => {
		assert.equal(usersKeys.byId(USER_ID), `/api/users/${USER_ID}`)
		assert.equal(usersKeys.assignments(USER_ID), `/api/users/${USER_ID}/test-assignments`)
		assert.equal(usersKeys.attempts(USER_ID), `/api/users/${USER_ID}/test-attempts`)
	})
})

describe('parseUserEnvelope', () => {
	test('{ user: { id, login } } — пользователь', () => {
		const user = { id: USER_ID, login: 'student', name: 'Ученик' }
		assert.equal(parseUserEnvelope({ user }), user)
	})

	test('пользователь без логина проходит: страница решает сама', () => {
		const user = { id: USER_ID, login: null }
		assert.equal(parseUserEnvelope({ user }), user)
	})

	test('ошибка, массив и чужая форма — MalformedBodyError', () => {
		for (const body of [
			null,
			undefined,
			[],
			[{ id: USER_ID, login: 'student' }],
			{ error: 'Пользователь не найден' },
			{ user: null },
			{ user: [] },
			{ user: { login: 'student' } },
			{ user: { id: USER_ID } },
			{ user: { id: 1, login: 'student' } },
			{ user: { id: USER_ID, login: 5 } },
			{ rows: [{ id: USER_ID, login: 'student' }] },
		]) {
			assert.throws(() => parseUserEnvelope(body), MalformedBodyError, JSON.stringify(body))
		}
	})
})

describe('userByLoginFetcher и getUserByLogin', () => {
	test('ключ по логину отдаёт пользователя из конверта', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, { user: { id: USER_ID, login: 'student' } }))
		assert.deepEqual(await userByLoginFetcher(usersKeys.byLogin('student')), { id: USER_ID, login: 'student' })
		assert.equal(lastCall().url, '/api/users/by-login/student')
	})

	test('404 — RequestError http 404 с текстом сервера', async () => {
		apiFetchMock.mockResolvedValueOnce(json(404, { error: 'Пользователь не найден' }))
		const error = await getUserByLogin('нет').catch((caught: unknown) => caught)
		assert.ok(error instanceof RequestError)
		assert.equal(error.kind, 'http')
		assert.equal(error.status, 404)
		assert.equal(error.message, 'Пользователь не найден')
	})

	test('403 — RequestError http 403', async () => {
		apiFetchMock.mockResolvedValueOnce(json(403, { error: 'Forbidden' }))
		const error = await getUserByLogin('чужой').catch((caught: unknown) => caught)
		assert.ok(error instanceof RequestError)
		assert.equal(error.kind, 'http')
		assert.equal(error.status, 403)
	})

	test('200 с чужим телом — malformed', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, { rows: [] }))
		const error = await getUserByLogin('student').catch((caught: unknown) => caught)
		assert.ok(error instanceof RequestError)
		assert.equal(error.kind, 'malformed')
		assert.equal(error.status, 200)
	})
})

describe('назначения и попытки пользователя', () => {
	test('parseUserAssignments и parseUserAttempts проверяют конверт', () => {
		const assignments = { assignments: [] }
		const attempts = { attempts: [] }
		assert.equal(parseUserAssignments(assignments), assignments)
		assert.equal(parseUserAttempts(attempts), attempts)
		for (const body of [null, [], { error: 'x' }, { assignments: {} }]) {
			assert.throws(() => parseUserAssignments(body), MalformedBodyError)
		}
		for (const body of [null, [], { error: 'x' }, { attempts: 'x' }]) {
			assert.throws(() => parseUserAttempts(body), MalformedBodyError)
		}
	})

	test('фетчеры идут по ключам пользователя', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, { assignments: [] }))
		assert.deepEqual(await userAssignmentsFetcher(usersKeys.assignments(USER_ID)), { assignments: [] })
		assert.equal(lastCall().url, `/api/users/${USER_ID}/test-assignments`)

		apiFetchMock.mockResolvedValueOnce(json(200, { attempts: [] }))
		assert.deepEqual(await userAttemptsFetcher(usersKeys.attempts(USER_ID)), { attempts: [] })
		assert.equal(lastCall().url, `/api/users/${USER_ID}/test-attempts`)
	})
})

describe('действия на странице ученика', () => {
	test('assignTest — POST назначений с testId', async () => {
		apiFetchMock.mockResolvedValueOnce(json(201, { ok: true }))
		const outcome = await assignTest(USER_ID, TEST_ID)
		assert.equal(outcome.ok, true)
		const { url, init } = lastCall()
		assert.equal(url, `/api/users/${USER_ID}/test-assignments`)
		assert.ok(init)
		assert.equal(init.method, 'POST')
		assert.deepEqual(JSON.parse(String(init.body)), { testId: TEST_ID })
		assert.equal((init.headers as Record<string, string>)['Content-Type'], 'application/json')
	})

	test('unassignTest — DELETE назначения теста', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, { ok: true }))
		const outcome = await unassignTest(USER_ID, TEST_ID)
		assert.equal(outcome.ok, true)
		const { url, init } = lastCall()
		assert.equal(url, `/api/users/${USER_ID}/test-assignments/${TEST_ID}`)
		assert.equal(init?.method, 'DELETE')
	})

	test('revokeUserSessions — POST sessions/revoke', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, { ok: true }))
		assert.equal((await revokeUserSessions(USER_ID)).ok, true)
		const { url, init } = lastCall()
		assert.equal(url, `/api/users/${USER_ID}/sessions/revoke`)
		assert.equal(init?.method, 'POST')
	})

	test('clearLoginThrottle — DELETE login-throttle', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, { ok: true }))
		assert.equal((await clearLoginThrottle(USER_ID)).ok, true)
		const { url, init } = lastCall()
		assert.equal(url, `/api/users/${USER_ID}/login-throttle`)
		assert.equal(init?.method, 'DELETE')
	})

	test('отказ — исход с status и телом', async () => {
		apiFetchMock.mockResolvedValueOnce(json(403, { error: 'Forbidden' }))
		const outcome = await assignTest(USER_ID, TEST_ID)
		assert.equal(outcome.ok, false)
		if (outcome.ok) return
		assert.equal(outcome.kind, 'http')
		assert.equal(outcome.status, 403)
		assert.deepEqual(outcome.body, { error: 'Forbidden' })

		apiFetchMock.mockResolvedValueOnce(json(500, { error: 'Internal' }))
		const revoked = await revokeUserSessions(USER_ID)
		assert.equal(revoked.ok, false)
		if (revoked.ok) return
		assert.equal(revoked.status, 500)

		apiFetchMock.mockResolvedValueOnce(json(429, {}))
		const cleared = await clearLoginThrottle(USER_ID)
		assert.equal(cleared.ok, false)
		if (cleared.ok) return
		assert.equal(cleared.status, 429)
	})

	test('сеть и истёкшая сессия — network и auth без status', async () => {
		apiFetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
		const network = await unassignTest(USER_ID, TEST_ID)
		assert.equal(network.ok, false)
		if (network.ok) return
		assert.equal(network.kind, 'network')
		assert.equal(network.status, undefined)

		apiFetchMock.mockRejectedValueOnce(new AuthExpiredError())
		const auth = await assignTest(USER_ID, TEST_ID)
		assert.equal(auth.ok, false)
		if (auth.ok) return
		assert.equal(auth.kind, 'auth')
		assert.equal(auth.message, '')
	})
})

describe('список пользователей', () => {
	test('parseUsersList возвращает то же тело: ключ общий с GroupSheet', () => {
		const empty = { rows: [], total: 0 }
		assert.equal(parseUsersList(empty), empty)
		const filled = { rows: [{ id: USER_ID, login: 'student' }], total: 1 }
		assert.equal(parseUsersList(filled), filled)
	})

	test('ошибка и чужая форма — MalformedBodyError', () => {
		for (const body of [
			null,
			undefined,
			[],
			{ error: 'Internal Server Error' },
			{ rows: {}, total: 0 },
			{ rows: [] },
			{ rows: [], total: '0' },
			{ user: { id: USER_ID } },
		]) {
			assert.throws(() => parseUsersList(body), MalformedBodyError, JSON.stringify(body))
		}
	})

	test('usersListFetcher идёт по usersKeys.list() и отдаёт тело как есть', async () => {
		const body = { rows: [{ id: USER_ID, login: 'student' }], total: 1 }
		apiFetchMock.mockResolvedValueOnce(json(200, body))
		assert.deepEqual(await usersListFetcher(usersKeys.list()), body)
		assert.equal(lastCall().url, '/api/users')
	})

	test('ответ { error } с 500 — RequestError, а не пустая таблица', async () => {
		apiFetchMock.mockResolvedValueOnce(json(500, { error: 'Internal Server Error' }))
		const error = await usersListFetcher(usersKeys.list()).catch((caught: unknown) => caught)
		assert.ok(error instanceof RequestError)
		assert.equal(error.kind, 'http')
		assert.equal(error.status, 500)
	})

	test('200 с { error } — malformed', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, { error: 'x' }))
		const error = await usersListFetcher(usersKeys.list()).catch((caught: unknown) => caught)
		assert.ok(error instanceof RequestError)
		assert.equal(error.kind, 'malformed')
	})
})

describe('права пользователя', () => {
	const grants = {
		roles: ['teacher'],
		roleKeys: ['tests.read'],
		userOverrides: [{ domain: 'tests', action: 'write', allow: true }],
		effective: ['tests.read', 'tests.write'],
	}

	test('userGrantsKey — прежняя строка ключа', () => {
		assert.equal(userGrantsKey(USER_ID), `/api/rbac/user/${USER_ID}/grants`)
	})

	test('parseUserGrants проверяет массивы и возвращает то же тело', () => {
		assert.equal(parseUserGrants(grants), grants)
		for (const body of [
			null,
			[],
			{ error: 'Forbidden' },
			{ ...grants, roleKeys: undefined },
			{ ...grants, userOverrides: {} },
			{ ...grants, effective: 'tests.read' },
		]) {
			assert.throws(() => parseUserGrants(body), MalformedBodyError, JSON.stringify(body))
		}
	})

	test('userGrantsFetcher идёт по ключу грантов', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, grants))
		assert.deepEqual(await userGrantsFetcher(userGrantsKey(USER_ID)), grants)
		assert.equal(lastCall().url, `/api/rbac/user/${USER_ID}/grants`)
	})

	test('403 грантов — RequestError http 403', async () => {
		apiFetchMock.mockResolvedValueOnce(json(403, { error: 'Forbidden' }))
		const error = await userGrantsFetcher(userGrantsKey(USER_ID)).catch((caught: unknown) => caught)
		assert.ok(error instanceof RequestError)
		assert.equal(error.status, 403)
	})

	test('setUserGrant — POST /api/rbac/user/grant с allow', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, { ok: true }))
		const outcome = await setUserGrant({ userId: USER_ID, domain: 'tests', action: 'write', allow: false })
		assert.equal(outcome.ok, true)
		const { url, init } = lastCall()
		assert.equal(url, '/api/rbac/user/grant')
		assert.equal(init?.method, 'POST')
		assert.deepEqual(JSON.parse(String(init?.body)), {
			userId: USER_ID,
			domain: 'tests',
			action: 'write',
			allow: false,
		})
		assert.equal((init?.headers as Record<string, string>)['Content-Type'], 'application/json')
	})

	test('removeUserGrant — DELETE /api/rbac/user/grant без allow', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, { ok: true }))
		const outcome = await removeUserGrant({ userId: USER_ID, domain: 'tests', action: 'write' })
		assert.equal(outcome.ok, true)
		const { url, init } = lastCall()
		assert.equal(url, '/api/rbac/user/grant')
		assert.equal(init?.method, 'DELETE')
		assert.deepEqual(JSON.parse(String(init?.body)), { userId: USER_ID, domain: 'tests', action: 'write' })
	})
})

describe('правка пользователя', () => {
	const patch = {
		firstName: 'Иван',
		lastName: 'Петров',
		login: 'ivan',
		isActive: true,
		birthdate: null,
		telegram: '',
		phone: '',
		email: '',
		roles: ['teacher'],
	}

	test('updateUser — PATCH /api/users/<id> с телом правки', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, { ok: true }))
		const outcome = await updateUser(USER_ID, patch)
		assert.equal(outcome.ok, true)
		const { url, init } = lastCall()
		assert.equal(url, `/api/users/${USER_ID}`)
		assert.equal(init?.method, 'PATCH')
		assert.deepEqual(JSON.parse(String(init?.body)), patch)
		assert.equal((init?.headers as Record<string, string>)['Content-Type'], 'application/json')
	})

	test('setUserGroups — PATCH /api/users/<id>/group с { groupIds }', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, { ok: true }))
		const outcome = await setUserGroups(USER_ID, [GROUP_ID])
		assert.equal(outcome.ok, true)
		const { url, init } = lastCall()
		assert.equal(url, `/api/users/${USER_ID}/group`)
		assert.equal(init?.method, 'PATCH')
		assert.deepEqual(JSON.parse(String(init?.body)), { groupIds: [GROUP_ID] })
	})

	test('setUserGroups с пустым списком снимает все группы', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, { ok: true }))
		await setUserGroups(USER_ID, [])
		assert.deepEqual(JSON.parse(String(lastCall().init?.body)), { groupIds: [] })
	})

	test('deleteUser — DELETE /api/users/<id>', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, { ok: true }))
		assert.equal((await deleteUser(USER_ID)).ok, true)
		const { url, init } = lastCall()
		assert.equal(url, `/api/users/${USER_ID}`)
		assert.equal(init?.method, 'DELETE')
	})

	test('отказ правки — исход с текстом сервера в body', async () => {
		apiFetchMock.mockResolvedValueOnce(json(409, { error: 'Логин уже используется' }))
		const outcome = await updateUser(USER_ID, patch)
		assert.equal(outcome.ok, false)
		if (outcome.ok) return
		assert.equal(outcome.kind, 'http')
		assert.equal(outcome.status, 409)
		assert.equal(outcome.message, 'Логин уже используется')
	})
})

import assert from 'node:assert/strict'
import { beforeEach, describe, test, vi } from 'vitest'

vi.mock('@/lib/session/client', () => ({
	apiFetch: vi.fn(),
	AuthExpiredError: class AuthExpiredError extends Error {},
}))

import { MalformedBodyError, RequestError } from '@/lib/http/request'
import { apiFetch } from '@/lib/session/client'

import {
	assignTest,
	clearLoginThrottle,
	deleteUser,
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

type RequestRow = {
	name: string
	run: () => Promise<{ ok: boolean }>
	url: string
	method: string
	body?: unknown
	contentType?: boolean
}

async function checkRequest({ run, url, method, body, contentType }: RequestRow) {
	apiFetchMock.mockResolvedValueOnce(json(200, { ok: true }))
	assert.equal((await run()).ok, true)
	const call = lastCall()
	assert.equal(call.url, url)
	assert.equal(call.init?.method, method)
	if (body !== undefined) assert.deepEqual(JSON.parse(String(call.init?.body)), body)
	if (contentType) assert.equal((call.init?.headers as Record<string, string>)['Content-Type'], 'application/json')
}

beforeEach(() => {
	apiFetchMock.mockReset()
})

describe('usersKeys', () => {
	test('по логину логин кодируется encodeURIComponent', () => {
		assert.equal(usersKeys.byLogin('Ivan Petrov'), '/api/users/by-login/Ivan%20Petrov')
		assert.equal(usersKeys.byLogin('a/b?c'), '/api/users/by-login/a%2Fb%3Fc')
	})
})

describe('parseUserEnvelope', () => {
	test.each(
		[
			{ name: '{ user: { id, login } } — пользователь', user: { id: USER_ID, login: 'student', name: 'Ученик' } },
			{ name: 'пользователь без логина проходит: страница решает сама', user: { id: USER_ID, login: null } },
		].map((row): [string, typeof row] => [row.name, row])
	)('%s', (_name, { user }) => {
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
	test.each(
		(
			[
				{
					name: 'assignTest — POST назначений с testId',
					run: () => assignTest(USER_ID, TEST_ID),
					url: `/api/users/${USER_ID}/test-assignments`,
					method: 'POST',
					body: { testId: TEST_ID },
					contentType: true,
				},
				{
					name: 'unassignTest — DELETE назначения теста',
					run: () => unassignTest(USER_ID, TEST_ID),
					url: `/api/users/${USER_ID}/test-assignments/${TEST_ID}`,
					method: 'DELETE',
				},
				{
					name: 'revokeUserSessions — POST sessions/revoke',
					run: () => revokeUserSessions(USER_ID),
					url: `/api/users/${USER_ID}/sessions/revoke`,
					method: 'POST',
				},
				{
					name: 'clearLoginThrottle — DELETE login-throttle',
					run: () => clearLoginThrottle(USER_ID),
					url: `/api/users/${USER_ID}/login-throttle`,
					method: 'DELETE',
				},
			] as RequestRow[]
		).map((row): [string, RequestRow] => [row.name, row])
	)('%s', (_name, row) => checkRequest(row))
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

	test.each(
		(
			[
				{
					name: 'setUserGrant — POST /api/rbac/user/grant с allow',
					run: () => setUserGrant({ userId: USER_ID, domain: 'tests', action: 'write', allow: false }),
					url: '/api/rbac/user/grant',
					method: 'POST',
					body: { userId: USER_ID, domain: 'tests', action: 'write', allow: false },
					contentType: true,
				},
				{
					name: 'removeUserGrant — DELETE /api/rbac/user/grant без allow',
					run: () => removeUserGrant({ userId: USER_ID, domain: 'tests', action: 'write' }),
					url: '/api/rbac/user/grant',
					method: 'DELETE',
					body: { userId: USER_ID, domain: 'tests', action: 'write' },
				},
			] as RequestRow[]
		).map((row): [string, RequestRow] => [row.name, row])
	)('%s', (_name, row) => checkRequest(row))
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

	test.each(
		(
			[
				{
					name: 'updateUser — PATCH /api/users/<id> с телом правки',
					run: () => updateUser(USER_ID, patch),
					url: `/api/users/${USER_ID}`,
					method: 'PATCH',
					body: patch,
					contentType: true,
				},
				{
					name: 'setUserGroups — PATCH /api/users/<id>/group с { groupIds }',
					run: () => setUserGroups(USER_ID, [GROUP_ID]),
					url: `/api/users/${USER_ID}/group`,
					method: 'PATCH',
					body: { groupIds: [GROUP_ID] },
				},
				{
					name: 'deleteUser — DELETE /api/users/<id>',
					run: () => deleteUser(USER_ID),
					url: `/api/users/${USER_ID}`,
					method: 'DELETE',
				},
			] as RequestRow[]
		).map((row): [string, RequestRow] => [row.name, row])
	)('%s', (_name, row) => checkRequest(row))
})

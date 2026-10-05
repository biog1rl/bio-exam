import assert from 'node:assert/strict'
import { beforeEach, describe, test, vi } from 'vitest'

vi.mock('@/lib/session/client', () => ({
	apiFetch: vi.fn(),
	AuthExpiredError: class AuthExpiredError extends Error {},
}))

import { MalformedBodyError, RequestError } from '@/lib/http/request'
import { apiFetch, AuthExpiredError } from '@/lib/session/client'

import {
	candidatesFetcher,
	deleteGroup,
	groupDetailFetcher,
	groupsKeys,
	groupsListFetcher,
	myGroupsFetcher,
	ownerOptionsFetcher,
	parseCandidates,
	parseGroupDetail,
	parseGroupsList,
	parseMyGroups,
	parseOwnerOptions,
	saveGroup,
} from './api'
import { candidatesSource } from './group-form'

const apiFetchMock = vi.mocked(apiFetch)

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

describe('groupsKeys', () => {
	test('список и мои группы — прежние строки ключей', () => {
		assert.equal(groupsKeys.list(), '/api/groups')
		assert.equal(groupsKeys.my(), '/api/groups/my')
		assert.equal(groupsKeys.ownerOptions(), '/api/groups/owner-options')
	})

	test('карточка группы — путь группы', () => {
		assert.equal(groupsKeys.detail(GROUP_ID), `/api/groups/${GROUP_ID}`)
	})

	test('кандидаты кодируют запрос', () => {
		assert.equal(groupsKeys.candidates('Ив Пе'), '/api/groups/candidates?q=%D0%98%D0%B2%20%D0%9F%D0%B5')
		assert.equal(groupsKeys.candidates('a&b'), '/api/groups/candidates?q=a%26b')
	})

	test('ключ кандидатов совпадает с источником 07.1', () => {
		assert.equal(groupsKeys.candidates('Ан'), candidatesSource({ zoneAll: false, query: 'Ан' }))
		assert.equal(groupsKeys.candidates('  Ан '), candidatesSource({ zoneAll: false, query: '  Ан ' }))
	})
})

describe('parse', () => {
	test('parseGroupsList возвращает тело без преобразования', () => {
		const body = { groups: [] }
		assert.equal(parseGroupsList(body), body)
		const withOwner = { groups: [{ id: GROUP_ID, name: '9А', memberCount: 2, createdAt: 'x', owner: null }] }
		assert.equal(parseGroupsList(withOwner), withOwner)
	})

	test('parseGroupsList отклоняет ответ с ошибкой', () => {
		assert.throws(() => parseGroupsList({ error: 'Forbidden' }), MalformedBodyError)
		assert.throws(() => parseGroupsList(null), MalformedBodyError)
		assert.throws(() => parseGroupsList({ groups: {} }), MalformedBodyError)
	})

	test('parseMyGroups принимает лишнее поле group', () => {
		const body = { groups: [{ id: GROUP_ID, name: '9А' }], group: { id: GROUP_ID, name: '9А' } }
		assert.equal(parseMyGroups(body), body)
		assert.throws(() => parseMyGroups({ group: null }), MalformedBodyError)
	})

	test('parseGroupDetail требует группу с составом', () => {
		const body = { group: { id: GROUP_ID, name: '9А', createdAt: 'x', members: [] } }
		assert.equal(parseGroupDetail(body), body)
		assert.throws(() => parseGroupDetail({ group: { id: GROUP_ID } }), MalformedBodyError)
		assert.throws(() => parseGroupDetail({ error: 'Group not found' }), MalformedBodyError)
	})

	test('parseCandidates и parseOwnerOptions проверяют конверт', () => {
		const users = { users: [] }
		const owners = { owners: [] }
		assert.equal(parseCandidates(users), users)
		assert.equal(parseOwnerOptions(owners), owners)
		assert.throws(() => parseCandidates({ error: 'x' }), MalformedBodyError)
		assert.throws(() => parseOwnerOptions({ error: 'Forbidden' }), MalformedBodyError)
	})
})

describe('фетчеры', () => {
	test('groupsListFetcher при 200 с { error } бросает malformed', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, { error: 'Forbidden' }))
		await assert.rejects(groupsListFetcher(groupsKeys.list()), (error: unknown) => {
			assert.ok(error instanceof RequestError)
			assert.equal(error.kind, 'malformed')
			return true
		})
	})

	test('groupsListFetcher при 500 бросает http со статусом', async () => {
		apiFetchMock.mockResolvedValueOnce(json(500, { error: 'Internal' }))
		await assert.rejects(groupsListFetcher(groupsKeys.list()), (error: unknown) => {
			assert.ok(error instanceof RequestError)
			assert.equal(error.kind, 'http')
			assert.equal(error.status, 500)
			return true
		})
	})

	test('groupsListFetcher отдаёт тело списка', async () => {
		const body = { groups: [{ id: GROUP_ID, name: '9А', memberCount: 0, createdAt: 'x' }] }
		apiFetchMock.mockResolvedValueOnce(json(200, body))
		assert.deepEqual(await groupsListFetcher(groupsKeys.list()), body)
		assert.equal(lastCall().url, '/api/groups')
	})

	test('фетчеры карточки, кандидатов, владельцев и моих групп разбирают конверт', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, { group: { id: GROUP_ID, name: '9А', createdAt: 'x', members: [] } }))
		assert.equal((await groupDetailFetcher(groupsKeys.detail(GROUP_ID))).group.id, GROUP_ID)
		apiFetchMock.mockResolvedValueOnce(json(200, { users: [] }))
		assert.deepEqual(await candidatesFetcher(groupsKeys.candidates('Ан')), { users: [] })
		apiFetchMock.mockResolvedValueOnce(json(200, { owners: [] }))
		assert.deepEqual(await ownerOptionsFetcher(groupsKeys.ownerOptions()), { owners: [] })
		apiFetchMock.mockResolvedValueOnce(json(200, { groups: [], group: null }))
		assert.deepEqual(await myGroupsFetcher(groupsKeys.my()), { groups: [], group: null })
	})

	test('candidatesFetcher при 400 бросает http', async () => {
		apiFetchMock.mockResolvedValueOnce(json(400, { error: 'Укажите не меньше 2 символов для поиска' }))
		await assert.rejects(candidatesFetcher(groupsKeys.candidates('Ан')), (error: unknown) => {
			assert.ok(error instanceof RequestError)
			assert.equal(error.kind, 'http')
			return true
		})
	})
})

describe('запись', () => {
	const body = { name: '9А', memberIds: ['u1'] }

	test('saveGroup без id создаёт группу POST', async () => {
		apiFetchMock.mockResolvedValueOnce(json(201, { group: { id: GROUP_ID } }))
		const outcome = await saveGroup({ body })
		assert.equal(outcome.ok, true)
		const { url, init } = lastCall()
		assert.equal(url, '/api/groups')
		assert.equal(init?.method, 'POST')
		assert.equal(init?.body, JSON.stringify(body))
		assert.equal(new Headers(init?.headers).get('content-type'), 'application/json')
	})

	test('saveGroup с id правит группу PATCH', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, { ok: true }))
		const outcome = await saveGroup({ id: GROUP_ID, body: { ...body, ownerId: null } })
		assert.equal(outcome.ok, true)
		const { url, init } = lastCall()
		assert.equal(url, `/api/groups/${GROUP_ID}`)
		assert.equal(init?.method, 'PATCH')
		assert.equal(init?.body, JSON.stringify({ ...body, ownerId: null }))
	})

	test('saveGroup отдаёт статус отказа', async () => {
		apiFetchMock.mockResolvedValueOnce(json(400, { error: 'Invalid request' }))
		const outcome = await saveGroup({ body })
		assert.equal(outcome.ok, false)
		if (outcome.ok) return
		assert.equal(outcome.kind, 'http')
		assert.equal(outcome.status, 400)
	})

	test('saveGroup при истёкшей сессии — auth', async () => {
		apiFetchMock.mockRejectedValueOnce(new AuthExpiredError())
		const outcome = await saveGroup({ body })
		assert.equal(outcome.ok, false)
		if (outcome.ok) return
		assert.equal(outcome.kind, 'auth')
	})

	test('deleteGroup удаляет группу DELETE', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, { ok: true }))
		const outcome = await deleteGroup(GROUP_ID)
		assert.equal(outcome.ok, true)
		const { url, init } = lastCall()
		assert.equal(url, `/api/groups/${GROUP_ID}`)
		assert.equal(init?.method, 'DELETE')
	})

	test('deleteGroup при сетевой ошибке — network', async () => {
		apiFetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
		const outcome = await deleteGroup(GROUP_ID)
		assert.equal(outcome.ok, false)
		if (outcome.ok) return
		assert.equal(outcome.kind, 'network')
	})
})

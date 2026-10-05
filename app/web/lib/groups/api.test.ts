import assert from 'node:assert/strict'
import { beforeEach, describe, test, vi } from 'vitest'

vi.mock('@/lib/session/client', () => ({
	apiFetch: vi.fn(),
	AuthExpiredError: class AuthExpiredError extends Error {},
}))

import { MalformedBodyError, RequestError } from '@/lib/http/request'
import { apiFetch } from '@/lib/session/client'

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
	test('кандидаты кодируют запрос', () => {
		assert.equal(groupsKeys.candidates('Ив Пе'), '/api/groups/candidates?q=%D0%98%D0%B2%20%D0%9F%D0%B5')
		assert.equal(groupsKeys.candidates('a&b'), '/api/groups/candidates?q=a%26b')
	})
})

describe('parse', () => {
	test.each(
		(
			[
				{
					name: 'parseGroupsList возвращает тело без преобразования',
					cases: [
						[parseGroupsList, { groups: [] }, true],
						[
							parseGroupsList,
							{ groups: [{ id: GROUP_ID, name: '9А', memberCount: 2, createdAt: 'x', owner: null }] },
							true,
						],
					],
				},
				{
					name: 'parseGroupsList отклоняет ответ с ошибкой',
					cases: [
						[parseGroupsList, { error: 'Forbidden' }, false],
						[parseGroupsList, null, false],
						[parseGroupsList, { groups: {} }, false],
					],
				},
				{
					name: 'parseMyGroups принимает лишнее поле group',
					cases: [
						[parseMyGroups, { groups: [{ id: GROUP_ID, name: '9А' }], group: { id: GROUP_ID, name: '9А' } }, true],
						[parseMyGroups, { group: null }, false],
					],
				},
				{
					name: 'parseGroupDetail требует группу с составом',
					cases: [
						[parseGroupDetail, { group: { id: GROUP_ID, name: '9А', createdAt: 'x', members: [] } }, true],
						[parseGroupDetail, { group: { id: GROUP_ID } }, false],
						[parseGroupDetail, { error: 'Group not found' }, false],
					],
				},
				{
					name: 'parseCandidates и parseOwnerOptions проверяют конверт',
					cases: [
						[parseCandidates, { users: [] }, true],
						[parseOwnerOptions, { owners: [] }, true],
						[parseCandidates, { error: 'x' }, false],
						[parseOwnerOptions, { error: 'Forbidden' }, false],
					],
				},
			] as { name: string; cases: [(body: unknown) => unknown, unknown, boolean][] }[]
		).map((row): [string, { name: string; cases: [(body: unknown) => unknown, unknown, boolean][] }] => [row.name, row])
	)('%s', (_name, { cases }) => {
		for (const [parse, body, passes] of cases) {
			if (passes) assert.equal(parse(body), body)
			else assert.throws(() => parse(body), MalformedBodyError)
		}
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
})

describe('запись', () => {
	const body = { name: '9А', memberIds: ['u1'] }

	test.each(
		[
			{
				name: 'saveGroup без id создаёт группу POST',
				reply: () => json(201, { group: { id: GROUP_ID } }),
				run: () => saveGroup({ body }),
				url: '/api/groups',
				method: 'POST',
				sent: JSON.stringify(body) as string | undefined,
				contentType: true,
			},
			{
				name: 'saveGroup с id правит группу PATCH',
				reply: () => json(200, { ok: true }),
				run: () => saveGroup({ id: GROUP_ID, body: { ...body, ownerId: null } }),
				url: `/api/groups/${GROUP_ID}`,
				method: 'PATCH',
				sent: JSON.stringify({ ...body, ownerId: null }) as string | undefined,
				contentType: false,
			},
			{
				name: 'deleteGroup удаляет группу DELETE',
				reply: () => json(200, { ok: true }),
				run: () => deleteGroup(GROUP_ID),
				url: `/api/groups/${GROUP_ID}`,
				method: 'DELETE',
				sent: undefined as string | undefined,
				contentType: false,
			},
		].map((row): [string, typeof row] => [row.name, row])
	)('%s', async (_name, { reply, run, url, method, sent, contentType }) => {
		apiFetchMock.mockResolvedValueOnce(reply())
		const outcome = await run()
		assert.equal(outcome.ok, true)
		const call = lastCall()
		assert.equal(call.url, url)
		assert.equal(call.init?.method, method)
		if (sent !== undefined) assert.equal(call.init?.body, sent)
		if (contentType) assert.equal(new Headers(call.init?.headers).get('content-type'), 'application/json')
	})
})

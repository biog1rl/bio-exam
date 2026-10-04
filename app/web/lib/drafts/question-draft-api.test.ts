import assert from 'node:assert/strict'
import { afterEach, test, vi } from 'vitest'

import { KEEPALIVE_BODY_LIMIT_BYTES } from '@/lib/tests/api'

import { questionDraftAutosaveApi } from './question-draft-api'

const URL = '/api/tests/t1/question-drafts/d1'

function stubFetch(reply: () => Promise<Response>) {
	const fetchMock = vi.fn((_url: string, _init?: RequestInit) => reply())
	vi.stubGlobal('fetch', fetchMock)
	return fetchMock
}

function respond(status: number, body?: unknown) {
	return stubFetch(async () =>
		body === undefined ? new Response(null, { status }) : new Response(JSON.stringify(body), { status })
	)
}

afterEach(() => {
	vi.unstubAllGlobals()
})

test('save шлёт PATCH черновика с payload и lockVersion и возвращает новую версию', async () => {
	const fetchMock = respond(200, { draft: { lockVersion: 4 } })
	const payload = { question: { promptText: 'a' } }
	const result = await questionDraftAutosaveApi('t1', 'd1').save(payload, 3, { keepalive: false })
	assert.deepEqual(result, { kind: 'ok', lockVersion: 4 })
	assert.equal(fetchMock.mock.calls.length, 1)
	const [url, init] = fetchMock.mock.calls[0]!
	assert.equal(url, URL)
	assert.equal(init?.method, 'PATCH')
	assert.equal(init?.credentials, 'include')
	assert.equal(new Headers(init?.headers).get('Content-Type'), 'application/json')
	assert.equal(init?.body, JSON.stringify({ payload, lockVersion: 3 }))
	assert.equal(init?.keepalive, false)
})

test('save переводит статусы ответа в исход', async () => {
	const cases: Array<[number, string]> = [
		[409, 'conflict'],
		[403, 'forbidden'],
		[404, 'gone'],
		[500, 'failed'],
		[400, 'failed'],
	]
	for (const [status, kind] of cases) {
		respond(status, { error: 'x' })
		assert.deepEqual(await questionDraftAutosaveApi('t1', 'd1').save({}, 1, { keepalive: false }), { kind })
		vi.unstubAllGlobals()
	}
})

test('save при 200 без числовой версии возвращает failed', async () => {
	respond(200, { draft: {} })
	assert.deepEqual(await questionDraftAutosaveApi('t1', 'd1').save({}, 1, { keepalive: false }), { kind: 'failed' })
})

test('save при исключении fetch возвращает failed', async () => {
	stubFetch(async () => {
		throw new TypeError('Failed to fetch')
	})
	assert.deepEqual(await questionDraftAutosaveApi('t1', 'd1').save({}, 1, { keepalive: false }), { kind: 'failed' })
})

test('save с keepalive и телом больше лимита не шлёт запрос', async () => {
	const fetchMock = respond(200, { draft: { lockVersion: 2 } })
	const payload = { question: { promptText: 'я'.repeat(31_000) } }
	assert.ok(JSON.stringify({ payload }).length < KEEPALIVE_BODY_LIMIT_BYTES)
	assert.deepEqual(await questionDraftAutosaveApi('t1', 'd1').save(payload, null, { keepalive: true }), {
		kind: 'failed',
	})
	assert.equal(fetchMock.mock.calls.length, 0)
})

test('save с keepalive и малым телом шлёт fetch с keepalive true', async () => {
	const fetchMock = respond(200, { draft: { lockVersion: 2 } })
	const result = await questionDraftAutosaveApi('t1', 'd1').save({ question: {} }, 1, { keepalive: true })
	assert.deepEqual(result, { kind: 'ok', lockVersion: 2 })
	assert.equal(fetchMock.mock.calls[0]![1]?.keepalive, true)
})

test('save без keepalive шлёт большое тело', async () => {
	const fetchMock = respond(200, { draft: { lockVersion: 2 } })
	const payload = { question: { promptText: 'я'.repeat(31_000) } }
	assert.deepEqual(await questionDraftAutosaveApi('t1', 'd1').save(payload, 1, { keepalive: false }), {
		kind: 'ok',
		lockVersion: 2,
	})
	assert.equal(fetchMock.mock.calls.length, 1)
})

test('save с lockVersion null шлёт тело без lockVersion', async () => {
	const fetchMock = respond(200, { draft: { lockVersion: 5 } })
	const payload = { question: { promptText: 'b' } }
	await questionDraftAutosaveApi('t1', 'd1').save(payload, null, { keepalive: true })
	const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body)) as Record<string, unknown>
	assert.deepEqual(body, { payload })
	assert.equal('lockVersion' in body, false)
})

test('readLockVersion читает версию черновика GET-запросом', async () => {
	const fetchMock = respond(200, { draft: { lockVersion: 7 } })
	assert.equal(await questionDraftAutosaveApi('t1', 'd1').readLockVersion(), 7)
	const [url, init] = fetchMock.mock.calls[0]!
	assert.equal(url, URL)
	assert.equal(init?.method ?? 'GET', 'GET')
})

test('readLockVersion без версии или при ошибке возвращает null', async () => {
	respond(404, { error: 'x' })
	assert.equal(await questionDraftAutosaveApi('t1', 'd1').readLockVersion(), null)
	vi.unstubAllGlobals()
	respond(200, { draft: { lockVersion: '7' } })
	assert.equal(await questionDraftAutosaveApi('t1', 'd1').readLockVersion(), null)
	vi.unstubAllGlobals()
	stubFetch(async () => {
		throw new TypeError('Failed to fetch')
	})
	assert.equal(await questionDraftAutosaveApi('t1', 'd1').readLockVersion(), null)
})

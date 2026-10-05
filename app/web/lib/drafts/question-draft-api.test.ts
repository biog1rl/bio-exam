import assert from 'node:assert/strict'
import { beforeEach, test, vi } from 'vitest'

vi.mock('@/lib/session/client', () => ({
	apiFetch: vi.fn(),
	AuthExpiredError: class AuthExpiredError extends Error {},
}))

import { apiFetch, AuthExpiredError } from '@/lib/session/client'
import { KEEPALIVE_BODY_LIMIT_BYTES } from '@/lib/tests/api'

import { questionDraftAutosaveApi } from './question-draft-api'

const URL = '/api/tests/t1/question-drafts/d1'

const apiFetchMock = vi.mocked(apiFetch)

function respond(status: number, body?: unknown) {
	apiFetchMock.mockResolvedValueOnce(
		body === undefined ? new Response(null, { status }) : new Response(JSON.stringify(body), { status })
	)
}

function call(index = 0): { url: string; init: RequestInit } {
	const entry = apiFetchMock.mock.calls[index]
	assert.ok(entry)
	return { url: entry[0], init: entry[1] ?? {} }
}

beforeEach(() => {
	apiFetchMock.mockReset()
})

test('save шлёт PATCH черновика с payload и lockVersion и возвращает новую версию', async () => {
	respond(200, { draft: { lockVersion: 4 } })
	const payload = { question: { promptText: 'a' } }
	const result = await questionDraftAutosaveApi('t1', 'd1').save(payload, 3, { keepalive: false })
	assert.deepEqual(result, { kind: 'ok', lockVersion: 4 })
	assert.equal(apiFetchMock.mock.calls.length, 1)
	const { url, init } = call()
	assert.equal(url, URL)
	assert.equal(init.method, 'PATCH')
	assert.equal(new Headers(init.headers).get('Content-Type'), 'application/json')
	assert.equal(init.body, JSON.stringify({ payload, lockVersion: 3 }))
	assert.equal(init.keepalive, false)
})

test('save переводит статусы ответа в исход', async () => {
	const cases: Array<[number, string]> = [
		[409, 'conflict'],
		[403, 'forbidden'],
		[404, 'gone'],
		[500, 'failed'],
		[400, 'failed'],
		[401, 'failed'],
	]
	for (const [status, kind] of cases) {
		respond(status, { error: 'x' })
		assert.deepEqual(await questionDraftAutosaveApi('t1', 'd1').save({}, 1, { keepalive: false }), { kind })
	}
})

test('save переводит статусы без тела в исход', async () => {
	respond(409)
	assert.deepEqual(await questionDraftAutosaveApi('t1', 'd1').save({}, 1, { keepalive: false }), {
		kind: 'conflict',
	})
})

test('save при 200 без числовой версии возвращает failed', async () => {
	respond(200, { draft: {} })
	assert.deepEqual(await questionDraftAutosaveApi('t1', 'd1').save({}, 1, { keepalive: false }), { kind: 'failed' })
	respond(200, { draft: { lockVersion: '3' } })
	assert.deepEqual(await questionDraftAutosaveApi('t1', 'd1').save({}, 1, { keepalive: false }), { kind: 'failed' })
})

test('save при некорректном теле 200 возвращает failed', async () => {
	apiFetchMock.mockResolvedValueOnce(new Response('not json', { status: 200 }))
	assert.deepEqual(await questionDraftAutosaveApi('t1', 'd1').save({}, 1, { keepalive: false }), { kind: 'failed' })
})

test('save при сетевой ошибке возвращает failed', async () => {
	apiFetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
	assert.deepEqual(await questionDraftAutosaveApi('t1', 'd1').save({}, 1, { keepalive: false }), { kind: 'failed' })
})

test('save при истёкшей сессии возвращает failed', async () => {
	apiFetchMock.mockRejectedValueOnce(new AuthExpiredError())
	assert.deepEqual(await questionDraftAutosaveApi('t1', 'd1').save({}, 1, { keepalive: true }), { kind: 'failed' })
})

test('save с keepalive и телом больше лимита не шлёт запрос', async () => {
	respond(200, { draft: { lockVersion: 2 } })
	const payload = { question: { promptText: 'я'.repeat(31_000) } }
	assert.ok(JSON.stringify({ payload }).length < KEEPALIVE_BODY_LIMIT_BYTES)
	assert.deepEqual(await questionDraftAutosaveApi('t1', 'd1').save(payload, null, { keepalive: true }), {
		kind: 'failed',
	})
	assert.equal(apiFetchMock.mock.calls.length, 0)
})

test('save с keepalive и малым телом шлёт запрос с keepalive true', async () => {
	respond(200, { draft: { lockVersion: 2 } })
	const result = await questionDraftAutosaveApi('t1', 'd1').save({ question: {} }, 1, { keepalive: true })
	assert.deepEqual(result, { kind: 'ok', lockVersion: 2 })
	assert.equal(call().init.keepalive, true)
})

test('save без keepalive шлёт большое тело', async () => {
	respond(200, { draft: { lockVersion: 2 } })
	const payload = { question: { promptText: 'я'.repeat(31_000) } }
	assert.deepEqual(await questionDraftAutosaveApi('t1', 'd1').save(payload, 1, { keepalive: false }), {
		kind: 'ok',
		lockVersion: 2,
	})
	assert.equal(apiFetchMock.mock.calls.length, 1)
	assert.equal(call().init.body, JSON.stringify({ payload, lockVersion: 1 }))
})

test('save с lockVersion null шлёт тело без lockVersion', async () => {
	respond(200, { draft: { lockVersion: 5 } })
	const payload = { question: { promptText: 'b' } }
	await questionDraftAutosaveApi('t1', 'd1').save(payload, null, { keepalive: true })
	const body = JSON.parse(String(call().init.body)) as Record<string, unknown>
	assert.deepEqual(body, { payload })
	assert.equal('lockVersion' in body, false)
})

test('readLockVersion читает версию черновика GET-запросом без кэша', async () => {
	respond(200, { draft: { lockVersion: 7 } })
	assert.equal(await questionDraftAutosaveApi('t1', 'd1').readLockVersion(), 7)
	const { url, init } = call()
	assert.equal(url, URL)
	assert.equal(init.method ?? 'GET', 'GET')
	assert.equal(init.cache, 'no-store')
})

test('readLockVersion без версии или при отказе возвращает null', async () => {
	respond(404, { error: 'x' })
	assert.equal(await questionDraftAutosaveApi('t1', 'd1').readLockVersion(), null)
	respond(500)
	assert.equal(await questionDraftAutosaveApi('t1', 'd1').readLockVersion(), null)
	respond(200, { draft: { lockVersion: '7' } })
	assert.equal(await questionDraftAutosaveApi('t1', 'd1').readLockVersion(), null)
	apiFetchMock.mockResolvedValueOnce(new Response('not json', { status: 200 }))
	assert.equal(await questionDraftAutosaveApi('t1', 'd1').readLockVersion(), null)
	apiFetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
	assert.equal(await questionDraftAutosaveApi('t1', 'd1').readLockVersion(), null)
	apiFetchMock.mockRejectedValueOnce(new AuthExpiredError())
	assert.equal(await questionDraftAutosaveApi('t1', 'd1').readLockVersion(), null)
})

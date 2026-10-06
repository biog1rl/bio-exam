import assert from 'node:assert/strict'
import { beforeEach, describe, test, vi } from 'vitest'

vi.mock('@/lib/session/client', () => ({
	apiFetch: vi.fn(),
	AuthExpiredError: class AuthExpiredError extends Error {},
}))

import { MalformedBodyError, type RequestOutcome } from '@/lib/http/request'
import { apiFetch } from '@/lib/session/client'

import {
	deleteSidebarItem,
	getAllSidebarItems,
	getSidebarItems,
	parseSidebarItems,
	reorderSidebarItems,
	saveSidebarItem,
	setSidebarItemActive,
} from './api'

const apiFetchMock = vi.mocked(apiFetch)

function json(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

beforeEach(() => {
	apiFetchMock.mockReset()
})

const ITEM_ID = '44444444-4444-4444-8444-444444444444'

const ITEM = {
	id: ITEM_ID,
	title: 'Проекты',
	url: '/projects',
	icon: 'Folder',
	target: '_self',
	order: 0,
	isActive: true,
}

function lastCall(): { url: string; init: RequestInit | undefined } {
	const call = apiFetchMock.mock.calls.at(-1)
	assert.ok(call)
	return { url: call[0], init: call[1] }
}

function assertJsonCall(method: string, url: string, body: unknown) {
	const call = lastCall()
	assert.equal(call.url, url)
	assert.equal(call.init?.method, method)
	assert.equal(call.init?.body, JSON.stringify(body))
	assert.equal(new Headers(call.init?.headers).get('content-type'), 'application/json')
}

describe('parseSidebarItems', () => {
	test('конверт { items } — массив пунктов', () => {
		const items = [ITEM]
		assert.equal(parseSidebarItems({ items }), items)
		assert.deepEqual(parseSidebarItems({ items: [] }), [])
	})

	test('конверт не той формы — MalformedBodyError', () => {
		for (const body of [null, undefined, [], 'items', {}, { items: null }, { items: {} }, { error: 'Failed' }]) {
			assert.throws(() => parseSidebarItems(body), MalformedBodyError)
		}
	})
})

describe('чтение пунктов меню', () => {
	const hidden = { ...ITEM, id: 'hidden', isActive: false }

	test.each(
		[
			{
				name: 'getSidebarItems: GET /api/sidebar — массив пунктов',
				items: [ITEM],
				run: () => getSidebarItems(),
				url: '/api/sidebar',
				signal: undefined as AbortSignal | undefined,
			},
			{
				name: 'getSidebarItems: передаёт signal для отмены при размонтировании',
				items: [] as (typeof ITEM)[],
				run: (signal?: AbortSignal) => getSidebarItems(signal),
				url: '/api/sidebar',
				signal: new AbortController().signal as AbortSignal | undefined,
			},
			{
				name: 'getAllSidebarItems: GET /api/sidebar/all — массив пунктов',
				items: [ITEM, hidden],
				run: () => getAllSidebarItems(),
				url: '/api/sidebar/all',
				signal: undefined as AbortSignal | undefined,
			},
		].map((row): [string, typeof row] => [row.name, row])
	)('%s', async (_name, { items, run, url, signal }) => {
		apiFetchMock.mockResolvedValueOnce(json(200, { items }))
		const outcome = await run(signal)
		assert.deepEqual(outcome, { ok: true, status: 200, data: items })
		assert.equal(lastCall().url, url)
		assert.equal(lastCall().init?.method, 'GET')
		if (signal) assert.equal(lastCall().init?.signal, signal)
	})
})

describe('запись пунктов меню', () => {
	const input = { title: 'Проекты', url: '/projects', icon: 'Folder', target: '_blank' as const }
	const ORDER = [
		{ id: ITEM_ID, order: 0 },
		{ id: 'b', order: 1 },
	]

	test.each(
		(
			[
				{
					name: 'saveSidebarItem без id — POST /api/sidebar с порядком',
					reply: { item: ITEM },
					run: () => saveSidebarItem(null, { ...input, order: 3 }),
					method: 'POST',
					url: '/api/sidebar',
					body: { ...input, order: 3 },
				},
				{
					name: 'saveSidebarItem с id — PUT /api/sidebar/<id>',
					reply: { item: ITEM },
					run: () => saveSidebarItem(ITEM_ID, input),
					method: 'PUT',
					url: `/api/sidebar/${ITEM_ID}`,
					body: input,
				},
				{
					name: 'setSidebarItemActive — PUT /api/sidebar/<id> с isActive',
					reply: { item: ITEM },
					run: () => setSidebarItemActive(ITEM_ID, false),
					method: 'PUT',
					url: `/api/sidebar/${ITEM_ID}`,
					body: { isActive: false },
				},
				{
					name: 'reorderSidebarItems — PATCH /api/sidebar/reorder с { items }',
					reply: { items: [ITEM] },
					run: () => reorderSidebarItems(ORDER),
					method: 'PATCH',
					url: '/api/sidebar/reorder',
					body: { items: ORDER },
				},
				{
					name: 'deleteSidebarItem — DELETE /api/sidebar/<id> без тела',
					reply: { success: true },
					run: () => deleteSidebarItem(ITEM_ID),
					method: 'DELETE',
					url: `/api/sidebar/${ITEM_ID}`,
				},
			] as {
				name: string
				reply: unknown
				run: () => Promise<{ ok: boolean }>
				method: string
				url: string
				body?: unknown
			}[]
		).map(
			(
				row
			): [
				string,
				{
					name: string
					reply: unknown
					run: () => Promise<{ ok: boolean }>
					method: string
					url: string
					body?: unknown
				},
			] => [row.name, row]
		)
	)('%s', async (_name, { reply, run, method, url, body }) => {
		apiFetchMock.mockResolvedValueOnce(json(200, reply))
		assert.equal((await run()).ok, true)
		if (body === undefined) {
			const call = lastCall()
			assert.equal(call.url, url)
			assert.equal(call.init?.method, method)
			assert.equal(call.init?.body, undefined)
		} else {
			assertJsonCall(method, url, body)
		}
	})

	test.each(
		(
			[
				{
					name: 'saveSidebarItem: 400 с английским текстом — «Ошибка сохранения»',
					status: 400,
					error: 'title, url and icon are required',
					run: () => saveSidebarItem(null, { ...input, order: 0 }),
					message: 'Ошибка сохранения',
				},
				{
					name: 'setSidebarItemActive: 404 — «Ошибка изменения видимости»',
					status: 404,
					error: 'Sidebar item not found',
					run: () => setSidebarItemActive(ITEM_ID, true),
					message: 'Ошибка изменения видимости',
				},
				{
					name: 'reorderSidebarItems: 500 — «Ошибка обновления порядка»',
					status: 500,
					error: 'Failed to reorder sidebar items',
					run: () => reorderSidebarItems([]),
					message: 'Ошибка обновления порядка',
				},
				{
					name: 'deleteSidebarItem: 404 — «Ошибка удаления»',
					status: 404,
					error: 'Sidebar item not found',
					run: () => deleteSidebarItem(ITEM_ID),
					message: 'Ошибка удаления',
				},
			] as {
				name: string
				status: number
				error: string
				run: () => Promise<RequestOutcome<unknown>>
				message: string
			}[]
		).map(
			(
				row
			): [
				string,
				{
					name: string
					status: number
					error: string
					run: () => Promise<RequestOutcome<unknown>>
					message: string
				},
			] => [row.name, row]
		)
	)('%s', async (_name, { status, error, run, message }) => {
		apiFetchMock.mockResolvedValueOnce(json(status, { error }))
		const outcome = await run()
		assert.equal(outcome.ok, false)
		if (outcome.ok) return
		assert.equal(outcome.message, message)
	})

	test('id пункта кодируется в пути', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, { success: true }))
		await deleteSidebarItem('a/b')
		assert.equal(lastCall().url, '/api/sidebar/a%2Fb')
	})
})

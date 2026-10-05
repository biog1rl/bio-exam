import assert from 'node:assert/strict'
import { beforeEach, describe, test, vi } from 'vitest'

vi.mock('@/lib/session/client', () => ({
	apiFetch: vi.fn(),
	AuthExpiredError: class AuthExpiredError extends Error {},
}))

import { MalformedBodyError } from '@/lib/http/request'
import { apiFetch } from '@/lib/session/client'

import {
	chartRangeFetcher,
	deleteSidebarItem,
	getAllSidebarItems,
	getChartRange,
	getSidebarItems,
	parseChartRange,
	parseSidebarItems,
	reorderSidebarItems,
	saveChartRange,
	saveSidebarItem,
	setSidebarItemActive,
	settingsKeys,
} from './api'

const apiFetchMock = vi.mocked(apiFetch)

function json(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

beforeEach(() => {
	apiFetchMock.mockReset()
})

describe('settingsKeys', () => {
	test('ключ диапазона графика — строка URL', () => {
		assert.equal(settingsKeys.chartRange(), '/api/settings/chart-default-range')
	})

	test('пункты меню — публичный /api/sidebar и полный /api/sidebar/all', () => {
		assert.equal(settingsKeys.sidebar(), '/api/sidebar')
		assert.equal(settingsKeys.sidebarAll(), '/api/sidebar/all')
	})
})

describe('parseChartRange', () => {
	test('принимает week, month и all', () => {
		for (const value of ['week', 'month', 'all']) {
			assert.deepEqual(parseChartRange({ value }), { value })
		}
	})

	test('прочее — MalformedBodyError', () => {
		for (const body of [null, undefined, 'week', {}, { value: 'year' }, { value: 1 }, { error: 'Forbidden' }]) {
			assert.throws(() => parseChartRange(body), MalformedBodyError)
		}
	})
})

describe('getChartRange', () => {
	test('200 с допустимым значением — ok', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, { value: 'all' }))
		assert.deepEqual(await getChartRange(), { ok: true, status: 200, data: { value: 'all' } })
		assert.equal(apiFetchMock.mock.calls[0]?.[0], '/api/settings/chart-default-range')
	})

	test('200 с чужой формой — malformed', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, { value: 'year' }))
		const outcome = await getChartRange()
		assert.equal(outcome.ok, false)
		if (outcome.ok) return
		assert.equal(outcome.kind, 'malformed')
	})
})

describe('chartRangeFetcher', () => {
	test('возвращает разобранное значение по строковому ключу', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, { value: 'week' }))
		assert.deepEqual(await chartRangeFetcher(settingsKeys.chartRange()), { value: 'week' })
	})
})

describe('saveChartRange', () => {
	test('PUT с JSON-телом и разобранным ответом', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, { value: 'month' }))
		const outcome = await saveChartRange('month')
		assert.deepEqual(outcome, { ok: true, status: 200, data: { value: 'month' } })
		const [url, init] = apiFetchMock.mock.calls[0] ?? []
		assert.equal(url, '/api/settings/chart-default-range')
		assert.equal(init?.method, 'PUT')
		assert.equal(init?.body, JSON.stringify({ value: 'month' }))
		assert.equal(new Headers(init?.headers).get('content-type'), 'application/json')
	})

	test('400 с английским текстом — запасной текст «Ошибка сохранения»', async () => {
		apiFetchMock.mockResolvedValueOnce(json(400, { error: 'Bad request' }))
		const outcome = await saveChartRange('week')
		assert.equal(outcome.ok, false)
		if (outcome.ok) return
		assert.equal(outcome.kind, 'http')
		assert.equal(outcome.message, 'Ошибка сохранения')
	})
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

describe('getSidebarItems', () => {
	test('GET /api/sidebar — массив пунктов', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, { items: [ITEM] }))
		const outcome = await getSidebarItems()
		assert.deepEqual(outcome, { ok: true, status: 200, data: [ITEM] })
		assert.equal(lastCall().url, '/api/sidebar')
		assert.equal(lastCall().init?.method, 'GET')
	})

	test('передаёт signal для отмены при размонтировании', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, { items: [] }))
		const controller = new AbortController()
		await getSidebarItems(controller.signal)
		assert.equal(lastCall().init?.signal, controller.signal)
	})

	test('конверт не той формы — malformed', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, { error: 'Failed to fetch sidebar items' }))
		const outcome = await getSidebarItems()
		assert.equal(outcome.ok, false)
		if (outcome.ok) return
		assert.equal(outcome.kind, 'malformed')
	})

	test('500 — отказ http без английского текста сервера', async () => {
		apiFetchMock.mockResolvedValueOnce(json(500, { error: 'Failed to fetch sidebar items' }))
		const outcome = await getSidebarItems()
		assert.equal(outcome.ok, false)
		if (outcome.ok) return
		assert.equal(outcome.kind, 'http')
		assert.equal(outcome.status, 500)
		assert.equal(outcome.message, 'Ошибка сервера (код 500).')
	})
})

describe('getAllSidebarItems', () => {
	test('GET /api/sidebar/all — массив пунктов', async () => {
		const hidden = { ...ITEM, id: 'hidden', isActive: false }
		apiFetchMock.mockResolvedValueOnce(json(200, { items: [ITEM, hidden] }))
		const outcome = await getAllSidebarItems()
		assert.deepEqual(outcome, { ok: true, status: 200, data: [ITEM, hidden] })
		assert.equal(lastCall().url, '/api/sidebar/all')
		assert.equal(lastCall().init?.method, 'GET')
	})

	test('конверт не той формы — malformed', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, {}))
		const outcome = await getAllSidebarItems()
		assert.equal(outcome.ok, false)
		if (outcome.ok) return
		assert.equal(outcome.kind, 'malformed')
	})

	test('403 — отказ http со статусом', async () => {
		apiFetchMock.mockResolvedValueOnce(json(403, { error: 'Forbidden' }))
		const outcome = await getAllSidebarItems()
		assert.equal(outcome.ok, false)
		if (outcome.ok) return
		assert.equal(outcome.kind, 'http')
		assert.equal(outcome.status, 403)
	})
})

describe('запись пунктов меню', () => {
	const input = { title: 'Проекты', url: '/projects', icon: 'Folder', target: '_blank' as const }

	test('saveSidebarItem без id — POST /api/sidebar с порядком', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, { item: ITEM }))
		const outcome = await saveSidebarItem(null, { ...input, order: 3 })
		assert.equal(outcome.ok, true)
		assertJsonCall('POST', '/api/sidebar', { ...input, order: 3 })
	})

	test('saveSidebarItem с id — PUT /api/sidebar/<id>', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, { item: ITEM }))
		const outcome = await saveSidebarItem(ITEM_ID, input)
		assert.equal(outcome.ok, true)
		assertJsonCall('PUT', `/api/sidebar/${ITEM_ID}`, input)
	})

	test('saveSidebarItem: 400 с английским текстом — «Ошибка сохранения»', async () => {
		apiFetchMock.mockResolvedValueOnce(json(400, { error: 'title, url and icon are required' }))
		const outcome = await saveSidebarItem(null, { ...input, order: 0 })
		assert.equal(outcome.ok, false)
		if (outcome.ok) return
		assert.equal(outcome.message, 'Ошибка сохранения')
	})

	test('setSidebarItemActive — PUT /api/sidebar/<id> с isActive', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, { item: ITEM }))
		await setSidebarItemActive(ITEM_ID, false)
		assertJsonCall('PUT', `/api/sidebar/${ITEM_ID}`, { isActive: false })
	})

	test('setSidebarItemActive: 404 — «Ошибка изменения видимости»', async () => {
		apiFetchMock.mockResolvedValueOnce(json(404, { error: 'Sidebar item not found' }))
		const outcome = await setSidebarItemActive(ITEM_ID, true)
		assert.equal(outcome.ok, false)
		if (outcome.ok) return
		assert.equal(outcome.message, 'Ошибка изменения видимости')
	})

	test('reorderSidebarItems — PATCH /api/sidebar/reorder с { items }', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, { items: [ITEM] }))
		const order = [
			{ id: ITEM_ID, order: 0 },
			{ id: 'b', order: 1 },
		]
		await reorderSidebarItems(order)
		assertJsonCall('PATCH', '/api/sidebar/reorder', { items: order })
	})

	test('reorderSidebarItems: 500 — «Ошибка обновления порядка»', async () => {
		apiFetchMock.mockResolvedValueOnce(json(500, { error: 'Failed to reorder sidebar items' }))
		const outcome = await reorderSidebarItems([])
		assert.equal(outcome.ok, false)
		if (outcome.ok) return
		assert.equal(outcome.message, 'Ошибка обновления порядка')
	})

	test('deleteSidebarItem — DELETE /api/sidebar/<id> без тела', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, { success: true }))
		const outcome = await deleteSidebarItem(ITEM_ID)
		assert.equal(outcome.ok, true)
		const call = lastCall()
		assert.equal(call.url, `/api/sidebar/${ITEM_ID}`)
		assert.equal(call.init?.method, 'DELETE')
		assert.equal(call.init?.body, undefined)
	})

	test('deleteSidebarItem: 404 — «Ошибка удаления»', async () => {
		apiFetchMock.mockResolvedValueOnce(json(404, { error: 'Sidebar item not found' }))
		const outcome = await deleteSidebarItem(ITEM_ID)
		assert.equal(outcome.ok, false)
		if (outcome.ok) return
		assert.equal(outcome.message, 'Ошибка удаления')
	})

	test('id пункта кодируется в пути', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, { success: true }))
		await deleteSidebarItem('a/b')
		assert.equal(lastCall().url, '/api/sidebar/a%2Fb')
	})
})

import assert from 'node:assert/strict'
import { beforeEach, describe, test, vi } from 'vitest'

vi.mock('@/lib/session/client', () => ({
	apiFetch: vi.fn(),
	AuthExpiredError: class AuthExpiredError extends Error {},
}))

import { MalformedBodyError } from '@/lib/http/request'
import { apiFetch } from '@/lib/session/client'

import { chartRangeFetcher, getChartRange, parseChartRange, saveChartRange, settingsKeys } from './api'

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

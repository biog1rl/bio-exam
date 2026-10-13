import assert from 'node:assert/strict'
import { describe, test } from 'vitest'

import { createSessionClient, type RefreshOutcome } from './client'
import {
	createRefreshCoordinator,
	REFRESH_LOCK_TIMEOUT_MS,
	SESSION_REFRESH_LOCK,
	SESSION_REFRESH_RECORD_KEY,
	type RefreshCoordinator,
	type RefreshLocks,
	type RefreshRecord,
} from './refresh-coordinator'
import type { SessionTransport } from './transport'

const EXPIRES = '2026-10-06T12:15:00.000Z'

function memoryStorage(failing: 'none' | 'read' | 'write' = 'none') {
	const items = new Map<string, string>()
	return {
		items,
		getItem(key: string) {
			if (failing === 'read') throw new Error('storage read')
			return items.get(key) ?? null
		},
		setItem(key: string, value: string) {
			if (failing === 'write') throw new Error('storage write')
			items.set(key, value)
		},
		removeItem(key: string) {
			items.delete(key)
		},
	}
}

function queuedLocks() {
	const names: string[] = []
	let tail: Promise<unknown> = Promise.resolve()
	const locks: RefreshLocks = {
		request(name, options, callback) {
			names.push(name)
			if (options.signal?.aborted) return Promise.reject(options.signal.reason)
			const run = tail.then(() => callback())
			tail = run.catch(() => undefined)
			return run
		},
	}
	return { locks, names }
}

function abortedSignal(): AbortSignal {
	const controller = new AbortController()
	controller.abort(new DOMException('timeout', 'TimeoutError'))
	return controller.signal
}

function liveSignal(): AbortSignal {
	return new AbortController().signal
}

type Storage = ReturnType<typeof memoryStorage>

function record(storage: Storage): RefreshRecord | null {
	const raw = storage.items.get(SESSION_REFRESH_RECORD_KEY)
	return raw === undefined ? null : (JSON.parse(raw) as RefreshRecord)
}

function tab(
	storage: Storage | null,
	locks: RefreshLocks | null,
	options: { timeout?: 'live' | 'aborted'; timeouts?: number[] } = {}
): RefreshCoordinator {
	return createRefreshCoordinator({
		locks,
		storage,
		now: () => 1_000,
		timeoutSignal: (ms) => {
			options.timeouts?.push(ms)
			return options.timeout === 'aborted' ? abortedSignal() : liveSignal()
		},
	})
}

function performer(outcomes: RefreshOutcome[]) {
	const calls = { count: 0 }
	const perform = async (): Promise<RefreshOutcome> => {
		calls.count += 1
		await Promise.resolve()
		return outcomes.shift() ?? { kind: 'ok', accessExpiresAt: EXPIRES }
	}
	return { perform, calls }
}

type Case = {
	name: string
	run: () => Promise<{ performed: number; outcomes: RefreshOutcome[]; seq: number | null }>
	expected: { performed: number; outcomes: RefreshOutcome[]; seq: number | null }
}

const cases: Case[] = [
	{
		name: 'две вкладки одновременно: один refresh, обе получают ok с тем же сроком',
		run: async () => {
			const storage = memoryStorage()
			const { locks } = queuedLocks()
			const { perform, calls } = performer([])
			const outcomes = await Promise.all([
				tab(storage, locks).coordinate(perform),
				tab(storage, locks).coordinate(perform),
			])
			return { performed: calls.count, outcomes, seq: record(storage)?.seq ?? null }
		},
		expected: {
			performed: 1,
			outcomes: [
				{ kind: 'ok', accessExpiresAt: EXPIRES },
				{ kind: 'ok', accessExpiresAt: EXPIRES },
			],
			seq: 1,
		},
	},
	{
		name: 'без Web Locks: refresh на каждый вызов, запись не пишется',
		run: async () => {
			const storage = memoryStorage()
			const { perform, calls } = performer([])
			const outcomes = await Promise.all([
				tab(storage, null).coordinate(perform),
				tab(storage, null).coordinate(perform),
			])
			return { performed: calls.count, outcomes, seq: record(storage)?.seq ?? null }
		},
		expected: {
			performed: 2,
			outcomes: [
				{ kind: 'ok', accessExpiresAt: EXPIRES },
				{ kind: 'ok', accessExpiresAt: EXPIRES },
			],
			seq: null,
		},
	},
	{
		name: 'rejected не меняет запись, следующий держатель замка обновляет сам',
		run: async () => {
			const storage = memoryStorage()
			const { locks } = queuedLocks()
			const { perform, calls } = performer([{ kind: 'rejected' }])
			const outcomes = await Promise.all([
				tab(storage, locks).coordinate(perform),
				tab(storage, locks).coordinate(perform),
			])
			return { performed: calls.count, outcomes, seq: record(storage)?.seq ?? null }
		},
		expected: {
			performed: 2,
			outcomes: [{ kind: 'rejected' }, { kind: 'ok', accessExpiresAt: EXPIRES }],
			seq: 1,
		},
	},
	{
		name: 'соседка обновила раньше, чем вкладка решила обновлять: refresh идёт',
		run: async () => {
			const storage = memoryStorage()
			const { locks } = queuedLocks()
			storage.items.set(
				SESSION_REFRESH_RECORD_KEY,
				JSON.stringify({ seq: 4, accessExpiresAt: '2026-10-06T12:00:00.000Z', refreshedAt: 500 })
			)
			const { perform, calls } = performer([])
			const outcomes = [await tab(storage, locks).coordinate(perform)]
			return { performed: calls.count, outcomes, seq: record(storage)?.seq ?? null }
		},
		expected: { performed: 1, outcomes: [{ kind: 'ok', accessExpiresAt: EXPIRES }], seq: 5 },
	},
	{
		name: 'запрос ушёл до обновления соседки: refresh не идёт, срок из записи',
		run: async () => {
			const storage = memoryStorage()
			const { locks } = queuedLocks()
			storage.items.set(
				SESSION_REFRESH_RECORD_KEY,
				JSON.stringify({ seq: 2, accessExpiresAt: EXPIRES, refreshedAt: 900 })
			)
			const { perform, calls } = performer([])
			const outcomes = [await tab(storage, locks).coordinate(perform, 1)]
			return { performed: calls.count, outcomes, seq: record(storage)?.seq ?? null }
		},
		expected: { performed: 0, outcomes: [{ kind: 'ok', accessExpiresAt: EXPIRES }], seq: 2 },
	},
	{
		name: 'ожидание замка дольше предела: unavailable без refresh',
		run: async () => {
			const storage = memoryStorage()
			const { locks } = queuedLocks()
			const timeouts: number[] = []
			const { perform, calls } = performer([])
			const outcomes = [await tab(storage, locks, { timeout: 'aborted', timeouts }).coordinate(perform)]
			assert.deepEqual(timeouts, [REFRESH_LOCK_TIMEOUT_MS])
			return { performed: calls.count, outcomes, seq: record(storage)?.seq ?? null }
		},
		expected: { performed: 0, outcomes: [{ kind: 'unavailable' }], seq: null },
	},
	{
		name: 'хранилище бросает на чтении: refresh идёт, ошибка не всплывает',
		run: async () => {
			const storage = memoryStorage('read')
			const { locks } = queuedLocks()
			const { perform, calls } = performer([])
			const outcomes = [await tab(storage, locks).coordinate(perform)]
			return { performed: calls.count, outcomes, seq: record(storage)?.seq ?? null }
		},
		expected: { performed: 1, outcomes: [{ kind: 'ok', accessExpiresAt: EXPIRES }], seq: 1 },
	},
	{
		name: 'хранилище бросает на записи: refresh идёт, ошибка не всплывает',
		run: async () => {
			const storage = memoryStorage('write')
			const { locks } = queuedLocks()
			const { perform, calls } = performer([])
			const outcomes = [await tab(storage, locks).coordinate(perform)]
			return { performed: calls.count, outcomes, seq: record(storage)?.seq ?? null }
		},
		expected: { performed: 1, outcomes: [{ kind: 'ok', accessExpiresAt: EXPIRES }], seq: null },
	},
	{
		name: 'замок недоступен по другой причине: refresh идёт без замка',
		run: async () => {
			const storage = memoryStorage()
			const locks: RefreshLocks = { request: () => Promise.reject(new Error('locks broken')) }
			const { perform, calls } = performer([])
			const outcomes = [await tab(storage, locks).coordinate(perform)]
			return { performed: calls.count, outcomes, seq: record(storage)?.seq ?? null }
		},
		expected: { performed: 1, outcomes: [{ kind: 'ok', accessExpiresAt: EXPIRES }], seq: null },
	},
	{
		name: 'clear() удаляет запись',
		run: async () => {
			const storage = memoryStorage()
			const { locks } = queuedLocks()
			const coordinator = tab(storage, locks)
			const { perform, calls } = performer([])
			const outcomes = [await coordinator.coordinate(perform)]
			coordinator.clear()
			return { performed: calls.count, outcomes, seq: record(storage)?.seq ?? null }
		},
		expected: { performed: 1, outcomes: [{ kind: 'ok', accessExpiresAt: EXPIRES }], seq: null },
	},
]

describe('createRefreshCoordinator', () => {
	test.each(cases)('$name', async ({ run, expected }) => {
		assert.deepEqual(await run(), expected)
	})

	test('замок и запись называются bio-exam:session-refresh, запись без токенов', async () => {
		const storage = memoryStorage()
		const { locks, names } = queuedLocks()
		await tab(storage, locks).coordinate(performer([]).perform)
		assert.deepEqual(names, [SESSION_REFRESH_LOCK])
		assert.equal(SESSION_REFRESH_LOCK, 'bio-exam:session-refresh')
		assert.deepEqual(Object.keys(record(storage) ?? {}).sort(), ['accessExpiresAt', 'refreshedAt', 'seq'])
	})
})

function sessionTabs(count: number) {
	const storage = memoryStorage()
	const { locks, names } = queuedLocks()
	const server = { refresh: 0, fresh: false }
	const transport: SessionTransport = {
		me: async () => new Response(null, { status: 200 }),
		refresh: async () => {
			server.refresh += 1
			await Promise.resolve()
			server.fresh = true
			return new Response(JSON.stringify({ ok: true, accessExpiresAt: EXPIRES }), { status: 200 })
		},
		logout: async () => new Response(null, { status: 200 }),
		request: async () => new Response(null, { status: server.fresh ? 200 : 401 }),
	}
	const clients = Array.from({ length: count }, () =>
		createSessionClient({
			transport,
			navigate: () => undefined,
			currentPath: () => '/dashboard',
			coordinator: tab(storage, locks),
		})
	)
	return { clients, names, server }
}

describe('createSessionClient с координатором', () => {
	test('параллельные refreshOnce одной вкладки дают один coordinate', async () => {
		const { clients, names, server } = sessionTabs(1)
		const outcomes = await Promise.all([
			clients[0]!.refreshOnce(),
			clients[0]!.refreshOnce(),
			clients[0]!.refreshOnce(),
		])
		assert.deepEqual(
			outcomes.map((outcome) => outcome.kind),
			['ok', 'ok', 'ok']
		)
		assert.deepEqual({ locks: names.length, refresh: server.refresh }, { locks: 1, refresh: 1 })
	})

	test('две вкладки с 401 на одновременные запросы дают один refresh и обе получают данные', async () => {
		const { clients, server } = sessionTabs(2)
		const responses = await Promise.all(clients.map((client) => client.fetchWithSession('/api/notifications')))
		assert.deepEqual(
			responses.map((response) => response.status),
			[200, 200]
		)
		assert.equal(server.refresh, 1)
	})
})

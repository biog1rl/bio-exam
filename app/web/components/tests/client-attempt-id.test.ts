import { describe, expect, test } from 'vitest'

import {
	clientAttemptIdKey,
	forgetClientAttemptId,
	resolveClientAttemptId,
	type ClientAttemptStorage,
} from './client-attempt-id'

function memoryStorage(initial: Record<string, string> = {}): ClientAttemptStorage & { data: Map<string, string> } {
	const data = new Map(Object.entries(initial))
	return {
		data,
		getItem: (key) => data.get(key) ?? null,
		setItem: (key, value) => {
			data.set(key, value)
		},
		removeItem: (key) => {
			data.delete(key)
		},
	}
}

function sequentialIds(): () => string {
	let counter = 0
	return () => {
		counter += 1
		return `client-${counter}`
	}
}

const KEY = clientAttemptIdKey('test-1', 'user-1')

describe('clientAttemptIdKey', () => {
	test('ключ строится из теста и пользователя', () => {
		expect(KEY).toBe('test-client-attempt-test-1-user-1')
	})
})

describe('resolveClientAttemptId', () => {
	test('та же сессия получает тот же id при повторных вызовах', () => {
		const storage = memoryStorage()
		const createId = sequentialIds()
		const first = resolveClientAttemptId(storage, KEY, 'session-1', createId)
		const second = resolveClientAttemptId(storage, KEY, 'session-1', createId)
		const third = resolveClientAttemptId(storage, KEY, 'session-1', createId)
		expect(first).toBe('client-1')
		expect(second).toBe(first)
		expect(third).toBe(first)
		expect(JSON.parse(storage.data.get(KEY) ?? 'null')).toEqual({ sessionId: 'session-1', clientAttemptId: 'client-1' })
	})

	test('другая сессия получает новый id и перезаписывает запись', () => {
		const storage = memoryStorage()
		const createId = sequentialIds()
		const first = resolveClientAttemptId(storage, KEY, 'session-1', createId)
		const next = resolveClientAttemptId(storage, KEY, 'session-2', createId)
		expect(next).not.toBe(first)
		expect(JSON.parse(storage.data.get(KEY) ?? 'null')).toEqual({ sessionId: 'session-2', clientAttemptId: next })
		expect(resolveClientAttemptId(storage, KEY, 'session-2', createId)).toBe(next)
	})

	test('битый JSON даёт новый id', () => {
		const storage = memoryStorage({ [KEY]: '{not json' })
		const id = resolveClientAttemptId(storage, KEY, 'session-1', sequentialIds())
		expect(id).toBe('client-1')
		expect(JSON.parse(storage.data.get(KEY) ?? 'null')).toEqual({ sessionId: 'session-1', clientAttemptId: 'client-1' })
	})

	test('запись без clientAttemptId даёт новый id', () => {
		const storage = memoryStorage({ [KEY]: JSON.stringify({ sessionId: 'session-1' }) })
		expect(resolveClientAttemptId(storage, KEY, 'session-1', sequentialIds())).toBe('client-1')
	})

	test('после forget та же сессия получает новый id', () => {
		const storage = memoryStorage()
		const createId = sequentialIds()
		const first = resolveClientAttemptId(storage, KEY, 'session-1', createId)
		forgetClientAttemptId(storage, KEY)
		expect(storage.data.has(KEY)).toBe(false)
		const next = resolveClientAttemptId(storage, KEY, 'session-1', createId)
		expect(next).not.toBe(first)
	})

	test('по умолчанию id — uuid', () => {
		const id = resolveClientAttemptId(memoryStorage(), KEY, 'session-1')
		expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
	})
})

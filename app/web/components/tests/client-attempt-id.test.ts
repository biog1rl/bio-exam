import { describe, expect, test } from 'vitest'

import {
	clientAttemptIdKey,
	resolveClientAttemptId,
	storedClientAttemptId,
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

	test.each(
		[
			{ name: 'битый JSON даёт новый id', raw: '{not json' },
			{ name: 'запись без clientAttemptId даёт новый id', raw: JSON.stringify({ sessionId: 'session-1' }) },
		].map((row): [string, typeof row] => [row.name, row])
	)('%s', (_name, { raw }) => {
		const storage = memoryStorage({ [KEY]: raw })
		expect(resolveClientAttemptId(storage, KEY, 'session-1', sequentialIds())).toBe('client-1')
		expect(JSON.parse(storage.data.get(KEY) ?? 'null')).toEqual({ sessionId: 'session-1', clientAttemptId: 'client-1' })
	})
})

describe('storedClientAttemptId', () => {
	test('пара другой сессии даёт null и не меняет хранилище', () => {
		const raw = JSON.stringify({ sessionId: 'session-1', clientAttemptId: 'client-7' })
		const storage = memoryStorage({ [KEY]: raw })
		expect(storedClientAttemptId(storage, KEY, 'session-2')).toBeNull()
		expect(storage.data.get(KEY)).toBe(raw)
	})

	test('битая запись и запись без clientAttemptId дают null', () => {
		const broken = memoryStorage({ [KEY]: '{not json' })
		expect(storedClientAttemptId(broken, KEY, 'session-1')).toBeNull()
		expect(broken.data.get(KEY)).toBe('{not json')
		const partial = memoryStorage({ [KEY]: JSON.stringify({ sessionId: 'session-1' }) })
		expect(storedClientAttemptId(partial, KEY, 'session-1')).toBeNull()
	})
})

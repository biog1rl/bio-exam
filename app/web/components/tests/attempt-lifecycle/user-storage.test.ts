import assert from 'node:assert/strict'
import { test } from 'vitest'

import { attemptStorageKeys } from './storage-keys'
import { clearUserAttemptStorage, type EnumerableStorage } from './user-storage'

const STORED = [
	'test-session-t1-u1',
	'test-answers-wal-t1-u1',
	'test-frozen-t1-u1',
	'test-client-attempt-t1-u1',
	'test-unsent-t1-u1',
	'test-session-t1-u2',
	'test-answers-wal-t1-u12',
	'question-draft-wal-d1-u1',
	'logout',
	'lastAuthUpdate',
]

function enumerableStorage(keys: string[]) {
	const map = new Map(keys.map((key) => [key, '{}']))
	const storage: EnumerableStorage = {
		get length() {
			return map.size
		},
		key: (index) => [...map.keys()][index] ?? null,
		removeItem: (key) => {
			map.delete(key)
		},
	}
	return { map, storage }
}

test.each([
	['test-session-t1-u1', false],
	['test-answers-wal-t1-u1', false],
	['test-frozen-t1-u1', false],
	['test-client-attempt-t1-u1', false],
	['test-unsent-t1-u1', false],
	['test-session-t1-u2', true],
	['test-answers-wal-t1-u12', true],
	['question-draft-wal-d1-u1', true],
	['logout', true],
	['lastAuthUpdate', true],
])('clearUserAttemptStorage(u1): %s остаётся — %s', (key, kept) => {
	const { map, storage } = enumerableStorage(STORED)
	clearUserAttemptStorage(storage, 'u1')
	assert.equal(map.has(key), kept)
})

test('хранилище, бросающее на key(), не роняет очистку', () => {
	const storage: EnumerableStorage = {
		length: 2,
		key: () => {
			throw new Error('denied')
		},
		removeItem: () => undefined,
	}
	assert.doesNotThrow(() => clearUserAttemptStorage(storage, 'u1'))
})

test('attemptStorageKeys строит прежние ключи от констант префиксов', () => {
	assert.deepEqual(attemptStorageKeys('t1', 'u1'), {
		session: 'test-session-t1-u1',
		wal: 'test-answers-wal-t1-u1',
		frozen: 'test-frozen-t1-u1',
		clientAttemptId: 'test-client-attempt-t1-u1',
		unsent: 'test-unsent-t1-u1',
	})
})

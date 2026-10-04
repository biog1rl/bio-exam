import assert from 'node:assert/strict'
import { test } from 'vitest'

import {
	forgetQuestionDraftCopies,
	questionDraftCopyKey,
	readQuestionDraftCopy,
	removeQuestionDraftCopy,
	resolveInitialDraftPayload,
	writeQuestionDraftCopy,
} from './question-draft-copy'

function memoryStorage(initial: Record<string, string> = {}) {
	const map = new Map<string, string>(Object.entries(initial))
	return {
		map,
		storage: {
			get length() {
				return map.size
			},
			key: (index: number) => [...map.keys()][index] ?? null,
			getItem: (key: string) => map.get(key) ?? null,
			setItem: (key: string, value: string) => {
				map.set(key, value)
			},
			removeItem: (key: string) => {
				map.delete(key)
			},
		},
	}
}

const SERVER = { question: { a: 2, b: 1 } }
const COPY = { question: { a: 3 } }

test('questionDraftCopyKey', () => {
	assert.equal(questionDraftCopyKey('d1', 'u1'), 'question-draft-wal-d1-u1')
})

test('readQuestionDraftCopy: битый JSON, форма без v: 1, без payload или baseLockVersion → null', () => {
	const { storage } = memoryStorage({
		broken: '{',
		v2: JSON.stringify({ v: 2, payload: COPY, baseLockVersion: 1 }),
		nopayload: JSON.stringify({ v: 1, baseLockVersion: 1 }),
		nolock: JSON.stringify({ v: 1, payload: COPY }),
		nul: 'null',
	})
	for (const key of ['broken', 'v2', 'nopayload', 'nolock', 'nul', 'missing']) {
		assert.equal(readQuestionDraftCopy(storage, key), null, key)
	}
})

test('readQuestionDraftCopy: годная копия и пометка forbidden', () => {
	const { storage } = memoryStorage({
		ok: JSON.stringify({ v: 1, payload: COPY, baseLockVersion: 4 }),
		forbidden: JSON.stringify({ v: 1, payload: COPY, baseLockVersion: 4, forbidden: true }),
	})
	assert.deepEqual(readQuestionDraftCopy(storage, 'ok'), { v: 1, payload: COPY, baseLockVersion: 4 })
	assert.deepEqual(readQuestionDraftCopy(storage, 'forbidden'), {
		v: 1,
		payload: COPY,
		baseLockVersion: 4,
		forbidden: true,
	})
})

test('чтение, запись и удаление при исключениях хранилища не бросают', () => {
	const storage = {
		getItem: () => {
			throw new Error('denied')
		},
		setItem: () => {
			throw new Error('quota')
		},
		removeItem: () => {
			throw new Error('denied')
		},
	}
	assert.equal(readQuestionDraftCopy(storage, 'k'), null)
	assert.doesNotThrow(() => writeQuestionDraftCopy(storage, 'k', { v: 1, payload: COPY, baseLockVersion: 1 }))
	assert.doesNotThrow(() => removeQuestionDraftCopy(storage, 'k'))
	assert.doesNotThrow(() =>
		forgetQuestionDraftCopies(
			{
				get length(): number {
					throw new Error('denied')
				},
				key: () => null,
				removeItem: () => undefined,
			},
			'd1'
		)
	)
})

test('writeQuestionDraftCopy и removeQuestionDraftCopy', () => {
	const { storage, map } = memoryStorage()
	writeQuestionDraftCopy(storage, 'k', { v: 1, payload: COPY, baseLockVersion: 3 })
	assert.deepEqual(JSON.parse(map.get('k') ?? ''), { v: 1, payload: COPY, baseLockVersion: 3 })
	removeQuestionDraftCopy(storage, 'k')
	assert.equal(map.has('k'), false)
})

test('forgetQuestionDraftCopies удаляет копии черновика всех пользователей и только их', () => {
	const { storage, map } = memoryStorage({
		'question-draft-wal-d1-u1': '{}',
		'other-key': '1',
		'question-draft-wal-d1-u2': '{}',
		'question-draft-wal-d2-u1': '{}',
		'question-draft-wal-d10-u1': '{}',
	})
	forgetQuestionDraftCopies(storage, 'd1')
	assert.deepEqual([...map.keys()].sort(), ['other-key', 'question-draft-wal-d10-u1', 'question-draft-wal-d2-u1'])
})

test('resolveInitialDraftPayload: копии нет → сервер', () => {
	assert.deepEqual(resolveInitialDraftPayload({ copy: null, serverPayload: SERVER, serverLockVersion: 5 }), {
		payload: SERVER,
		restored: false,
		divergedCopy: null,
		dropCopy: false,
	})
})

test('resolveInitialDraftPayload: baseLockVersion не меньше версии сервера → копия восстановлена', () => {
	for (const baseLockVersion of [5, 6]) {
		assert.deepEqual(
			resolveInitialDraftPayload({
				copy: { v: 1, payload: COPY, baseLockVersion },
				serverPayload: SERVER,
				serverLockVersion: 5,
			}),
			{ payload: COPY, restored: true, divergedCopy: null, dropCopy: false }
		)
	}
})

test('resolveInitialDraftPayload: baseLockVersion меньше версии сервера → сервер, копия остаётся расходящейся', () => {
	assert.deepEqual(
		resolveInitialDraftPayload({
			copy: { v: 1, payload: COPY, baseLockVersion: 4 },
			serverPayload: SERVER,
			serverLockVersion: 5,
		}),
		{ payload: SERVER, restored: false, divergedCopy: COPY, dropCopy: false }
	)
})

test('resolveInitialDraftPayload: совпадает с сервером (и с другим порядком ключей) → сервер, копия удаляется', () => {
	for (const payload of [SERVER, { question: { b: 1, a: 2 } }]) {
		assert.deepEqual(
			resolveInitialDraftPayload({
				copy: { v: 1, payload, baseLockVersion: 2 },
				serverPayload: SERVER,
				serverLockVersion: 5,
			}),
			{ payload: SERVER, restored: false, divergedCopy: null, dropCopy: true }
		)
	}
})

test('resolveInitialDraftPayload: копия с forbidden → сервер, копия удаляется', () => {
	assert.deepEqual(
		resolveInitialDraftPayload({
			copy: { v: 1, payload: COPY, baseLockVersion: 9, forbidden: true },
			serverPayload: SERVER,
			serverLockVersion: 5,
		}),
		{ payload: SERVER, restored: false, divergedCopy: null, dropCopy: true }
	)
})

test('resolveInitialDraftPayload: свой serialize', () => {
	const result = resolveInitialDraftPayload({
		copy: { v: 1, payload: { question: 'X' }, baseLockVersion: 5 },
		serverPayload: { question: 'x' },
		serverLockVersion: 5,
		serialize: (payload) => JSON.stringify(payload).toLowerCase(),
	})
	assert.equal(result.dropCopy, true)
	assert.equal(result.restored, false)
})

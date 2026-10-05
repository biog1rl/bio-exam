import assert from 'node:assert/strict'
import { test } from 'vitest'

import {
	forgetQuestionDraftCopies,
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

test.each(
	(
		[
			{
				name: 'битый JSON, форма без v: 1, без payload или baseLockVersion → null',
				stored: {
					broken: '{',
					v2: JSON.stringify({ v: 2, payload: COPY, baseLockVersion: 1 }),
					nopayload: JSON.stringify({ v: 1, baseLockVersion: 1 }),
					nolock: JSON.stringify({ v: 1, payload: COPY }),
					nul: 'null',
				},
				expected: { broken: null, v2: null, nopayload: null, nolock: null, nul: null, missing: null },
			},
			{
				name: 'годная копия и пометка forbidden',
				stored: {
					ok: JSON.stringify({ v: 1, payload: COPY, baseLockVersion: 4 }),
					forbidden: JSON.stringify({ v: 1, payload: COPY, baseLockVersion: 4, forbidden: true }),
				},
				expected: {
					ok: { v: 1, payload: COPY, baseLockVersion: 4 },
					forbidden: { v: 1, payload: COPY, baseLockVersion: 4, forbidden: true },
				},
			},
		] as { name: string; stored: Record<string, string>; expected: Record<string, unknown> }[]
	).map((row): [string, { name: string; stored: Record<string, string>; expected: Record<string, unknown> }] => [
		row.name,
		row,
	])
)('readQuestionDraftCopy: %s', (_name, { stored, expected }) => {
	const { storage } = memoryStorage(stored)
	for (const [key, value] of Object.entries(expected)) {
		assert.deepEqual(readQuestionDraftCopy(storage, key), value, key)
	}
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

type DraftCopy = Parameters<typeof resolveInitialDraftPayload>[0]['copy']

test.each(
	(
		[
			{
				name: 'копии нет → сервер',
				copies: [null],
				expected: { payload: SERVER, restored: false, divergedCopy: null, dropCopy: false },
			},
			{
				name: 'baseLockVersion не меньше версии сервера → копия восстановлена',
				copies: [
					{ v: 1, payload: COPY, baseLockVersion: 5 },
					{ v: 1, payload: COPY, baseLockVersion: 6 },
				],
				expected: { payload: COPY, restored: true, divergedCopy: null, dropCopy: false },
			},
			{
				name: 'baseLockVersion меньше версии сервера → сервер, копия остаётся расходящейся',
				copies: [{ v: 1, payload: COPY, baseLockVersion: 4 }],
				expected: { payload: SERVER, restored: false, divergedCopy: COPY, dropCopy: false },
			},
			{
				name: 'совпадает с сервером (и с другим порядком ключей) → сервер, копия удаляется',
				copies: [
					{ v: 1, payload: SERVER, baseLockVersion: 2 },
					{ v: 1, payload: { question: { b: 1, a: 2 } }, baseLockVersion: 2 },
				],
				expected: { payload: SERVER, restored: false, divergedCopy: null, dropCopy: true },
			},
			{
				name: 'копия с forbidden → сервер, копия удаляется',
				copies: [{ v: 1, payload: COPY, baseLockVersion: 9, forbidden: true }],
				expected: { payload: SERVER, restored: false, divergedCopy: null, dropCopy: true },
			},
		] as { name: string; copies: DraftCopy[]; expected: ReturnType<typeof resolveInitialDraftPayload> }[]
	).map(
		(row): [string, { name: string; copies: DraftCopy[]; expected: ReturnType<typeof resolveInitialDraftPayload> }] => [
			row.name,
			row,
		]
	)
)('resolveInitialDraftPayload: %s', (_name, { copies, expected }) => {
	for (const copy of copies) {
		assert.deepEqual(resolveInitialDraftPayload({ copy, serverPayload: SERVER, serverLockVersion: 5 }), expected)
	}
})

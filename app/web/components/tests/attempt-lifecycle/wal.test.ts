import { describe, expect, test } from 'vitest'

import { KEYS, memoryStorage, Q1, Q2, Q3, readJson } from './testing'
import { detachWal, readWal, recordAnswer, recordPosition, type WalRecord } from './wal'

const TELEMETRY = { timeSpentMs: 1000, focusLossCount: 1, visitCount: 2 }

function walOf(record: Partial<WalRecord>): WalRecord {
	return {
		v: 2,
		sessionId: 's1',
		answers: {},
		pending: [],
		position: null,
		telemetry: {},
		telemetryPending: false,
		...record,
	}
}

function storageWith(value: unknown) {
	return memoryStorage({ [KEYS.wal]: typeof value === 'string' ? value : JSON.stringify(value) })
}

describe('readWal: прежние формы', () => {
	test.each(
		[
			{
				name: 'плоская карта ответов: sessionId из закэшированной сессии, все ответы неподтверждённые',
				cached: 's1' as string | null,
				answers: { [Q1]: 'a', [Q2]: ['x', 'y'] } as Record<string, unknown>,
				pending: [Q1, Q2],
			},
			{
				name: 'плоская карта без закэшированной сессии получает sessionId null',
				cached: null as string | null,
				answers: { [Q1]: 'a' } as Record<string, unknown>,
				pending: [Q1],
			},
		].map((row): [string, typeof row] => [row.name, row])
	)('%s', (_name, { cached, answers, pending }) => {
		expect(readWal(storageWith(answers), KEYS.wal, cached)).toEqual({
			v: 2,
			sessionId: cached,
			answers,
			pending,
			position: null,
			telemetry: {},
			telemetryPending: true,
		})
	})

	test('форма { answers, lastQuestionId, telemetry } читается целиком', () => {
		const storage = storageWith({
			answers: { [Q1]: { left: 'right' } },
			lastQuestionId: Q2,
			telemetry: { [Q1]: TELEMETRY },
		})
		expect(readWal(storage, KEYS.wal, 's7')).toEqual({
			v: 2,
			sessionId: 's7',
			answers: { [Q1]: { left: 'right' } },
			pending: [Q1],
			position: Q2,
			telemetry: { [Q1]: TELEMETRY },
			telemetryPending: true,
		})
	})

	test('негодный ответ и негодная запись телеметрии отбрасываются по ключу', () => {
		const storage = storageWith({
			answers: { [Q1]: { left: 1 }, [Q2]: 'ok', [Q3]: [1, 2] },
			lastQuestionId: null,
			telemetry: { [Q1]: { timeSpentMs: -5, focusLossCount: 0, visitCount: 0 }, [Q2]: TELEMETRY },
		})
		const wal = readWal(storage, KEYS.wal, 's1')
		expect(wal?.answers).toEqual({ [Q2]: 'ok' })
		expect(wal?.pending).toEqual([Q2])
		expect(wal?.telemetry).toEqual({ [Q2]: TELEMETRY })
	})

	test('негодный ответ в плоской карте отбрасывается, остальное читается', () => {
		const storage = storageWith({ [Q1]: { left: 2 }, [Q2]: 'b' })
		expect(readWal(storage, KEYS.wal, null)?.answers).toEqual({ [Q2]: 'b' })
	})

	test.each(
		[
			{ name: 'битый JSON даёт null', storages: () => [storageWith('{not json')] },
			{
				name: 'пустое хранилище и не объект дают null',
				storages: () => [memoryStorage(), storageWith('[1,2]'), storageWith('"text"')],
			},
		].map((row): [string, typeof row] => [row.name, row])
	)('%s', (_name, { storages }) => {
		for (const storage of storages()) expect(readWal(storage, KEYS.wal, 's1')).toBeNull()
	})
})

describe('readWal: форма v2', () => {
	test('конверт v2 читается без смены sessionId', () => {
		const record = walOf({
			sessionId: 's2',
			answers: { [Q1]: 'a', [Q2]: 'b' },
			pending: [Q2],
			position: Q1,
			telemetry: { [Q1]: TELEMETRY },
			telemetryPending: true,
		})
		expect(readWal(storageWith(record), KEYS.wal, 's1')).toEqual(record)
	})

	test('pending без ответа и негодные значения отбрасываются', () => {
		const storage = storageWith({
			v: 2,
			sessionId: null,
			answers: { [Q1]: 'a', [Q2]: 5 },
			pending: [Q1, Q2, Q3, 7],
			position: 9,
			telemetry: { [Q1]: 'bad' },
			telemetryPending: 'yes',
		})
		expect(readWal(storage, KEYS.wal, 's1')).toEqual(walOf({ sessionId: null, answers: { [Q1]: 'a' }, pending: [Q1] }))
	})

	test('ошибка getItem даёт null', () => {
		const storage = memoryStorage()
		storage.getItem = () => {
			throw new Error('SecurityError')
		}
		expect(readWal(storage, KEYS.wal, 's1')).toBeNull()
	})
})

describe('recordAnswer', () => {
	test('слияние одного вопроса не стирает ответ другой вкладки той же сессии', () => {
		const storage = storageWith(walOf({ answers: { [Q2]: 'other-tab' }, pending: [Q2] }))
		expect(recordAnswer(storage, KEYS.wal, { sessionId: 's1', questionId: Q1, value: 'a', position: Q1 })).toBe(true)
		expect(readJson(storage, KEYS.wal)).toEqual(
			walOf({ answers: { [Q2]: 'other-tab', [Q1]: 'a' }, pending: [Q2, Q1], position: Q1 })
		)
	})

	test('без записи в хранилище создаётся конверт v2', () => {
		const storage = memoryStorage()
		recordAnswer(storage, KEYS.wal, { sessionId: null, questionId: Q1, value: ['x'], position: Q1 })
		expect(readJson(storage, KEYS.wal)).toEqual(
			walOf({ sessionId: null, answers: { [Q1]: ['x'] }, pending: [Q1], position: Q1 })
		)
	})

	test('прежняя форма переписывается в v2 с сохранением ответов', () => {
		const storage = storageWith({ [Q2]: 'old' })
		recordAnswer(storage, KEYS.wal, { sessionId: 's1', questionId: Q1, value: 'a', position: null })
		expect(readJson(storage, KEYS.wal)).toEqual(
			walOf({ answers: { [Q2]: 'old', [Q1]: 'a' }, pending: [Q2, Q1], telemetryPending: true })
		)
	})

	test('WAL другой непустой сессии не трогается', () => {
		const raw = JSON.stringify(walOf({ sessionId: 's1', answers: { [Q1]: 'old' } }))
		const storage = storageWith(raw)
		expect(recordAnswer(storage, KEYS.wal, { sessionId: 's2', questionId: Q1, value: 'a', position: null })).toBe(false)
		expect(recordAnswer(storage, KEYS.wal, { sessionId: null, questionId: Q1, value: 'a', position: null })).toBe(false)
		expect(recordPosition(storage, KEYS.wal, { sessionId: 's2', position: Q2 })).toBe(false)
		expect(storage.data.get(KEYS.wal)).toBe(raw)
	})
})

describe('detachWal', () => {
	test('WAL переводится в sessionId null со всеми ответами в pending', () => {
		const storage = storageWith(
			walOf({ answers: { [Q1]: 'a', [Q2]: 'b' }, pending: [Q2], position: Q2, telemetry: { [Q1]: TELEMETRY } })
		)
		detachWal(storage, KEYS.wal, 's1')
		expect(readJson(storage, KEYS.wal)).toEqual(
			walOf({
				sessionId: null,
				answers: { [Q1]: 'a', [Q2]: 'b' },
				pending: [Q1, Q2],
				position: Q2,
				telemetry: { [Q1]: TELEMETRY },
				telemetryPending: true,
			})
		)
	})
})

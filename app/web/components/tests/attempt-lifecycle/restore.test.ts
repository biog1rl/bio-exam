import { describe, expect, test } from 'vitest'

import { resolveRestoredDraft } from './restore'
import { Q1, Q2, Q3, QUESTION_IDS, sessionOf } from './testing'
import type { WalRecord } from './wal'

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

const SERVER = sessionOf('s1', undefined, { answers: { [Q1]: 'srv', [Q2]: 'srv2' } })

describe('resolveRestoredDraft: ответы', () => {
	test('WAL той же сессии: неподтверждённое перекрывает сервер, подтверждённое уступает', () => {
		const result = resolveRestoredDraft({
			server: SERVER,
			wal: walOf({ answers: { [Q1]: 'wal', [Q2]: 'old' }, pending: [Q1] }),
			cachedSessionId: 's1',
			questionIds: QUESTION_IDS,
		})
		expect(result.answers).toEqual({ [Q1]: 'wal', [Q2]: 'srv2' })
		expect(result.pending).toEqual([Q1])
	})

	test('WAL с sessionId null принимается целиком поверх сервера и в pending', () => {
		const result = resolveRestoredDraft({
			server: SERVER,
			wal: walOf({ sessionId: null, answers: { [Q1]: 'wal', [Q3]: ['x'] }, pending: [] }),
			cachedSessionId: null,
			questionIds: QUESTION_IDS,
		})
		expect(result.answers).toEqual({ [Q1]: 'wal', [Q2]: 'srv2', [Q3]: ['x'] })
		expect(result.pending).toEqual([Q1, Q3])
	})

	test.each([
		['с закэшированной сессией', 's0'],
		['без закэшированной сессии', null],
	])('WAL другой непустой сессии %s даёт только сервер', (_title, cachedSessionId) => {
		const result = resolveRestoredDraft({
			server: SERVER,
			wal: walOf({ sessionId: 's0', answers: { [Q1]: 'alien', [Q3]: 'alien' }, pending: [Q1, Q3], position: Q3 }),
			cachedSessionId,
			questionIds: QUESTION_IDS,
		})
		expect(result.answers).toEqual({ [Q1]: 'srv', [Q2]: 'srv2' })
		expect(result.pending).toEqual([])
		expect(result.position).toBe(Q1)
	})

	test('негодные значения черновика сервера отбрасываются', () => {
		const result = resolveRestoredDraft({
			server: sessionOf('s1', undefined, { answers: { [Q1]: { a: 1 }, [Q2]: 'ok', [Q3]: null } }),
			wal: null,
			cachedSessionId: null,
			questionIds: QUESTION_IDS,
		})
		expect(result.answers).toEqual({ [Q2]: 'ok' })
	})

	test('без ответа сервера основа — WAL закэшированной сессии', () => {
		const result = resolveRestoredDraft({
			server: null,
			wal: walOf({ answers: { [Q1]: 'a', [Q2]: 'b' }, pending: [Q2], position: Q2 }),
			cachedSessionId: 's1',
			questionIds: QUESTION_IDS,
		})
		expect(result.answers).toEqual({ [Q1]: 'a', [Q2]: 'b' })
		expect(result.pending).toEqual([Q2])
		expect(result.position).toBe(Q2)
	})

	test('без ответа сервера WAL другой сессии не показывается', () => {
		const result = resolveRestoredDraft({
			server: null,
			wal: walOf({ sessionId: 's0', answers: { [Q1]: 'a' }, pending: [Q1] }),
			cachedSessionId: null,
			questionIds: QUESTION_IDS,
		})
		expect(result.answers).toEqual({})
		expect(result.pending).toEqual([])
	})
})

describe('resolveRestoredDraft: позиция', () => {
	test('позиция из WAL той же сессии', () => {
		const result = resolveRestoredDraft({
			server: sessionOf('s1', undefined, { lastQuestionId: Q2 }),
			wal: walOf({ position: Q3 }),
			cachedSessionId: 's1',
			questionIds: QUESTION_IDS,
		})
		expect(result.position).toBe(Q3)
	})

	test('без позиции в WAL — draftLastQuestionId', () => {
		const result = resolveRestoredDraft({
			server: sessionOf('s1', undefined, { lastQuestionId: Q2 }),
			wal: walOf({ position: null }),
			cachedSessionId: 's1',
			questionIds: QUESTION_IDS,
		})
		expect(result.position).toBe(Q2)
	})

	test('неизвестный id позиции пропускается, иначе первый вопрос', () => {
		expect(
			resolveRestoredDraft({
				server: sessionOf('s1', undefined, { lastQuestionId: Q2 }),
				wal: walOf({ position: 'unknown' }),
				cachedSessionId: 's1',
				questionIds: QUESTION_IDS,
			}).position
		).toBe(Q2)
		expect(
			resolveRestoredDraft({
				server: sessionOf('s1', undefined, { lastQuestionId: 'gone' }),
				wal: null,
				cachedSessionId: null,
				questionIds: QUESTION_IDS,
			}).position
		).toBe(Q1)
	})

	test('позиция WAL с sessionId null не используется', () => {
		const result = resolveRestoredDraft({
			server: sessionOf('s1', undefined, { lastQuestionId: Q2 }),
			wal: walOf({ sessionId: null, position: Q3 }),
			cachedSessionId: null,
			questionIds: QUESTION_IDS,
		})
		expect(result.position).toBe(Q2)
	})
})

describe('resolveRestoredDraft: телеметрия', () => {
	test('телеметрия — максимум по полю WAL и сервера', () => {
		const result = resolveRestoredDraft({
			server: sessionOf('s1', undefined, {
				telemetry: { [Q1]: { timeSpentMs: 5000, focusLossCount: 0, visitCount: 1 } },
			}),
			wal: walOf({
				telemetry: { [Q1]: { timeSpentMs: 3000, focusLossCount: 2, visitCount: 1 } },
				telemetryPending: true,
			}),
			cachedSessionId: 's1',
			questionIds: QUESTION_IDS,
		})
		expect(result.telemetry).toEqual({ [Q1]: { timeSpentMs: 5000, focusLossCount: 2, visitCount: 1 } })
		expect(result.telemetryPending).toBe(true)
	})

	test('телеметрия WAL другой сессии не попадает в итог', () => {
		const result = resolveRestoredDraft({
			server: sessionOf('s1'),
			wal: walOf({
				sessionId: 's0',
				telemetry: { [Q1]: { timeSpentMs: 3000, focusLossCount: 2, visitCount: 1 } },
				telemetryPending: true,
			}),
			cachedSessionId: null,
			questionIds: QUESTION_IDS,
		})
		expect(result.telemetry).toEqual({})
		expect(result.telemetryPending).toBe(false)
	})
})

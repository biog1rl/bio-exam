import assert from 'node:assert/strict'
import { test } from 'vitest'

import { mergeTelemetryMaps, TelemetryMapSchema, type TelemetryMap } from './telemetry'

const Q1 = '11111111-1111-4111-8111-111111111111'
const Q2 = '22222222-2222-4222-8222-222222222222'

type MergeRow = {
	name: string
	a: TelemetryMap
	b: TelemetryMap
	expected: TelemetryMap
}

const mergeRows: MergeRow[] = [
	{
		name: 'берёт максимумы по вопросам и добавляет новые вопросы',
		a: { q1: { timeSpentMs: 5000, focusLossCount: 1, visitCount: 2 } },
		b: {
			q1: { timeSpentMs: 7000, focusLossCount: 0, visitCount: 3 },
			q2: { timeSpentMs: 1500, focusLossCount: 1, visitCount: 1 },
		},
		expected: {
			q1: { timeSpentMs: 7000, focusLossCount: 1, visitCount: 3 },
			q2: { timeSpentMs: 1500, focusLossCount: 1, visitCount: 1 },
		},
	},
	{
		name: 'одинаковые записи дают ту же запись',
		a: { q1: { timeSpentMs: 100, focusLossCount: 2, visitCount: 3 } },
		b: { q1: { timeSpentMs: 100, focusLossCount: 2, visitCount: 3 } },
		expected: { q1: { timeSpentMs: 100, focusLossCount: 2, visitCount: 3 } },
	},
	{
		name: 'максимум берётся по каждому полю независимо',
		a: { q1: { timeSpentMs: 9000, focusLossCount: 0, visitCount: 1 } },
		b: { q1: { timeSpentMs: 1000, focusLossCount: 4, visitCount: 1 } },
		expected: { q1: { timeSpentMs: 9000, focusLossCount: 4, visitCount: 1 } },
	},
	{
		name: 'непересекающиеся вопросы объединяются',
		a: { q1: { timeSpentMs: 10, focusLossCount: 0, visitCount: 1 } },
		b: { q2: { timeSpentMs: 20, focusLossCount: 1, visitCount: 2 } },
		expected: {
			q1: { timeSpentMs: 10, focusLossCount: 0, visitCount: 1 },
			q2: { timeSpentMs: 20, focusLossCount: 1, visitCount: 2 },
		},
	},
	{
		name: 'пустой снимок не меняет второй',
		a: {},
		b: { q1: { timeSpentMs: 10, focusLossCount: 0, visitCount: 1 } },
		expected: { q1: { timeSpentMs: 10, focusLossCount: 0, visitCount: 1 } },
	},
]

test('mergeTelemetryMaps: без аргументов возвращает пустой объект', () => {
	assert.deepEqual(mergeTelemetryMaps(), {})
})

test('mergeTelemetryMaps: null и undefined дают пустой объект', () => {
	assert.deepEqual(mergeTelemetryMaps(null, undefined), {})
	assert.deepEqual(mergeTelemetryMaps(undefined), {})
	assert.deepEqual(mergeTelemetryMaps(null), {})
})

test('mergeTelemetryMaps: пропускает null и undefined среди снимков', () => {
	const snapshot: TelemetryMap = { q1: { timeSpentMs: 10, focusLossCount: 0, visitCount: 1 } }
	assert.deepEqual(mergeTelemetryMaps(null, snapshot, undefined), snapshot)
})

for (const row of mergeRows) {
	test(`mergeTelemetryMaps: ${row.name}`, () => {
		assert.deepEqual(mergeTelemetryMaps(row.a, row.b), row.expected)
	})

	test(`mergeTelemetryMaps: порядок снимков не влияет на результат (${row.name})`, () => {
		assert.deepEqual(mergeTelemetryMaps(row.a, row.b), mergeTelemetryMaps(row.b, row.a))
	})

	test(`mergeTelemetryMaps: входные объекты не мутируются (${row.name})`, () => {
		const a = structuredClone(row.a)
		const b = structuredClone(row.b)
		mergeTelemetryMaps(a, b)
		assert.deepEqual(a, row.a)
		assert.deepEqual(b, row.b)
	})
}

test('mergeTelemetryMaps: результат не разделяет записи с входом', () => {
	const snapshot: TelemetryMap = { q1: { timeSpentMs: 10, focusLossCount: 0, visitCount: 1 } }
	const merged = mergeTelemetryMaps(snapshot)
	assert.notEqual(merged.q1, snapshot.q1)
})

test('TelemetryMapSchema: корректная запись проходит', () => {
	const value = {
		[Q1]: { timeSpentMs: 1200, focusLossCount: 0, visitCount: 1 },
		[Q2]: { timeSpentMs: 0, focusLossCount: 3, visitCount: 2 },
	}
	assert.deepEqual(TelemetryMapSchema.parse(value), value)
})

const invalidMaps: Array<{ name: string; value: unknown }> = [
	{ name: 'ключ не uuid', value: { q1: { timeSpentMs: 1, focusLossCount: 0, visitCount: 1 } } },
	{ name: 'отрицательное значение', value: { [Q1]: { timeSpentMs: -1, focusLossCount: 0, visitCount: 1 } } },
	{ name: 'дробное значение', value: { [Q1]: { timeSpentMs: 1.5, focusLossCount: 0, visitCount: 1 } } },
	{ name: 'нет поля visitCount', value: { [Q1]: { timeSpentMs: 1, focusLossCount: 0 } } },
	{ name: 'строка вместо числа', value: { [Q1]: { timeSpentMs: '1', focusLossCount: 0, visitCount: 1 } } },
]

for (const row of invalidMaps) {
	test(`TelemetryMapSchema: отклоняет — ${row.name}`, () => {
		assert.equal(TelemetryMapSchema.safeParse(row.value).success, false)
	})
}

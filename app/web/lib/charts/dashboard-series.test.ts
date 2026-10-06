import assert from 'node:assert/strict'
import { describe, test } from 'vitest'

import { activitySeries, buildActivityRows } from './dashboard-series'

const NOW = new Date(2026, 9, 6, 15, 30)

describe('buildActivityRows', () => {
	const days = [
		{ date: '2026-10-06', attempts: 3, averageScore: 71.6 },
		{ date: '2026-10-04', attempts: 2, averageScore: null },
		{ date: '2026-09-01', attempts: 9, averageScore: 50 },
	]

	test.each([
		['week', 7, '2026-09-30'],
		['month', 30, '2026-09-07'],
	] as const)('%s: %i дней подряд до сегодняшнего включительно', (period, length, first) => {
		const rows = buildActivityRows(days, period, NOW)
		assert.equal(rows.length, length)
		assert.equal(rows[0]?.key, first)
		assert.equal(rows.at(-1)?.key, '2026-10-06')
	})

	test('пропущенный день — 0 попыток без среднего, день только с непроверенными — среднего нет, вне периода не попадает', () => {
		const rows = buildActivityRows(days, 'week', NOW)
		const byKey = new Map(rows.map((row) => [row.key, row]))
		assert.deepEqual([byKey.get('2026-10-06')?.attempts, byKey.get('2026-10-06')?.averageScore], [3, 72])
		assert.deepEqual([byKey.get('2026-10-05')?.attempts, byKey.get('2026-10-05')?.averageScore], [0, null])
		assert.deepEqual([byKey.get('2026-10-04')?.attempts, byKey.get('2026-10-04')?.averageScore], [2, null])
		assert.equal(byKey.has('2026-09-01'), false)
	})
})

describe('activitySeries', () => {
	test.each([
		['attempts', 'bar', [['attempts', 'left', undefined]]],
		['averageScore', 'line', [['averageScore', 'left', undefined]]],
		[
			'both',
			'bar',
			[
				['attempts', 'left', undefined],
				['averageScore', 'right', 'line'],
			],
		],
		[
			'both',
			'area',
			[
				['attempts', 'left', undefined],
				['averageScore', 'right', undefined],
			],
		],
	] as const)('%s при типе %s', (metric, type, expected) => {
		assert.deepEqual(
			activitySeries({ metric, type }).map((item) => [item.key, item.yAxis, item.type]),
			expected
		)
	})
})

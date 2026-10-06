import assert from 'node:assert/strict'
import { describe, test } from 'vitest'

import type { ProgressAttempt } from '@/lib/progress/attempt-chart'

import { VALUE_KEY, buildAttemptChart, metricOf } from './attempt-series'
import { DEFAULT_CHART_CONFIGS, normalizeAttemptConfig, type AttemptChartConfig } from './config'

function local(year: number, month: number, day: number, hour: number, minute = 0): string {
	return new Date(year, month, day, hour, minute).toISOString()
}

let counter = 0

function attempt(overrides: Partial<ProgressAttempt> = {}): ProgressAttempt {
	counter += 1
	return {
		attemptId: `a${counter}`,
		testId: 't1',
		testTitle: 'Клетка',
		testSlug: 'cell',
		topicSlug: 'e2e-topic',
		topicTitle: 'Цитология',
		submittedAt: local(2026, 9, 4, 10),
		earnedPoints: 5,
		totalPoints: 10,
		scorePercentage: 50,
		passed: false,
		...overrides,
	}
}

const BARS: AttemptChartConfig = DEFAULT_CHART_CONFIGS.studentProgress

function config(patch: Partial<AttemptChartConfig>): AttemptChartConfig {
	return { ...BARS, ...patch }
}

describe('metricOf', () => {
	const group = [
		attempt({ scorePercentage: 40, earnedPoints: 4, passed: false }),
		attempt({ scorePercentage: 90, earnedPoints: 9, passed: true }),
		attempt({ scorePercentage: 61, earnedPoints: 6, passed: true }),
	]

	test.each([
		['best', 90],
		['average', 64],
		['last', 61],
		['points', 6.3],
		['count', 3],
		['passRate', 67],
	] as const)('%s', (y, expected) => {
		assert.equal(metricOf(group, y), expected)
	})

	test('пустая группа — null, а число попыток 0; процент ограничен 0…100', () => {
		assert.equal(metricOf([], 'best'), null)
		assert.equal(metricOf([], 'count'), 0)
		assert.equal(metricOf([attempt({ scorePercentage: 130 })], 'best'), 100)
		assert.equal(metricOf([attempt({ scorePercentage: -5 })], 'best'), 0)
	})
})

describe('каждая попытка', () => {
	test('пустой вход — пустой график', () => {
		const chart = buildAttemptChart([], BARS)
		assert.deepEqual(chart.rows, [])
		assert.deepEqual(chart.legend, [])
	})

	test('попытки по времени, подпись даты у средней попытки дня, двух дней — промежуток', () => {
		const dayOne = attempt({ testTitle: 'Первый', submittedAt: local(2026, 9, 4, 9) })
		const dayTwoA = attempt({ testTitle: 'Второй', submittedAt: local(2026, 9, 6, 9) })
		const dayTwoB = attempt({ testTitle: 'Третий', submittedAt: local(2026, 9, 6, 10) })
		const dayTwoC = attempt({ testTitle: 'Четвёртый', submittedAt: local(2026, 9, 6, 11) })
		const { rows } = buildAttemptChart([dayTwoC, dayOne, dayTwoB, dayTwoA], BARS)
		assert.deepEqual(
			rows.map((row) => [row.gap, row.name, row.tick]),
			[
				[false, 'Первый', '4 окт.'],
				[true, '', ''],
				[false, 'Второй', ''],
				[false, 'Третий', '6 окт.'],
				[false, 'Четвёртый', ''],
			]
		)
		assert.equal(rows[1][VALUE_KEY], null)
	})

	test('23:30 и 00:30 следующего дня по местному времени — разные дни', () => {
		const late = attempt({ submittedAt: local(2026, 9, 4, 23, 30) })
		const early = attempt({ submittedAt: local(2026, 9, 5, 0, 30) })
		const { rows } = buildAttemptChart([early, late], BARS)
		assert.deepEqual(
			rows.map((row) => row.tick),
			['4 окт.', '', '5 окт.']
		)
	})

	test('линия и режим «один день» — без промежутков, у режима дня время у каждой попытки', () => {
		const first = attempt({ submittedAt: local(2026, 9, 4, 9, 5) })
		const second = attempt({ submittedAt: local(2026, 9, 5, 14, 30) })
		assert.equal(
			buildAttemptChart([first, second], config({ type: 'line' })).rows.some((row) => row.gap),
			false
		)
		assert.deepEqual(
			buildAttemptChart([second, first], config({ x: 'week' }), 'day').rows.map((row) => row.tick),
			['09:05', '14:30']
		)
	})

	test.each([
		['topic', ['var(--chart-1)', 'var(--chart-2)'], ['Ботаника', 'Цитология']],
		['result', ['var(--chart-1)', 'var(--destructive)'], ['Пройден', 'Не пройден']],
		['none', [null, null], []],
	] as const)('цвет %s', (color, fills, legend) => {
		const passed = attempt({
			topicSlug: 'botany',
			topicTitle: 'Ботаника',
			passed: true,
			submittedAt: local(2026, 9, 4, 9),
		})
		const failed = attempt({ submittedAt: local(2026, 9, 4, 10) })
		const chart = buildAttemptChart([failed, passed], config({ color }))
		assert.deepEqual(
			chart.rows.map((row) => row.fill),
			fills
		)
		assert.deepEqual(
			chart.legend.map((item) => item.label),
			legend
		)
	})

	test('по оси Y у отдельной попытки — процент или баллы', () => {
		const one = attempt({ scorePercentage: 72.4, earnedPoints: 7 })
		assert.equal(buildAttemptChart([one], config({ y: 'best' })).rows[0][VALUE_KEY], 72)
		assert.equal(buildAttemptChart([one], config({ y: 'points' })).rows[0][VALUE_KEY], 7)
		assert.equal(buildAttemptChart([one], config({ y: 'count' })).config.y, 'best')
	})
})

describe('группировка по времени', () => {
	const attempts = [
		attempt({ scorePercentage: 40, submittedAt: local(2026, 9, 5, 9) }),
		attempt({ scorePercentage: 80, submittedAt: local(2026, 9, 6, 9) }),
		attempt({
			topicSlug: 'botany',
			topicTitle: 'Ботаника',
			scorePercentage: 60,
			submittedAt: local(2026, 9, 13, 9),
		}),
		attempt({ scorePercentage: 100, submittedAt: local(2026, 10, 2, 9) }),
	]

	test.each([
		[
			'day',
			29,
			'2026-10-05',
			'2026-11-02',
			{ '2026-10-05': 40, '2026-10-06': 80, '2026-10-07': null, '2026-11-02': 100 },
		],
		[
			'week',
			5,
			'2026-10-05',
			'2026-11-02',
			{ '2026-10-05': 80, '2026-10-12': 60, '2026-10-19': null, '2026-11-02': 100 },
		],
		['month', 2, '2026-10', '2026-11', { '2026-10': 80, '2026-11': 100 }],
	] as const)('%s: пустые интервалы заполнены, лучший результат в каждом', (x, length, first, last, values) => {
		const { rows, categorical } = buildAttemptChart(attempts, config({ x, y: 'best', color: 'none' }))
		assert.equal(rows.length, length)
		assert.equal(rows[0]?.key, first)
		assert.equal(rows.at(-1)?.key, last)
		for (const [key, value] of Object.entries(values)) {
			assert.equal(rows.find((row) => row.key === key)?.[VALUE_KEY], value, key)
		}
		assert.equal(categorical, false)
	})

	test('цвет по теме — отдельный ряд на тему, у числа попыток пустая клетка 0', () => {
		const { rows, series, legend } = buildAttemptChart(attempts, config({ x: 'month', y: 'count', color: 'topic' }))
		assert.deepEqual(
			series.map((item) => [item.key, item.label]),
			[
				['topic-botany', 'Ботаника'],
				['topic-e2e-topic', 'Цитология'],
			]
		)
		assert.deepEqual(
			rows.map((row) => [row['topic-botany'], row['topic-e2e-topic']]),
			[
				[1, 2],
				[0, 1],
			]
		)
		assert.equal(legend.length, 2)
	})
})

describe('группировка по категориям', () => {
	const attempts = [
		attempt({ testId: 't2', testTitle: 'Ядро', scorePercentage: 30, passed: false }),
		attempt({ testId: 't1', testTitle: 'Клетка', scorePercentage: 70, passed: true }),
		attempt({ testId: 't1', testTitle: 'Клетка', scorePercentage: 90, passed: true }),
		attempt({
			testId: 't3',
			testTitle: 'Листья',
			topicSlug: 'botany',
			topicTitle: 'Ботаника',
			scorePercentage: 50,
			passed: false,
		}),
	]

	test('по тестам — категории по названию, средний результат и число попыток в подписи', () => {
		const { rows, categorical } = buildAttemptChart(attempts, config({ x: 'test', y: 'average', color: 'none' }))
		assert.deepEqual(
			rows.map((row) => [row.title, row[VALUE_KEY], row.subtitle]),
			[
				['Клетка', 80, '2 попытки'],
				['Листья', 50, '1 попытка'],
				['Ядро', 30, '1 попытка'],
			]
		)
		assert.equal(categorical, true)
	})

	test('по темам с цветом темы — цвет у каждой категории, доля пройденных', () => {
		const { rows } = buildAttemptChart(attempts, config({ x: 'topic', y: 'passRate', color: 'topic' }))
		assert.deepEqual(
			rows.map((row) => [row.title, row[VALUE_KEY], row.fill]),
			[
				['Ботаника', 0, 'var(--chart-1)'],
				['Цитология', 67, 'var(--chart-2)'],
			]
		)
	})

	test('по тестам с цветом темы — легенда из тем', () => {
		const { legend } = buildAttemptChart(attempts, config({ x: 'test', color: 'topic' }))
		assert.deepEqual(
			legend.map((item) => item.label),
			['Цитология', 'Ботаника']
		)
	})
})

describe('normalizeAttemptConfig', () => {
	test('недопустимые для оси значения сбрасываются, допустимые остаются', () => {
		assert.deepEqual(
			normalizeAttemptConfig(config({ x: 'topic', color: 'result', labels: 'name', y: 'count' })),
			config({ x: 'topic', color: 'none', labels: 'name', y: 'count' })
		)
		assert.deepEqual(
			normalizeAttemptConfig(config({ x: 'day', labels: 'name', y: 'passRate' })),
			config({ x: 'day', labels: 'none', y: 'passRate' })
		)
	})
})

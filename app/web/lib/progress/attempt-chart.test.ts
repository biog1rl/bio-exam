import assert from 'node:assert/strict'
import { describe, test } from 'vitest'

import {
	assignTopicColors,
	barMinPointSize,
	buildAttemptBars,
	buildTopicChartConfig,
	chartMinWidth,
	DEFAULT_PERIOD,
	filterAttemptsByPeriod,
	fitBarLabel,
	legendTopics,
	parseDateParam,
	parseDayParam,
	parsePeriod,
	PERIOD_PRESETS,
	resolvePeriodBounds,
	topicConfigKey,
	type ProgressAttempt,
} from './attempt-chart'

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

describe('topicConfigKey', () => {
	test('безопасный slug идёт в ключ как есть', () => {
		assert.equal(topicConfigKey('e2e-topic'), 'topic-e2e-topic')
		assert.equal(topicConfigKey('cell_2'), 'topic-cell_2')
	})

	test('опасные символы заменяются хешем из [a-z0-9_-]', () => {
		const slugs = ['клетка', 'two words', 'a;b', '<script>', 'x}y', 'Upper']
		const keys = slugs.map(topicConfigKey)
		for (const key of keys) {
			assert.match(key, /^topic-x[a-z0-9]+$/)
		}
		assert.equal(new Set(keys).size, slugs.length)
		assert.deepEqual(slugs.map(topicConfigKey), keys)
	})
})

describe('assignTopicColors', () => {
	const items = [
		{ topicSlug: 'zoology', topicTitle: 'Зоология' },
		{ topicSlug: 'botany', topicTitle: null },
		{ topicSlug: 'cell', topicTitle: 'Клетка' },
		{ topicSlug: 'botany', topicTitle: null },
	]

	test('порядок по slug, повторы схлопываются, title по умолчанию — slug', () => {
		const colors = assignTopicColors(items)
		assert.deepEqual(colors, [
			{ slug: 'botany', key: 'topic-botany', title: 'botany', color: 'var(--chart-1)' },
			{ slug: 'cell', key: 'topic-cell', title: 'Клетка', color: 'var(--chart-2)' },
			{ slug: 'zoology', key: 'topic-zoology', title: 'Зоология', color: 'var(--chart-3)' },
		])
	})

	test('другой порядок входа даёт тот же результат', () => {
		assert.deepEqual(assignTopicColors([...items].reverse()), assignTopicColors(items))
	})

	test('шестой раздел получает chart-6, одиннадцатый — снова chart-1', () => {
		const many = Array.from({ length: 11 }, (_, index) => ({
			topicSlug: `t${String(index).padStart(2, '0')}`,
			topicTitle: null,
		}))
		const colors = assignTopicColors(many)
		assert.equal(colors[5].color, 'var(--chart-6)')
		assert.equal(colors[9].color, 'var(--chart-10)')
		assert.equal(colors[10].color, 'var(--chart-1)')
	})
})

describe('buildTopicChartConfig', () => {
	test('ключ — topicConfigKey, label — название раздела, color — токен палитры', () => {
		const colors = assignTopicColors([
			{ topicSlug: 'e2e-topic', topicTitle: 'Цитология' },
			{ topicSlug: 'a;b', topicTitle: 'Опасный' },
		])
		const config = buildTopicChartConfig(colors)
		assert.deepEqual(config['topic-e2e-topic'], { label: 'Цитология', color: 'var(--chart-2)' })
		assert.deepEqual(config[topicConfigKey('a;b')], { label: 'Опасный', color: 'var(--chart-1)' })
		assert.equal(Object.keys(config).length, 2)
	})
})

describe('buildAttemptBars', () => {
	const colors = assignTopicColors([{ topicSlug: 'e2e-topic', topicTitle: 'Цитология' }])

	test('пустой вход — пустой массив', () => {
		assert.deepEqual(buildAttemptBars([], colors, 'range'), [])
	})

	test('три попытки разных тестов в один день — три столбика подряд по времени', () => {
		const first = attempt({ testId: 't1', testTitle: 'Первый', submittedAt: local(2026, 9, 4, 9) })
		const second = attempt({ testId: 't2', testTitle: 'Второй', submittedAt: local(2026, 9, 4, 11) })
		const third = attempt({ testId: 't3', testTitle: 'Третий', submittedAt: local(2026, 9, 4, 15) })
		const rows = buildAttemptBars([third, first, second], colors, 'range')
		assert.deepEqual(
			rows.map((row) => [row.kind, row.key, row.testTitle]),
			[
				['attempt', first.attemptId, 'Первый'],
				['attempt', second.attemptId, 'Второй'],
				['attempt', third.attemptId, 'Третий'],
			]
		)
		assert.deepEqual(
			rows.map((row) => row.tick),
			['', '4 окт.', '']
		)
	})

	test('две попытки одного теста в один день — два отдельных столбика', () => {
		const first = attempt({ submittedAt: local(2026, 9, 4, 9), scorePercentage: 40 })
		const second = attempt({ submittedAt: local(2026, 9, 4, 10), scorePercentage: 80 })
		const rows = buildAttemptBars([second, first], colors, 'range')
		assert.equal(rows.length, 2)
		assert.deepEqual(
			rows.map((row) => row.percent),
			[40, 80]
		)
		assert.deepEqual(
			rows.map((row) => row.tick),
			['4 окт.', '']
		)
	})

	test('попытки двух дней разделены одним промежутком', () => {
		const dayOne = attempt({ submittedAt: local(2026, 9, 4, 9) })
		const dayTwoA = attempt({ submittedAt: local(2026, 9, 6, 9) })
		const dayTwoB = attempt({ submittedAt: local(2026, 9, 6, 10) })
		const dayTwoC = attempt({ submittedAt: local(2026, 9, 6, 11) })
		const rows = buildAttemptBars([dayTwoC, dayOne, dayTwoB, dayTwoA], colors, 'range')
		assert.deepEqual(
			rows.map((row) => row.kind),
			['attempt', 'gap', 'attempt', 'attempt', 'attempt']
		)
		const gap = rows[1]
		assert.equal(gap.percent, null)
		assert.equal(gap.tick, '')
		assert.equal(gap.key, 'gap-2026-10-06')
		assert.deepEqual(
			rows.map((row) => row.tick),
			['4 окт.', '', '', '6 окт.', '']
		)
	})

	test('режим day — без промежутков, у каждого столбика время', () => {
		const first = attempt({ submittedAt: local(2026, 9, 4, 9, 5) })
		const second = attempt({ submittedAt: local(2026, 9, 4, 14, 30) })
		const rows = buildAttemptBars([second, first], colors, 'day')
		assert.deepEqual(
			rows.map((row) => [row.kind, row.tick]),
			[
				['attempt', '09:05'],
				['attempt', '14:30'],
			]
		)
	})

	test('23:30 и 00:30 следующего дня по местному времени — разные дни', () => {
		const late = attempt({ submittedAt: local(2026, 9, 4, 23, 30) })
		const early = attempt({ submittedAt: local(2026, 9, 5, 0, 30) })
		const rows = buildAttemptBars([early, late], colors, 'range')
		assert.deepEqual(
			rows.map((row) => row.kind),
			['attempt', 'gap', 'attempt']
		)
		assert.deepEqual(
			rows.map((row) => row.tick),
			['4 окт.', '', '5 окт.']
		)
	})

	test('процент ограничен 0…100, цвет и подписи раздела из конфигурации', () => {
		const over = attempt({ scorePercentage: 130, submittedAt: local(2026, 9, 4, 9) })
		const under = attempt({ scorePercentage: -5, submittedAt: local(2026, 9, 4, 10) })
		const rows = buildAttemptBars([over, under], colors, 'range')
		assert.deepEqual(
			rows.map((row) => row.percent),
			[100, 0]
		)
		for (const row of rows) {
			assert.equal(row.fill, 'var(--color-topic-e2e-topic)')
			assert.equal(row.topicKey, 'topic-e2e-topic')
			assert.equal(row.topicTitle, 'Цитология')
			assert.equal(row.totalPoints, 10)
		}
	})
})

describe('barMinPointSize и chartMinWidth', () => {
	test('пустое значение не рисуется, любое число — минимум 3px', () => {
		assert.equal(barMinPointSize(null), 0)
		assert.equal(barMinPointSize(undefined), 0)
		assert.equal(barMinPointSize(0), 3)
		assert.equal(barMinPointSize(75), 3)
	})

	test('ширина — 36px на строку', () => {
		assert.equal(chartMinWidth(0), 0)
		assert.equal(chartMinWidth(5), 180)
	})
})

describe('fitBarLabel', () => {
	const longTitle = 'Последовательность этапов митоза в клетках корня лука'

	test('короткое название в широком столбике — горизонтально внутри целиком', () => {
		assert.deepEqual(fitBarLabel('Короткий', { barWidth: 120, barHeight: 200, spaceAbove: 10 }), {
			text: 'Короткий',
			vertical: false,
			placement: 'inside',
		})
	})

	test('длинное название в широком столбике обрезается многоточием', () => {
		const label = fitBarLabel(longTitle, { barWidth: 120, barHeight: 200 })
		assert.ok(label)
		assert.equal(label.vertical, false)
		assert.equal(label.placement, 'inside')
		assert.ok(label.text.length <= Math.floor((120 - 8) / 7))
		assert.ok(label.text.endsWith('…'))
		assert.ok(longTitle.startsWith(label.text.slice(0, -1)))
	})

	test('узкий высокий столбик — вертикально внутри', () => {
		const label = fitBarLabel(longTitle, { barWidth: 30, barHeight: 200 })
		assert.ok(label)
		assert.equal(label.vertical, true)
		assert.equal(label.placement, 'inside')
		assert.ok(label.text.length <= Math.floor((200 - 8) / 7))
	})

	test('узкий низкий столбик — вертикально над столбиком', () => {
		const label = fitBarLabel(longTitle, { barWidth: 30, barHeight: 20, spaceAbove: 180 })
		assert.ok(label)
		assert.equal(label.vertical, true)
		assert.equal(label.placement, 'above')
		assert.ok(label.text.length <= Math.floor((180 - 8) / 7))
	})

	test('пустое название — без подписи', () => {
		assert.equal(fitBarLabel('', { barWidth: 120, barHeight: 200 }), null)
		assert.equal(fitBarLabel(undefined, { barWidth: 120, barHeight: 200 }), null)
	})

	test('ёмкость 1 — только многоточие, ёмкость 0 — без подписи', () => {
		assert.deepEqual(fitBarLabel(longTitle, { barWidth: 30, barHeight: 20, spaceAbove: 15 }), {
			text: '…',
			vertical: true,
			placement: 'above',
		})
		assert.equal(fitBarLabel(longTitle, { barWidth: 30, barHeight: 20, spaceAbove: 5 }), null)
	})

	test('подпись никогда не длиннее ёмкости', () => {
		for (let width = 10; width <= 200; width += 7) {
			for (let height = 0; height <= 240; height += 11) {
				const label = fitBarLabel(longTitle, { barWidth: width, barHeight: height, spaceAbove: 120 })
				if (!label) continue
				const space = label.vertical ? (label.placement === 'inside' ? height : 120) : width
				assert.ok(label.text.length <= Math.floor((space - 8) / 7))
			}
		}
	})
})

describe('legendTopics', () => {
	test('только разделы со столбиками, в порядке цветов, без повторов', () => {
		const colors = assignTopicColors([
			{ topicSlug: 'botany', topicTitle: 'Ботаника' },
			{ topicSlug: 'cell', topicTitle: 'Клетка' },
			{ topicSlug: 'zoology', topicTitle: 'Зоология' },
		])
		const rows = buildAttemptBars(
			[
				attempt({ topicSlug: 'zoology', submittedAt: local(2026, 9, 4, 9) }),
				attempt({ topicSlug: 'botany', submittedAt: local(2026, 9, 5, 9) }),
				attempt({ topicSlug: 'zoology', submittedAt: local(2026, 9, 6, 9) }),
			],
			colors,
			'range'
		)
		assert.deepEqual(
			legendTopics(rows, colors).map((topic) => topic.slug),
			['botany', 'zoology']
		)
	})
})

describe('период', () => {
	const now = new Date(2026, 9, 4, 15, 0)

	test('пресеты и значение по умолчанию', () => {
		assert.equal(DEFAULT_PERIOD, 'month')
		assert.deepEqual(
			PERIOD_PRESETS.map((preset) => [preset.value, preset.label]),
			[
				['week', 'Неделя'],
				['month', 'Месяц'],
				['3months', '3 месяца'],
				['6months', 'Полгода'],
				['all', 'Всё время'],
			]
		)
	})

	test('parsePeriod: неизвестное значение — месяц', () => {
		for (const value of [null, undefined, '', 'garbage']) {
			assert.equal(parsePeriod(value), 'month')
		}
		for (const value of ['week', 'month', '3months', '6months', 'all', 'custom']) {
			assert.equal(parsePeriod(value), value)
		}
	})

	test('parseDayParam: только корректная дата yyyy-MM-dd в местном времени', () => {
		assert.deepEqual(parseDayParam('2026-10-04'), new Date(2026, 9, 4))
		for (const value of ['2026-13-45', '2026-02-30', 'abc', '', null, undefined, '2026-10-04T00:00']) {
			assert.equal(parseDayParam(value), null)
		}
	})

	test('parseDateParam: корректная ISO-дата или null', () => {
		const iso = new Date(2026, 8, 1, 12).toISOString()
		assert.deepEqual(parseDateParam(iso), new Date(iso))
		for (const value of ['abc', '', null, undefined]) {
			assert.equal(parseDateParam(value), null)
		}
	})

	test('resolvePeriodBounds: пресеты от начала дня', () => {
		assert.deepEqual(resolvePeriodBounds({ period: 'month' }, now), { start: new Date(2026, 8, 4), end: null })
		assert.deepEqual(resolvePeriodBounds({ period: '3months' }, now), { start: new Date(2026, 6, 4), end: null })
		assert.deepEqual(resolvePeriodBounds({ period: '6months' }, now), { start: new Date(2026, 3, 4), end: null })
		assert.deepEqual(resolvePeriodBounds({ period: 'week' }, now), { start: new Date(2026, 8, 27), end: null })
		assert.deepEqual(resolvePeriodBounds({ period: 'all' }, now), { start: null, end: null })
	})

	test('resolvePeriodBounds: свой диапазон', () => {
		const from = new Date(2026, 8, 10, 13).toISOString()
		const to = new Date(2026, 8, 20, 8).toISOString()
		assert.deepEqual(resolvePeriodBounds({ period: 'custom', from, to }, now), {
			start: new Date(2026, 8, 10),
			end: new Date(2026, 8, 20, 23, 59, 59, 999),
		})
		assert.deepEqual(resolvePeriodBounds({ period: 'custom', from: 'abc', to }, now), {
			start: null,
			end: new Date(2026, 8, 20, 23, 59, 59, 999),
		})
	})

	test('resolvePeriodBounds: день важнее периода, битый день игнорируется', () => {
		assert.deepEqual(resolvePeriodBounds({ period: 'week', day: '2026-08-15' }, now), {
			start: new Date(2026, 7, 15),
			end: new Date(2026, 7, 15, 23, 59, 59, 999),
		})
		assert.deepEqual(resolvePeriodBounds({ period: 'month', day: '2026-99-99' }, now), {
			start: new Date(2026, 8, 4),
			end: null,
		})
	})

	test('filterAttemptsByPeriod: границы включительно, null не ограничивает', () => {
		const start = new Date(2026, 8, 4)
		const end = new Date(2026, 8, 4, 23, 59, 59, 999)
		const before = attempt({ submittedAt: new Date(start.getTime() - 1).toISOString() })
		const atStart = attempt({ submittedAt: start.toISOString() })
		const atEnd = attempt({ submittedAt: end.toISOString() })
		const after = attempt({ submittedAt: new Date(end.getTime() + 1).toISOString() })
		const all = [before, atStart, atEnd, after]
		assert.deepEqual(filterAttemptsByPeriod(all, { start, end }), [atStart, atEnd])
		assert.deepEqual(filterAttemptsByPeriod(all, { start, end: null }), [atStart, atEnd, after])
		assert.deepEqual(filterAttemptsByPeriod(all, { start: null, end }), [before, atStart, atEnd])
		assert.deepEqual(filterAttemptsByPeriod(all, { start: null, end: null }), all)
	})
})

import { addDays, addMonths, format, startOfISOWeek } from 'date-fns'
import { ru } from 'date-fns/locale'

import { TOPIC_PALETTE, assignTopicColors, topicConfigKey, type ProgressAttempt } from '@/lib/progress/attempt-chart'

import { isTimeAxis, normalizeAttemptConfig, yLabel, type AttemptChartConfig, type AttemptY } from './config'

export type ChartSeries = { key: string; label: string; color: string }

export type AttemptChartRow = {
	key: string
	tick: string
	title: string
	subtitle: string
	name: string
	fill: string | null
	gap: boolean
	count: number
	earned: number | null
	total: number | null
	[series: string]: string | number | boolean | null
}

export type AttemptChartData = {
	rows: AttemptChartRow[]
	series: ChartSeries[]
	legend: ChartSeries[]
	percent: boolean
	valueLabel: string
	categorical: boolean
	config: AttemptChartConfig
}

export type AttemptChartMode = 'range' | 'day'

export const VALUE_KEY = 'value'
const VALUE_COLOR = 'var(--chart-1)'
const PASSED_COLOR = 'var(--chart-1)'
const FAILED_COLOR = 'var(--destructive)'
const PERCENT_METRICS: readonly AttemptY[] = ['best', 'average', 'last', 'passRate']
const TICK_CHARS = 18

type Category = { key: string; label: string; color: string }

function byTime(a: ProgressAttempt, b: ProgressAttempt): number {
	return new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime()
}

function compareTitles(a: string, b: string): number {
	return a.localeCompare(b, 'ru')
}

function clampPercent(value: number): number {
	if (!Number.isFinite(value)) return 0
	return Math.min(100, Math.max(0, value))
}

function short(text: string): string {
	return text.length > TICK_CHARS ? `${text.slice(0, TICK_CHARS - 1).trimEnd()}…` : text
}

export function metricOf(group: readonly ProgressAttempt[], y: AttemptY): number | null {
	if (group.length === 0) return y === 'count' ? 0 : null
	const percents = group.map((attempt) => clampPercent(attempt.scorePercentage))
	switch (y) {
		case 'best':
			return Math.round(Math.max(...percents))
		case 'average':
			return Math.round(percents.reduce((sum, value) => sum + value, 0) / percents.length)
		case 'last':
			return Math.round(percents[percents.length - 1] ?? 0)
		case 'points': {
			const mean = group.reduce((sum, attempt) => sum + attempt.earnedPoints, 0) / group.length
			return Math.round(mean * 10) / 10
		}
		case 'count':
			return group.length
		case 'passRate':
			return Math.round((group.filter((attempt) => attempt.passed).length / group.length) * 100)
	}
}

function topicCategories(
	attempts: readonly ProgressAttempt[],
	colors?: ReadonlyMap<string, string>
): Map<string, Category> {
	return new Map(
		assignTopicColors([...attempts]).map((topic) => [
			topic.slug,
			{ key: topic.key, label: topic.title, color: colors?.get(topic.slug) ?? topic.color },
		])
	)
}

function testCategories(attempts: readonly ProgressAttempt[]): Map<string, Category> {
	const titles = new Map<string, string>()
	for (const attempt of attempts) if (!titles.has(attempt.testId)) titles.set(attempt.testId, attempt.testTitle)
	const ordered = [...titles.entries()].sort((a, b) => compareTitles(a[1], b[1]) || (a[0] < b[0] ? -1 : 1))
	return new Map(
		ordered.map(([id, title], index) => [
			id,
			{ key: `test-${index}`, label: title, color: TOPIC_PALETTE[index % TOPIC_PALETTE.length] },
		])
	)
}

function bucketOf(iso: string, x: 'day' | 'week' | 'month'): string {
	const date = new Date(iso)
	if (x === 'day') return format(date, 'yyyy-MM-dd')
	if (x === 'week') return format(startOfISOWeek(date), 'yyyy-MM-dd')
	return format(date, 'yyyy-MM')
}

function nextBucket(bucket: string, x: 'day' | 'week' | 'month'): string {
	if (x === 'month') return format(addMonths(new Date(`${bucket}-01T00:00:00`), 1), 'yyyy-MM')
	return format(addDays(new Date(`${bucket}T00:00:00`), x === 'week' ? 7 : 1), 'yyyy-MM-dd')
}

const MAX_BUCKETS = 400

function fillBuckets(keys: readonly string[], x: 'day' | 'week' | 'month'): string[] {
	const sorted = [...keys].sort()
	const first = sorted[0]
	const last = sorted[sorted.length - 1]
	if (!first || !last) return []
	const filled: string[] = []
	for (let bucket = first; bucket <= last && filled.length < MAX_BUCKETS; bucket = nextBucket(bucket, x)) {
		filled.push(bucket)
	}
	return filled.length < MAX_BUCKETS ? filled : sorted
}

function bucketTexts(bucket: string, x: 'day' | 'week' | 'month'): { tick: string; title: string } {
	if (x === 'month') {
		const date = new Date(`${bucket}-01T00:00:00`)
		return { tick: format(date, 'LLL yyyy', { locale: ru }), title: format(date, 'LLLL yyyy', { locale: ru }) }
	}
	const date = new Date(`${bucket}T00:00:00`)
	if (x === 'week') {
		return {
			tick: format(date, 'd MMM', { locale: ru }),
			title: `Неделя с ${format(date, 'd MMMM yyyy', { locale: ru })}`,
		}
	}
	return { tick: format(date, 'd MMM', { locale: ru }), title: format(date, 'd MMMM yyyy', { locale: ru }) }
}

function baseRow(key: string, tick: string, title: string, subtitle: string, name: string): AttemptChartRow {
	return { key, tick, title, subtitle, name, fill: null, gap: false, count: 0, earned: null, total: null }
}

function attemptsWord(count: number): string {
	const mod10 = count % 10
	const mod100 = count % 100
	if (mod10 === 1 && mod100 !== 11) return 'попытка'
	if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'попытки'
	return 'попыток'
}

function groupBy<K>(
	attempts: readonly ProgressAttempt[],
	keyOf: (attempt: ProgressAttempt) => K
): Map<K, ProgressAttempt[]> {
	const groups = new Map<K, ProgressAttempt[]>()
	for (const attempt of attempts) {
		const key = keyOf(attempt)
		const group = groups.get(key)
		if (group) group.push(attempt)
		else groups.set(key, [attempt])
	}
	return groups
}

export function buildAttemptChart(
	attempts: readonly ProgressAttempt[],
	rawConfig: AttemptChartConfig,
	mode: AttemptChartMode = 'range',
	topicColors?: ReadonlyMap<string, string>
): AttemptChartData {
	const config = normalizeAttemptConfig(mode === 'day' ? { ...rawConfig, x: 'attempt' } : rawConfig)
	const sorted = [...attempts].sort(byTime)
	const topics = topicCategories(sorted, topicColors)
	const tests = testCategories(sorted)
	const percent = PERCENT_METRICS.includes(config.y)
	const valueLabel = yLabel(config.x, config.y)
	const single: ChartSeries[] = [{ key: VALUE_KEY, label: valueLabel, color: VALUE_COLOR }]
	const base = { percent, valueLabel, config }

	const colorOf = (attempt: ProgressAttempt): Category | null => {
		if (config.color === 'topic') return topics.get(attempt.topicSlug) ?? null
		if (config.color === 'test') return tests.get(attempt.testId) ?? null
		if (config.color === 'result') {
			return attempt.passed
				? { key: 'passed', label: 'Пройден', color: PASSED_COLOR }
				: { key: 'failed', label: 'Не пройден', color: FAILED_COLOR }
		}
		return null
	}

	const legendOf = (rows: readonly AttemptChartRow[], categoryOf: (row: AttemptChartRow) => Category | null) => {
		const seen = new Map<string, Category>()
		for (const row of rows) {
			const category = categoryOf(row)
			if (category && !seen.has(category.key)) seen.set(category.key, category)
		}
		return [...seen.values()]
	}

	if (config.x === 'attempt') {
		const byKey = new Map(sorted.map((attempt) => [attempt.attemptId, attempt]))
		const rows: AttemptChartRow[] = []
		const days = [...groupBy(sorted, (attempt) => bucketOf(attempt.submittedAt, 'day')).values()]
		days.forEach((day, dayIndex) => {
			if (mode === 'range' && config.type === 'bar' && dayIndex > 0) {
				rows.push({ ...baseRow(`gap-${dayIndex}`, '', '', '', ''), gap: true, [VALUE_KEY]: null })
			}
			const labelIndex = Math.floor((day.length - 1) / 2)
			day.forEach((attempt, index) => {
				const date = new Date(attempt.submittedAt)
				const tick =
					mode === 'day' ? format(date, 'HH:mm') : index === labelIndex ? format(date, 'd MMM', { locale: ru }) : ''
				rows.push({
					...baseRow(
						attempt.attemptId,
						tick,
						attempt.testTitle,
						format(date, 'd MMMM yyyy, HH:mm', { locale: ru }),
						attempt.testTitle
					),
					fill: colorOf(attempt)?.color ?? null,
					count: 1,
					earned: attempt.earnedPoints,
					total: attempt.totalPoints,
					[VALUE_KEY]: metricOf([attempt], config.y),
				})
			})
		})
		const legend = legendOf(rows, (row) => {
			const attempt = byKey.get(row.key)
			return attempt ? colorOf(attempt) : null
		})
		return { ...base, rows, series: single, legend, categorical: true }
	}

	if (config.x === 'topic' || config.x === 'test') {
		const groups = groupBy(sorted, (attempt) => (config.x === 'topic' ? attempt.topicSlug : attempt.testId))
		const categories = config.x === 'topic' ? topics : tests
		const entries = [...groups.entries()].sort((a, b) =>
			compareTitles(categories.get(a[0])?.label ?? a[0], categories.get(b[0])?.label ?? b[0])
		)
		const fillOf = (id: string, group: ProgressAttempt[]): Category | null => {
			if (config.color === 'none') return null
			if (config.x === 'topic' || config.color === 'test') return categories.get(id) ?? null
			const first = group[0]
			return first ? (topics.get(first.topicSlug) ?? null) : null
		}
		const rows = entries.map(([id, group]) => {
			const label = categories.get(id)?.label ?? id
			return {
				...baseRow(id, short(label), label, `${group.length} ${attemptsWord(group.length)}`, label),
				fill: fillOf(id, group)?.color ?? null,
				count: group.length,
				[VALUE_KEY]: metricOf(group, config.y),
			}
		})
		const legend =
			config.x === 'test' && config.color === 'topic'
				? legendOf(rows, (row) => {
						const group = groups.get(row.key)
						return group ? fillOf(row.key, group) : null
					})
				: []
		return { ...base, rows, series: single, legend, categorical: true }
	}

	const x = config.x
	const grouped = groupBy(sorted, (attempt) => bucketOf(attempt.submittedAt, x))
	const buckets = fillBuckets([...grouped.keys()], x).map((bucket) => [bucket, grouped.get(bucket) ?? []] as const)
	const splitBy = config.color === 'topic' ? topics : config.color === 'test' ? tests : null
	const seriesKeyOf = (attempt: ProgressAttempt) =>
		config.color === 'topic'
			? (topics.get(attempt.topicSlug)?.key ?? topicConfigKey(attempt.topicSlug))
			: (tests.get(attempt.testId)?.key ?? attempt.testId)
	const series: ChartSeries[] = splitBy
		? [...splitBy.values()].map((category) => ({ key: category.key, label: category.label, color: category.color }))
		: single
	const rows = buckets.map(([bucket, group]) => {
		const texts = bucketTexts(bucket, x)
		const row: AttemptChartRow = {
			...baseRow(bucket, texts.tick, texts.title, `${group.length} ${attemptsWord(group.length)}`, texts.title),
			count: group.length,
		}
		if (!splitBy) {
			row[VALUE_KEY] = metricOf(group, config.y)
			return row
		}
		const parts = groupBy(group, seriesKeyOf)
		for (const item of series) row[item.key] = metricOf(parts.get(item.key) ?? [], config.y)
		return row
	})
	return { ...base, rows, series, legend: splitBy ? series : [], categorical: !isTimeAxis(x) }
}

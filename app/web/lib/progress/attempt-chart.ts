import { endOfDay, format, isValid, parse, parseISO, startOfDay, subDays, subMonths } from 'date-fns'
import { ru } from 'date-fns/locale'

export type ProgressAttempt = {
	attemptId: string
	testId: string
	testTitle: string
	testSlug: string
	topicSlug: string
	topicTitle: string | null
	submittedAt: string
	earnedPoints: number
	totalPoints: number
	scorePercentage: number
	passed: boolean
}

export type TopicColor = {
	slug: string
	key: string
	title: string
	color: string
}

export const TOPIC_PALETTE = [
	'var(--chart-1)',
	'var(--chart-2)',
	'var(--chart-3)',
	'var(--chart-4)',
	'var(--chart-5)',
	'var(--chart-6)',
	'var(--chart-7)',
	'var(--chart-8)',
	'var(--chart-9)',
	'var(--chart-10)',
] as const

const SAFE_KEY = /^[a-z0-9_-]+$/

function fnv1a(value: string): number {
	let hash = 0x811c9dc5
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index)
		hash = Math.imul(hash, 0x01000193) >>> 0
	}
	return hash >>> 0
}

export function topicConfigKey(slug: string): string {
	if (SAFE_KEY.test(slug)) return `topic-${slug}`
	return `topic-x${fnv1a(slug).toString(36)}`
}

export function assignTopicColors(items: { topicSlug: string; topicTitle: string | null }[]): TopicColor[] {
	const titles = new Map<string, string>()
	for (const item of items) {
		if (!titles.has(item.topicSlug)) titles.set(item.topicSlug, item.topicTitle ?? item.topicSlug)
	}
	const slugs = Array.from(titles.keys()).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
	return slugs.map((slug, index) => ({
		slug,
		key: topicConfigKey(slug),
		title: titles.get(slug) ?? slug,
		color: TOPIC_PALETTE[index % TOPIC_PALETTE.length],
	}))
}

export function buildTopicChartConfig(colors: TopicColor[]): Record<string, { label: string; color: string }> {
	const config: Record<string, { label: string; color: string }> = {}
	for (const topic of colors) {
		config[topic.key] = { label: topic.title, color: topic.color }
	}
	return config
}

export type AttemptBarRow = {
	kind: 'attempt' | 'gap'
	key: string
	percent: number | null
	testTitle: string
	topicTitle: string
	topicKey: string
	fill: string
	submittedAt: string
	earnedPoints: number
	totalPoints: number
	tick: string
}

export type ChartMode = 'range' | 'day'

function clampPercent(value: number): number {
	if (!Number.isFinite(value)) return 0
	return Math.min(100, Math.max(0, value))
}

function localDayKey(iso: string): string {
	return format(new Date(iso), 'yyyy-MM-dd')
}

function attemptRow(attempt: ProgressAttempt, topics: Map<string, TopicColor>, tick: string): AttemptBarRow {
	const topic = topics.get(attempt.topicSlug)
	const topicKey = topic?.key ?? topicConfigKey(attempt.topicSlug)
	return {
		kind: 'attempt',
		key: attempt.attemptId,
		percent: clampPercent(attempt.scorePercentage),
		testTitle: attempt.testTitle,
		topicTitle: topic?.title ?? attempt.topicTitle ?? attempt.topicSlug,
		topicKey,
		fill: `var(--color-${topicKey})`,
		submittedAt: attempt.submittedAt,
		earnedPoints: attempt.earnedPoints,
		totalPoints: attempt.totalPoints,
		tick,
	}
}

function gapRow(day: string): AttemptBarRow {
	return {
		kind: 'gap',
		key: `gap-${day}`,
		percent: null,
		testTitle: '',
		topicTitle: '',
		topicKey: '',
		fill: '',
		submittedAt: '',
		earnedPoints: 0,
		totalPoints: 0,
		tick: '',
	}
}

export function buildAttemptBars(attempts: ProgressAttempt[], colors: TopicColor[], mode: ChartMode): AttemptBarRow[] {
	const topics = new Map(colors.map((topic) => [topic.slug, topic]))
	const sorted = [...attempts].sort((a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime())

	if (mode === 'day') {
		return sorted.map((attempt) => attemptRow(attempt, topics, format(new Date(attempt.submittedAt), 'HH:mm')))
	}

	const days: { day: string; attempts: ProgressAttempt[] }[] = []
	for (const attempt of sorted) {
		const day = localDayKey(attempt.submittedAt)
		const last = days[days.length - 1]
		if (last && last.day === day) last.attempts.push(attempt)
		else days.push({ day, attempts: [attempt] })
	}

	const rows: AttemptBarRow[] = []
	days.forEach((group, groupIndex) => {
		if (groupIndex > 0) rows.push(gapRow(group.day))
		const labelIndex = Math.floor((group.attempts.length - 1) / 2)
		group.attempts.forEach((attempt, index) => {
			const tick = index === labelIndex ? format(new Date(attempt.submittedAt), 'd MMM', { locale: ru }) : ''
			rows.push(attemptRow(attempt, topics, tick))
		})
	})
	return rows
}

export function barMinPointSize(value: number | null | undefined): number {
	return value === null || value === undefined ? 0 : 3
}

export function chartMinWidth(rowCount: number): number {
	return rowCount * 36
}

const CHAR_PX = 7
const PAD_PX = 4
const WIDE_BAR_PX = 72
const MIN_INSIDE_CHARS = 4
const LINE_PX = 14

export type BarLabel = {
	text: string
	vertical: boolean
	placement: 'inside' | 'above'
}

function capacityFor(space: number): number {
	return Math.floor((space - 2 * PAD_PX) / CHAR_PX)
}

function truncateLabel(text: string, capacity: number): string {
	if (text.length <= capacity) return text
	return `${text.slice(0, capacity - 1).trimEnd()}…`
}

export function fitBarLabel(
	text: string | null | undefined,
	{ barWidth, barHeight, spaceAbove = 0 }: { barWidth: number; barHeight: number; spaceAbove?: number }
): BarLabel | null {
	if (!text) return null

	let vertical: boolean
	let placement: BarLabel['placement']
	let capacity: number

	if (barWidth >= WIDE_BAR_PX) {
		vertical = false
		capacity = capacityFor(barWidth)
		placement = barHeight >= LINE_PX + 2 * PAD_PX ? 'inside' : 'above'
	} else {
		vertical = true
		const insideCapacity = capacityFor(barHeight)
		if (insideCapacity >= MIN_INSIDE_CHARS) {
			placement = 'inside'
			capacity = insideCapacity
		} else {
			placement = 'above'
			capacity = capacityFor(spaceAbove)
		}
	}

	if (!Number.isFinite(capacity) || capacity < 1) return null
	return { text: truncateLabel(text, capacity), vertical, placement }
}

export function legendTopics(rows: AttemptBarRow[], colors: TopicColor[]): TopicColor[] {
	const present = new Set(rows.filter((row) => row.kind === 'attempt').map((row) => row.topicKey))
	return colors.filter((topic) => present.has(topic.key))
}

export type PeriodValue = 'week' | 'month' | '3months' | '6months' | 'all' | 'custom'

export const PERIOD_PRESETS: { value: Exclude<PeriodValue, 'custom'>; label: string }[] = [
	{ value: 'week', label: 'Неделя' },
	{ value: 'month', label: 'Месяц' },
	{ value: '3months', label: '3 месяца' },
	{ value: '6months', label: 'Полгода' },
	{ value: 'all', label: 'Всё время' },
]

export const DEFAULT_PERIOD: PeriodValue = 'month'

const PERIOD_VALUES: readonly string[] = ['week', 'month', '3months', '6months', 'all', 'custom']

export function parsePeriod(value: string | null | undefined): PeriodValue {
	return value && PERIOD_VALUES.includes(value) ? (value as PeriodValue) : DEFAULT_PERIOD
}

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function parseDayParam(value: string | null | undefined): Date | null {
	if (!value || !DAY_PATTERN.test(value)) return null
	const date = parse(value, 'yyyy-MM-dd', new Date())
	return isValid(date) ? date : null
}

export function parseDateParam(value: string | null | undefined): Date | null {
	if (!value) return null
	const date = parseISO(value)
	return isValid(date) ? date : null
}

export type PeriodBounds = {
	start: Date | null
	end: Date | null
}

export function resolvePeriodBounds(
	{ period, from, to, day }: { period: PeriodValue; from?: string | null; to?: string | null; day?: string | null },
	now: Date
): PeriodBounds {
	const selectedDay = parseDayParam(day)
	if (selectedDay) return { start: startOfDay(selectedDay), end: endOfDay(selectedDay) }

	switch (period) {
		case 'week':
			return { start: startOfDay(subDays(now, 7)), end: null }
		case 'month':
			return { start: startOfDay(subMonths(now, 1)), end: null }
		case '3months':
			return { start: startOfDay(subMonths(now, 3)), end: null }
		case '6months':
			return { start: startOfDay(subMonths(now, 6)), end: null }
		case 'custom': {
			const start = parseDateParam(from)
			const end = parseDateParam(to)
			return { start: start ? startOfDay(start) : null, end: end ? endOfDay(end) : null }
		}
		default:
			return { start: null, end: null }
	}
}

export function filterAttemptsByPeriod<T extends { submittedAt: string }>(attempts: T[], bounds: PeriodBounds): T[] {
	const start = bounds.start?.getTime() ?? null
	const end = bounds.end?.getTime() ?? null
	if (start === null && end === null) return attempts
	return attempts.filter((attempt) => {
		const time = new Date(attempt.submittedAt).getTime()
		if (start !== null && time < start) return false
		if (end !== null && time > end) return false
		return true
	})
}

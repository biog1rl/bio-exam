export type ChartType = 'bar' | 'line' | 'area'
export type AttemptX = 'attempt' | 'day' | 'week' | 'month' | 'topic' | 'test'
export type AttemptY = 'best' | 'average' | 'last' | 'points' | 'count' | 'passRate'
export type AttemptColor = 'none' | 'topic' | 'test' | 'result'
export type AttemptPeriod = 'week' | 'month' | '3months' | '6months' | 'all'
export type AttemptLabels = 'none' | 'value' | 'name'
export type ContentSeries = 'published' | 'drafts' | 'questions'
export type ActivityMetric = 'attempts' | 'averageScore' | 'both'
export type ActivityPeriod = 'week' | 'month'

export type AttemptChartConfig = {
	type: ChartType
	x: AttemptX
	y: AttemptY
	color: AttemptColor
	period: AttemptPeriod
	legend: boolean
	labels: AttemptLabels
}

export type ContentChartConfig = {
	type: ChartType
	series: ContentSeries[]
	stacked: boolean
	limit: number | null
	legend: boolean
	labels: 'none' | 'value'
}

export type ActivityChartConfig = {
	type: ChartType
	metric: ActivityMetric
	period: ActivityPeriod
	legend: boolean
	labels: 'none' | 'value'
}

export type ChartConfigs = {
	testResults: AttemptChartConfig
	studentProgress: AttemptChartConfig
	profileAttempts: AttemptChartConfig
	content: ContentChartConfig
	activity: ActivityChartConfig
}

export type ChartId = keyof ChartConfigs
export type AttemptChartId = 'testResults' | 'studentProgress' | 'profileAttempts'

export const DEFAULT_CHART_CONFIGS: ChartConfigs = {
	testResults: { type: 'area', x: 'day', y: 'best', color: 'none', period: 'month', legend: false, labels: 'none' },
	studentProgress: {
		type: 'bar',
		x: 'attempt',
		y: 'best',
		color: 'topic',
		period: 'month',
		legend: true,
		labels: 'name',
	},
	profileAttempts: {
		type: 'bar',
		x: 'attempt',
		y: 'best',
		color: 'topic',
		period: 'month',
		legend: true,
		labels: 'name',
	},
	content: {
		type: 'bar',
		series: ['published', 'drafts', 'questions'],
		stacked: true,
		limit: 8,
		legend: true,
		labels: 'none',
	},
	activity: { type: 'bar', metric: 'attempts', period: 'month', legend: false, labels: 'none' },
}

export type ChartDefinition = {
	id: ChartId
	title: string
	place: string
	audience: string
}

export const CHART_DEFINITIONS: readonly ChartDefinition[] = [
	{ id: 'content', title: 'Публикации и наполнение', place: 'Главная', audience: 'учитель и администратор' },
	{ id: 'activity', title: 'Активность учеников', place: 'Главная', audience: 'учитель и администратор' },
	{ id: 'studentProgress', title: 'Пройденные тесты', place: 'Главная', audience: 'ученик' },
	{ id: 'testResults', title: 'Мои результаты', place: 'Страница теста', audience: 'ученик' },
	{ id: 'profileAttempts', title: 'Попытки ученика', place: 'Профиль ученика', audience: 'учитель и администратор' },
]

export const CHART_IDS: readonly ChartId[] = CHART_DEFINITIONS.map((chart) => chart.id)

export function isAttemptChart(id: ChartId): id is AttemptChartId {
	return id === 'testResults' || id === 'studentProgress' || id === 'profileAttempts'
}

export type Option<V extends string> = { value: V; label: string }

export const CHART_TYPE_OPTIONS: readonly Option<ChartType>[] = [
	{ value: 'bar', label: 'Столбцы' },
	{ value: 'line', label: 'Линия' },
	{ value: 'area', label: 'Область' },
]

export const ATTEMPT_X_OPTIONS: readonly Option<AttemptX>[] = [
	{ value: 'attempt', label: 'Каждая попытка' },
	{ value: 'day', label: 'По дням' },
	{ value: 'week', label: 'По неделям' },
	{ value: 'month', label: 'По месяцам' },
	{ value: 'topic', label: 'По темам' },
	{ value: 'test', label: 'По тестам' },
]

export const ATTEMPT_Y_OPTIONS: readonly Option<AttemptY>[] = [
	{ value: 'best', label: 'Лучший результат, %' },
	{ value: 'average', label: 'Средний результат, %' },
	{ value: 'last', label: 'Последний результат, %' },
	{ value: 'points', label: 'Баллы' },
	{ value: 'count', label: 'Число попыток' },
	{ value: 'passRate', label: 'Доля пройденных, %' },
]

export const ATTEMPT_COLOR_OPTIONS: readonly Option<AttemptColor>[] = [
	{ value: 'none', label: 'Один цвет' },
	{ value: 'topic', label: 'По теме' },
	{ value: 'test', label: 'По тесту' },
	{ value: 'result', label: 'Пройден или нет' },
]

export const ATTEMPT_PERIOD_OPTIONS: readonly Option<AttemptPeriod>[] = [
	{ value: 'week', label: 'Неделя' },
	{ value: 'month', label: 'Месяц' },
	{ value: '3months', label: '3 месяца' },
	{ value: '6months', label: 'Полгода' },
	{ value: 'all', label: 'Всё время' },
]

export const ATTEMPT_LABEL_OPTIONS: readonly Option<AttemptLabels>[] = [
	{ value: 'none', label: 'Без подписей' },
	{ value: 'value', label: 'Значения' },
	{ value: 'name', label: 'Названия' },
]

export const CONTENT_SERIES_OPTIONS: readonly Option<ContentSeries>[] = [
	{ value: 'published', label: 'Опубликованные тесты' },
	{ value: 'drafts', label: 'Черновики' },
	{ value: 'questions', label: 'Вопросы' },
]

export const CONTENT_LIMIT_OPTIONS: readonly Option<string>[] = [
	{ value: '5', label: '5 тем' },
	{ value: '8', label: '8 тем' },
	{ value: '12', label: '12 тем' },
	{ value: 'all', label: 'Все темы' },
]

export const ACTIVITY_METRIC_OPTIONS: readonly Option<ActivityMetric>[] = [
	{ value: 'attempts', label: 'Число попыток' },
	{ value: 'averageScore', label: 'Средний результат, %' },
	{ value: 'both', label: 'Попытки и средний результат' },
]

export const ACTIVITY_PERIOD_OPTIONS: readonly Option<ActivityPeriod>[] = [
	{ value: 'week', label: 'Неделя' },
	{ value: 'month', label: 'Месяц' },
]

export const VALUE_LABEL_OPTIONS: readonly Option<'none' | 'value'>[] = [
	{ value: 'none', label: 'Без подписей' },
	{ value: 'value', label: 'Значения' },
]

const TIME_X: readonly AttemptX[] = ['day', 'week', 'month']

export function isTimeAxis(x: AttemptX): boolean {
	return TIME_X.includes(x)
}

export function allowedY(x: AttemptX): readonly AttemptY[] {
	return x === 'attempt' ? ['best', 'points'] : ['best', 'average', 'last', 'points', 'count', 'passRate']
}

export function allowedColors(x: AttemptX): readonly AttemptColor[] {
	if (x === 'attempt') return ['none', 'topic', 'test', 'result']
	if (x === 'topic') return ['none', 'topic']
	if (x === 'test') return ['none', 'topic', 'test']
	return ['none', 'topic', 'test']
}

export function allowedLabels(x: AttemptX): readonly AttemptLabels[] {
	return isTimeAxis(x) ? ['none', 'value'] : ['none', 'value', 'name']
}

export function yLabel(x: AttemptX, y: AttemptY): string {
	if (x === 'attempt' && y === 'best') return 'Результат, %'
	return ATTEMPT_Y_OPTIONS.find((option) => option.value === y)?.label ?? y
}

export function normalizeAttemptConfig(config: AttemptChartConfig): AttemptChartConfig {
	const y = allowedY(config.x).includes(config.y) ? config.y : 'best'
	const color = allowedColors(config.x).includes(config.color) ? config.color : 'none'
	const labels = allowedLabels(config.x).includes(config.labels) ? config.labels : 'none'
	return { ...config, y, color, labels }
}

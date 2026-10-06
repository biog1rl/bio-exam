import { format, startOfDay, subDays } from 'date-fns'
import { ru } from 'date-fns/locale'

import type { ActivityChartConfig, ActivityPeriod, ContentChartConfig, ContentSeries } from './config'

export type SeriesMeta = { key: string; label: string; color: string; yAxis?: 'left' | 'right'; type?: 'bar' | 'line' }

export type DashboardRow = {
	key: string
	tick: string
	title: string
	subtitle: string
	[series: string]: string | number | null
}

export const CONTENT_SERIES_META: Record<ContentSeries, SeriesMeta> = {
	published: { key: 'published', label: 'Опубликовано', color: 'var(--chart-1)' },
	drafts: { key: 'drafts', label: 'Черновики', color: 'var(--chart-2)' },
	questions: { key: 'questions', label: 'Вопросы', color: 'var(--chart-3)' },
}

export type ContentTopic = { id: string; title: string }
export type ContentTest = { topicId: string; isPublished: boolean; questionsCount?: number | null }

const TICK_CHARS = 18

function short(text: string): string {
	return text.length > TICK_CHARS ? `${text.slice(0, TICK_CHARS - 1).trimEnd()}…` : text
}

export function buildContentRows(
	topics: readonly ContentTopic[],
	tests: readonly ContentTest[],
	config: Pick<ContentChartConfig, 'limit'>
): DashboardRow[] {
	const shown = config.limit === null ? topics : topics.slice(0, config.limit)
	return shown.map((topic) => {
		const topicTests = tests.filter((test) => test.topicId === topic.id)
		const published = topicTests.filter((test) => test.isPublished).length
		const questions = topicTests.reduce((sum, test) => sum + (test.questionsCount ?? 0), 0)
		return {
			key: topic.id,
			tick: short(topic.title),
			title: topic.title,
			subtitle: '',
			published,
			drafts: topicTests.length - published,
			questions,
		}
	})
}

export function contentSeries(config: Pick<ContentChartConfig, 'series'>): SeriesMeta[] {
	const order: ContentSeries[] = ['published', 'drafts', 'questions']
	return order.filter((key) => config.series.includes(key)).map((key) => CONTENT_SERIES_META[key])
}

export type ActivityDay = { date: string; attempts: number; averageScore: number | null }

const PERIOD_DAYS: Record<ActivityPeriod, number> = { week: 7, month: 30 }

export function buildActivityRows(days: readonly ActivityDay[], period: ActivityPeriod, now: Date): DashboardRow[] {
	const byDate = new Map(days.map((day) => [day.date.slice(0, 10), day]))
	const count = PERIOD_DAYS[period]
	const today = startOfDay(now)
	return Array.from({ length: count }, (_, index) => {
		const date = subDays(today, count - 1 - index)
		const key = format(date, 'yyyy-MM-dd')
		const day = byDate.get(key)
		return {
			key,
			tick: format(date, 'd MMM', { locale: ru }),
			title: format(date, 'd MMMM yyyy', { locale: ru }),
			subtitle: '',
			attempts: day?.attempts ?? 0,
			averageScore: day && day.averageScore !== null ? Math.round(day.averageScore) : null,
		}
	})
}

export function activitySeries(config: Pick<ActivityChartConfig, 'metric' | 'type'>): SeriesMeta[] {
	const attempts: SeriesMeta = { key: 'attempts', label: 'Попытки', color: 'var(--chart-1)', yAxis: 'left' }
	const average: SeriesMeta = { key: 'averageScore', label: 'Средний результат, %', color: 'var(--chart-3)' }
	if (config.metric === 'attempts') return [attempts]
	if (config.metric === 'averageScore') return [{ ...average, yAxis: 'left' }]
	return [attempts, { ...average, yAxis: 'right', type: config.type === 'bar' ? 'line' : undefined }]
}

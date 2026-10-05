import { MalformedBodyError, request, type RequestOutcome } from '@/lib/http/request'
import { fetcherWith } from '@/lib/http/swr'

export type ChartRange = 'week' | 'month' | 'all'

export type ChartRangeSetting = { value: ChartRange }

const CHART_RANGES: readonly ChartRange[] = ['week', 'month', 'all']

export const settingsKeys = {
	chartRange: () => '/api/settings/chart-default-range',
}

function isChartRange(value: unknown): value is ChartRange {
	return typeof value === 'string' && (CHART_RANGES as readonly string[]).includes(value)
}

export function parseChartRange(body: unknown): ChartRangeSetting {
	if (!body || typeof body !== 'object') throw new MalformedBodyError()
	const value = (body as Record<string, unknown>).value
	if (!isChartRange(value)) throw new MalformedBodyError()
	return { value }
}

export const chartRangeFetcher = fetcherWith(parseChartRange)

export function getChartRange(): Promise<RequestOutcome<ChartRangeSetting>> {
	return request(settingsKeys.chartRange(), { parse: parseChartRange })
}

export function saveChartRange(value: ChartRange): Promise<RequestOutcome<ChartRangeSetting>> {
	return request(settingsKeys.chartRange(), {
		method: 'PUT',
		json: { value },
		parse: parseChartRange,
		fallbackMessage: 'Ошибка сохранения',
	})
}

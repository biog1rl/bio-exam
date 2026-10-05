import { MalformedBodyError, request, type RequestOutcome } from '@/lib/http/request'
import { fetcherWith } from '@/lib/http/swr'

export type ChartRange = 'week' | 'month' | 'all'

export type ChartRangeSetting = { value: ChartRange }

export type SidebarTarget = '_self' | '_blank'

export type SidebarItem = {
	id: string
	title: string
	url: string
	icon: string
	target: SidebarTarget
	order: number
	isActive: boolean
}

export type SidebarItemInput = { title: string; url: string; icon: string; target: SidebarTarget }

export type SidebarItemOrder = { id: string; order: number }

const CHART_RANGES: readonly ChartRange[] = ['week', 'month', 'all']

export const settingsKeys = {
	chartRange: () => '/api/settings/chart-default-range',
	sidebar: () => '/api/sidebar' as const,
	sidebarAll: () => '/api/sidebar/all' as const,
}

function sidebarItemPath(id: string): string {
	return `${settingsKeys.sidebar()}/${encodeURIComponent(id)}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
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

export function saveChartRange(value: ChartRange): Promise<RequestOutcome<ChartRangeSetting>> {
	return request(settingsKeys.chartRange(), {
		method: 'PUT',
		json: { value },
		parse: parseChartRange,
		fallbackMessage: 'Ошибка сохранения',
	})
}

export function parseSidebarItems(body: unknown): SidebarItem[] {
	if (!isRecord(body) || !Array.isArray(body.items)) throw new MalformedBodyError()
	return body.items as SidebarItem[]
}

export function getSidebarItems(signal?: AbortSignal): Promise<RequestOutcome<SidebarItem[]>> {
	return request(settingsKeys.sidebar(), { parse: parseSidebarItems, signal })
}

export function getAllSidebarItems(): Promise<RequestOutcome<SidebarItem[]>> {
	return request(settingsKeys.sidebarAll(), { parse: parseSidebarItems })
}

export function saveSidebarItem(
	id: string | null,
	body: SidebarItemInput | (SidebarItemInput & { order: number })
): Promise<RequestOutcome<unknown>> {
	if (id) {
		return request(sidebarItemPath(id), { method: 'PUT', json: body, fallbackMessage: 'Ошибка сохранения' })
	}
	return request(settingsKeys.sidebar(), { method: 'POST', json: body, fallbackMessage: 'Ошибка сохранения' })
}

export function setSidebarItemActive(id: string, isActive: boolean): Promise<RequestOutcome<unknown>> {
	return request(sidebarItemPath(id), {
		method: 'PUT',
		json: { isActive },
		fallbackMessage: 'Ошибка изменения видимости',
	})
}

export function reorderSidebarItems(items: SidebarItemOrder[]): Promise<RequestOutcome<unknown>> {
	return request(`${settingsKeys.sidebar()}/reorder`, {
		method: 'PATCH',
		json: { items },
		fallbackMessage: 'Ошибка обновления порядка',
	})
}

export function deleteSidebarItem(id: string): Promise<RequestOutcome<unknown>> {
	return request(sidebarItemPath(id), { method: 'DELETE', fallbackMessage: 'Ошибка удаления' })
}

import useSWR from 'swr'

import { MalformedBodyError, request, type RequestOutcome } from '@/lib/http/request'
import { fetcherWith } from '@/lib/http/swr'
import { isRecord } from '@/lib/utils/is-record'

import { CHART_IDS, DEFAULT_CHART_CONFIGS, type ChartConfigs } from './config'

export type ChartSettings = { configs: ChartConfigs; updatedAt: string | null }

export const chartsKeys = {
	settings: () => '/api/settings/charts' as const,
}

function parseChartSettings(body: unknown): ChartSettings {
	if (!isRecord(body) || !isRecord(body.configs)) throw new MalformedBodyError()
	const configs = body.configs
	for (const id of CHART_IDS) {
		if (!isRecord(configs[id]) || typeof configs[id].type !== 'string') throw new MalformedBodyError()
	}
	const updatedAt = typeof body.updatedAt === 'string' ? body.updatedAt : null
	return { configs: configs as unknown as ChartConfigs, updatedAt }
}

export const chartSettingsFetcher = fetcherWith(parseChartSettings)

export function saveChartSettings(configs: Partial<ChartConfigs>): Promise<RequestOutcome<ChartSettings>> {
	return request(chartsKeys.settings(), {
		method: 'PUT',
		json: { configs },
		parse: parseChartSettings,
		fallbackMessage: 'Не удалось сохранить настройки графиков',
	})
}

export function useChartSettingsState(): { configs: ChartConfigs; loaded: boolean } {
	const { data, error } = useSWR(chartsKeys.settings(), chartSettingsFetcher, {
		revalidateOnFocus: false,
		shouldRetryOnError: false,
	})
	return { configs: data?.configs ?? DEFAULT_CHART_CONFIGS, loaded: data !== undefined || error !== undefined }
}

export function useChartConfigs(): ChartConfigs {
	return useChartSettingsState().configs
}

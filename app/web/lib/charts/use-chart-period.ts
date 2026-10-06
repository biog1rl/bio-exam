'use client'

import { useSearchParams } from 'next/navigation'

import { replaceSearchParams } from '@/lib/navigation/search-params'
import { PERIOD_PRESETS, parseDateParam, type PeriodValue } from '@/lib/progress/attempt-chart'

const PERIOD_VALUES: readonly string[] = [...PERIOD_PRESETS.map((preset) => preset.value), 'custom']

export function useChartPeriod(fallback: PeriodValue) {
	const params = useSearchParams()
	const range = params?.get('range') ?? ''
	const from = params?.get('from') ?? ''
	const to = params?.get('to') ?? ''
	const day = params?.get('day') ?? ''
	const period = PERIOD_VALUES.includes(range) ? (range as PeriodValue) : fallback

	return {
		period,
		explicit: range !== '',
		from,
		to,
		fromDate: parseDateParam(from),
		toDate: parseDateParam(to),
		day,
		choosePreset: (value: PeriodValue) => replaceSearchParams({ range: value, from: null, to: null, day: null }),
		chooseRange: (start: Date, end: Date) =>
			replaceSearchParams({ range: 'custom', from: start.toISOString(), to: end.toISOString(), day: null }),
		chooseDay: (value: string | null) => replaceSearchParams({ day: value }),
	}
}

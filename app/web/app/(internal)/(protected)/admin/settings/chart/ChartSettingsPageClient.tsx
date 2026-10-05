'use client'

import { useState, useEffect, useRef } from 'react'

import { toast } from 'sonner'
import useSWR from 'swr'

import { LoadErrorAlert } from '@/components/feedback/LoadErrorAlert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { failureMessage } from '@/lib/http/errors'
import { chartRangeFetcher, saveChartRange, settingsKeys, type ChartRange } from '@/lib/settings/api'

const RANGE_OPTIONS: { value: ChartRange; label: string }[] = [
	{ value: 'week', label: 'Неделя' },
	{ value: 'month', label: 'Месяц' },
	{ value: 'all', label: 'Всё время' },
]

export function ChartSettingsPageClient() {
	const { data, error, mutate, isLoading } = useSWR(settingsKeys.chartRange(), chartRangeFetcher, {
		revalidateOnFocus: false,
	})

	const titleRef = useRef<HTMLDivElement>(null)
	const currentValue = data?.value ?? 'week'
	const [selected, setSelected] = useState<ChartRange>(currentValue)
	const [saving, setSaving] = useState(false)

	useEffect(() => {
		if (data?.value) {
			setSelected(data.value)
		}
	}, [data?.value])

	const handleSave = async () => {
		setSaving(true)
		const outcome = await saveChartRange(selected)
		setSaving(false)
		if (!outcome.ok) {
			const message = failureMessage(outcome, 'Ошибка сохранения')
			if (message) toast.error(message)
			return
		}
		await mutate(outcome.data)
		toast.success('Настройки сохранены')
	}

	const loadFailed = error !== undefined && data === undefined

	return (
		<Card>
			<CardHeader>
				<CardTitle ref={titleRef} tabIndex={-1}>
					Диапазон графика по умолчанию
				</CardTitle>
				<CardDescription>Применяется на всех страницах теста, если студент не выбрал свой диапазон</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				{loadFailed ? (
					<LoadErrorAlert
						title="Не удалось загрузить настройку"
						error={error}
						onRetry={() => mutate()}
						focusTarget={titleRef}
					/>
				) : null}

				{!loadFailed && isLoading && <div>Загрузка…</div>}

				{!loadFailed && !isLoading && (
					<>
						<Select value={selected} onValueChange={(v) => setSelected(v as ChartRange)}>
							<SelectTrigger className="w-48">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{RANGE_OPTIONS.map((opt) => (
									<SelectItem key={opt.value} value={opt.value}>
										{opt.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>

						<Button onClick={handleSave} disabled={saving || selected === currentValue}>
							Сохранить
						</Button>
					</>
				)}
			</CardContent>
		</Card>
	)
}

'use client'

import { useState, useEffect } from 'react'

import { toast } from 'sonner'
import useSWR from 'swr'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { apiFetch } from '@/lib/api-fetch'
import { fetcher } from '@/lib/fetcher'

type ChartRange = 'week' | 'month' | 'all'

const RANGE_OPTIONS: { value: ChartRange; label: string }[] = [
	{ value: 'week', label: 'Неделя' },
	{ value: 'month', label: 'Месяц' },
	{ value: 'all', label: 'Всё время' },
]

export function ChartSettingsPageClient() {
	const { data, mutate, isLoading } = useSWR<{ value: ChartRange }>('/api/settings/chart-default-range', fetcher)

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
		try {
			const res = await apiFetch('/api/settings/chart-default-range', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ value: selected }),
			})
			if (!res.ok) throw new Error(await res.text())
			await mutate({ value: selected })
			toast.success('Настройки сохранены')
		} catch {
			toast.error('Ошибка сохранения')
		} finally {
			setSaving(false)
		}
	}

	return (
		<div className="p-6">
			<Card>
				<CardHeader>
					<CardTitle>Диапазон графика по умолчанию</CardTitle>
					<CardDescription>Применяется на всех страницах теста, если студент не выбрал свой диапазон</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					{isLoading && <div>Загрузка…</div>}

					{!isLoading && (
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
		</div>
	)
}

'use client'

import { useMemo, useRef, useState } from 'react'

import { ChevronsUpDown, RotateCcw } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import useSWR from 'swr'

import { LoadErrorAlert } from '@/components/feedback/LoadErrorAlert'
import { PageHeader } from '@/components/page/PageHeader'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { chartSettingsFetcher, chartsKeys, saveChartSettings } from '@/lib/charts/api'
import {
	CHART_DEFINITIONS,
	CHART_IDS,
	DEFAULT_CHART_CONFIGS,
	isAttemptChart,
	type ChartConfigs,
	type ChartId,
} from '@/lib/charts/config'
import { failureMessage } from '@/lib/http/errors'
import { usersKeys, usersListFetcher } from '@/lib/users/api'
import { isStudentOnly } from '@/lib/users/student-card'
import { cn } from '@/lib/utils/cn'
import type { UserRow } from '@/types/users'

import { ChartPreview, type PreviewSource } from './ChartPreview'
import { ActivityChartForm, AttemptChartForm, ContentChartForm } from './ChartSettingsForm'

const PLACES = [...new Set(CHART_DEFINITIONS.map((chart) => chart.place))]

type UrlState = { chart: ChartId; source: PreviewSource; student: string | null }

function parseUrl(params: URLSearchParams | null): UrlState {
	const chart = params?.get('chart')
	const student = params?.get('student')?.trim()
	return {
		chart: CHART_IDS.includes(chart as ChartId) ? (chart as ChartId) : 'content',
		source: params?.get('source') === 'real' ? 'real' : 'demo',
		student: student ? student : null,
	}
}

function urlOf(state: UrlState): string {
	const params = new URLSearchParams()
	if (state.chart !== 'content') params.set('chart', state.chart)
	if (state.source === 'real') params.set('source', 'real')
	if (state.source === 'real' && state.student) params.set('student', state.student)
	const search = params.toString()
	return `${window.location.pathname}${search ? `?${search}` : ''}`
}

function sameConfig(a: unknown, b: unknown): boolean {
	return JSON.stringify(a) === JSON.stringify(b)
}

function displayName(user: UserRow): string {
	const full = [user.firstName ?? '', user.lastName ?? ''].join(' ').trim()
	return full || user.name || user.login
}

function StudentPicker({
	students,
	value,
	loading,
	onChange,
}: {
	students: readonly UserRow[]
	value: string | null
	loading: boolean
	onChange: (id: string) => void
}) {
	const [open, setOpen] = useState(false)
	const selected = students.find((student) => student.id === value)
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					className="h-10 min-w-0 flex-1 justify-between rounded-full bg-card tab-sm:w-56 tab-sm:flex-none"
					aria-label="Ученик для превью"
				>
					<span className="truncate">{selected ? displayName(selected) : 'Выберите ученика'}</span>
					<ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-72 max-w-[calc(100vw-2rem)] p-0">
				<Command>
					<CommandInput placeholder="Имя или логин" aria-label="Найти ученика" />
					<CommandList>
						{loading ? (
							<p role="status" className="px-3 py-6 text-center text-sm text-muted-foreground">
								Загрузка учеников…
							</p>
						) : (
							<>
								<CommandEmpty>Никого не нашли</CommandEmpty>
								<CommandGroup>
									{students.map((student) => (
										<CommandItem
											key={student.id}
											value={`${displayName(student)} ${student.login} ${student.id}`}
											onSelect={() => {
												onChange(student.id)
												setOpen(false)
											}}
										>
											<span className="min-w-0 flex-1 truncate">{displayName(student)}</span>
											<span className="text-xs text-muted-foreground">{student.login}</span>
										</CommandItem>
									))}
								</CommandGroup>
							</>
						)}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	)
}

function ChartsNav({
	current,
	dirty,
	onSelect,
}: {
	current: ChartId
	dirty: ReadonlySet<ChartId>
	onSelect: (id: ChartId) => void
}) {
	return (
		<nav
			aria-label="Графики"
			className="rounded-4xl border border-border/80 bg-card/90 p-2 shadow-sm tab:sticky tab:top-unit"
		>
			{PLACES.map((place) => (
				<div key={place} className="pb-1">
					<p className="px-3 pt-2 pb-1 text-xs font-medium text-muted-foreground">{place}</p>
					<ul className="space-y-0.5">
						{CHART_DEFINITIONS.filter((chart) => chart.place === place).map((chart) => {
							const active = chart.id === current
							return (
								<li key={chart.id}>
									<button
										type="button"
										onClick={() => onSelect(chart.id)}
										aria-current={active ? 'page' : undefined}
										className={cn(
											'flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-left text-sm transition-colors hover:bg-secondary/70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
											active && 'bg-secondary font-medium text-foreground'
										)}
									>
										<span className="min-w-0 flex-1">
											<span className="block truncate">{chart.title}</span>
											<span className="block truncate text-xs font-normal text-muted-foreground">{chart.audience}</span>
										</span>
										{dirty.has(chart.id) ? (
											<>
												<span className="size-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
												<span className="sr-only">есть изменения</span>
											</>
										) : null}
									</button>
								</li>
							)
						})}
					</ul>
				</div>
			))}
		</nav>
	)
}

export function ChartSettingsPageClient() {
	const titleRef = useRef<HTMLHeadingElement>(null)
	const searchParams = useSearchParams()
	const url = parseUrl(searchParams)
	const [now] = useState(() => new Date())
	const [drafts, setDrafts] = useState<ChartConfigs | null>(null)
	const [saving, setSaving] = useState(false)
	const { data, error, mutate } = useSWR(chartsKeys.settings(), chartSettingsFetcher, { revalidateOnFocus: false })
	const studentsQuery = useSWR(url.source === 'real' ? usersKeys.list() : null, usersListFetcher)
	const students = useMemo(
		() =>
			(studentsQuery.data?.rows ?? [])
				.filter((user) => isStudentOnly(user.roles))
				.sort((a, b) => displayName(a).localeCompare(displayName(b), 'ru')),
		[studentsQuery.data]
	)

	const saved = data?.configs
	const current = drafts ?? saved
	const dirty = useMemo(
		() => new Set(saved && current ? CHART_IDS.filter((id) => !sameConfig(current[id], saved[id])) : []),
		[current, saved]
	)
	const definition = CHART_DEFINITIONS.find((chart) => chart.id === url.chart) ?? CHART_DEFINITIONS[0]

	const updateUrl = (patch: Partial<UrlState>) => {
		window.history.replaceState(null, '', urlOf({ ...url, ...patch }))
	}

	const setConfig = <K extends ChartId>(id: K, config: ChartConfigs[K]) => {
		if (!current) return
		setDrafts({ ...current, [id]: config })
	}

	const save = async () => {
		if (!current || dirty.size === 0) return
		setSaving(true)
		const changed = Object.fromEntries([...dirty].map((id) => [id, current[id]])) as Partial<ChartConfigs>
		const outcome = await saveChartSettings(changed)
		setSaving(false)
		if (!outcome.ok) {
			const message = failureMessage(outcome, 'Не удалось сохранить настройки графиков')
			if (message) toast.error(message)
			return
		}
		await mutate(outcome.data, { revalidate: false })
		setDrafts(null)
		toast.success('Настройки графиков сохранены')
	}

	if (error !== undefined && data === undefined) {
		return (
			<div className="space-y-4">
				<PageHeader title="Графики" titleRef={titleRef} />
				<LoadErrorAlert
					title="Не удалось загрузить настройки графиков"
					error={error}
					onRetry={() => mutate()}
					focusTarget={titleRef}
				/>
			</div>
		)
	}

	const chartId = url.chart
	const isDefault = current ? sameConfig(current[chartId], DEFAULT_CHART_CONFIGS[chartId]) : true

	return (
		<div className="space-y-4">
			<PageHeader title="Графики" titleRef={titleRef}>
				<Select value={url.source} onValueChange={(value) => updateUrl({ source: value as PreviewSource })}>
					<SelectTrigger className="h-10 w-full rounded-full bg-card tab-sm:w-48" aria-label="Данные для превью">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="demo">Демо-данные</SelectItem>
						<SelectItem value="real">Реальные данные</SelectItem>
					</SelectContent>
				</Select>
				{url.source === 'real' && isAttemptChart(chartId) ? (
					<StudentPicker
						students={students}
						value={url.student}
						loading={studentsQuery.data === undefined && studentsQuery.error === undefined}
						onChange={(student) => updateUrl({ student })}
					/>
				) : null}
				{dirty.size > 0 ? (
					<Button variant="outline" className="h-10 rounded-full bg-card" onClick={() => setDrafts(null)}>
						Отменить
					</Button>
				) : null}
				<Button className="h-10 rounded-full" onClick={() => void save()} disabled={saving || dirty.size === 0}>
					Сохранить
				</Button>
			</PageHeader>

			<div className="grid gap-5 tab:grid-cols-[16rem_minmax(0,1fr)] xl:grid-cols-[18rem_minmax(0,1fr)]">
				<div className="hidden tab:block">
					<ChartsNav current={chartId} dirty={dirty} onSelect={(chart) => updateUrl({ chart })} />
				</div>

				<div className="min-w-0 space-y-4">
					<div className="tab:hidden">
						<Select value={chartId} onValueChange={(value) => updateUrl({ chart: value as ChartId })}>
							<SelectTrigger className="h-10 w-full rounded-full bg-card" aria-label="График">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{CHART_DEFINITIONS.map((chart) => (
									<SelectItem key={chart.id} value={chart.id}>
										{chart.place}: {chart.title}
										{dirty.has(chart.id) ? ' •' : ''}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<section className="rounded-3xl border border-border/80 bg-card p-4 shadow-sm tab-sm:p-5">
						<div className="mb-4 flex flex-wrap items-start justify-between gap-3">
							<div className="min-w-0">
								<h2 className="text-lg font-semibold text-foreground">{definition.title}</h2>
								<p className="text-sm text-muted-foreground">
									{definition.place} · {definition.audience}
								</p>
							</div>
							<Button
								variant="ghost"
								size="sm"
								className="rounded-full"
								disabled={!current || isDefault}
								onClick={() => setConfig(chartId, DEFAULT_CHART_CONFIGS[chartId])}
							>
								<RotateCcw className="size-4" aria-hidden="true" />
								Стандартные настройки
							</Button>
						</div>
						{current ? (
							<ChartPreview chartId={chartId} configs={current} source={url.source} studentId={url.student} now={now} />
						) : (
							<Skeleton className="h-72 rounded-2xl" aria-label="Загрузка превью" />
						)}
					</section>

					<section
						aria-labelledby="chart-settings-title"
						className="rounded-3xl border border-border/80 bg-card p-4 shadow-sm tab-sm:p-5"
					>
						<h2 id="chart-settings-title" className="mb-4 text-lg font-semibold text-foreground">
							Настройки
						</h2>
						{!current ? (
							<Skeleton className="h-40 rounded-2xl" />
						) : isAttemptChart(chartId) ? (
							<AttemptChartForm config={current[chartId]} onChange={(config) => setConfig(chartId, config)} />
						) : chartId === 'content' ? (
							<ContentChartForm config={current.content} onChange={(config) => setConfig('content', config)} />
						) : (
							<ActivityChartForm config={current.activity} onChange={(config) => setConfig('activity', config)} />
						)}
					</section>
				</div>
			</div>
		</div>
	)
}

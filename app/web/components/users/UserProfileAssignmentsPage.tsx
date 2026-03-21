'use client'

import { useMemo, useState } from 'react'

import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { Check, ChevronDown, Loader2, Search, Trash2, UserPlus } from 'lucide-react'
import Link from 'next/link'
import { useQueryState } from 'nuqs'
import { Area, AreaChart, CartesianGrid, Legend, XAxis, YAxis } from 'recharts'
import { toast } from 'sonner'
import useSWR from 'swr'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip } from '@/components/ui/chart'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { apiFetch } from '@/lib/api-fetch'
import type { UserRow } from '@/types/users'

const fetcher = (url: string) => fetch(url, { credentials: 'include' }).then((r) => r.json())

type TestAssignment = {
	testId: string
	testTitle: string
	testSlug: string
	assignedAt: string
}

type TestItem = {
	id: string
	title: string
	topicTitle: string | null
}

type UserAttempt = {
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

const CHART_COLORS = [
	'hsl(var(--chart-1))',
	'hsl(var(--chart-2))',
	'hsl(var(--chart-3))',
	'hsl(var(--chart-4))',
	'hsl(var(--chart-5))',
]

type Props = {
	login: string
}

export default function UserProfileAssignmentsPage({ login }: Props) {
	const normalizedLogin = login.trim().toLowerCase()

	const { data: usersData, isLoading: usersLoading } = useSWR<{ users: UserRow[] }>('/api/users', fetcher)

	const user = useMemo(
		() =>
			usersData?.users?.find((u) => typeof u.login === 'string' && u.login.toLowerCase() === normalizedLogin) ?? null,
		[usersData, normalizedLogin]
	)

	const userId = user?.id ?? null

	const {
		data: assignmentsData,
		isLoading: assignmentsLoading,
		mutate: mutateAssignments,
	} = useSWR<{ assignments: TestAssignment[] }>(userId ? `/api/users/${userId}/test-assignments` : null, fetcher)
	const { data: attemptsData, isLoading: attemptsLoading } = useSWR<{ attempts: UserAttempt[] }>(
		userId ? `/api/users/${userId}/test-attempts` : null,
		fetcher
	)

	const { data: testsData, isLoading: testsLoading } = useSWR<{ tests: TestItem[] }>('/api/tests', fetcher)

	const [assigningTestId, setAssigningTestId] = useState<string | null>(null)
	const [removingTestId, setRemovingTestId] = useState<string | null>(null)
	const [search, setSearch] = useQueryState('q', { defaultValue: '' })
	const [topicFilter, setTopicFilter] = useQueryState('topic', { defaultValue: 'all' })
	const [testsParam, setTestsParam] = useQueryState('tests', { defaultValue: '' })
	const [visibleCount, setVisibleCount] = useState(5)

	const selectedTestIds = useMemo(() => new Set(testsParam ? testsParam.split(',').filter(Boolean) : []), [testsParam])

	const assignments = useMemo(() => assignmentsData?.assignments ?? [], [assignmentsData])
	const attempts = useMemo(() => attemptsData?.attempts ?? [], [attemptsData])
	const assignedTestIds = useMemo(() => new Set(assignments.map((a) => a.testId)), [assignments])

	const topicOptions = useMemo(() => {
		const seen = new Map<string, string>()
		for (const a of attempts) {
			if (assignedTestIds.has(a.testId)) seen.set(a.topicSlug, a.topicTitle ?? a.topicSlug)
		}
		return Array.from(seen.entries()).map(([slug, title]) => ({ slug, title }))
	}, [attempts, assignedTestIds])

	const testOptions = useMemo(() => {
		const seen = new Map<string, string>()
		for (const a of attempts) {
			if (!assignedTestIds.has(a.testId)) continue
			if (topicFilter !== 'all' && a.topicSlug !== topicFilter) continue
			seen.set(a.testId, a.testTitle)
		}
		return Array.from(seen.entries()).map(([id, title]) => ({ id, title }))
	}, [attempts, assignedTestIds, topicFilter])

	// Active tests for chart/filter: selected ones, or all in topic if none selected
	const activeTestIds = useMemo(
		() => (selectedTestIds.size > 0 ? selectedTestIds : new Set(testOptions.map((t) => t.id))),
		[selectedTestIds, testOptions]
	)

	const filteredAttempts = useMemo(() => {
		const q = search.toLowerCase()
		return attempts.filter(
			(a) =>
				(topicFilter === 'all' || a.topicSlug === topicFilter) &&
				activeTestIds.has(a.testId) &&
				(!q || a.testTitle.toLowerCase().includes(q))
		)
	}, [attempts, search, topicFilter, activeTestIds])

	const visibleAttempts = useMemo(() => filteredAttempts.slice(0, visibleCount), [filteredAttempts, visibleCount])

	// Chart: one dataKey per active test, data is { date, [testId]: maxScore }
	const activeTestList = useMemo(() => testOptions.filter((t) => activeTestIds.has(t.id)), [testOptions, activeTestIds])

	const chartConfig = useMemo(() => {
		const cfg: Record<string, { label: string; color: string }> = {}
		activeTestList.forEach((t, i) => {
			cfg[t.id] = { label: t.title, color: CHART_COLORS[i % CHART_COLORS.length] }
		})
		return cfg
	}, [activeTestList])

	const chartData = useMemo(() => {
		// Collect all dates
		const byDateTest = new Map<string, Map<string, number[]>>()
		for (const a of filteredAttempts) {
			const date = a.submittedAt.slice(0, 10)
			if (!byDateTest.has(date)) byDateTest.set(date, new Map())
			const testMap = byDateTest.get(date)!
			if (!testMap.has(a.testId)) testMap.set(a.testId, [])
			testMap.get(a.testId)!.push(a.scorePercentage)
		}
		return Array.from(byDateTest.entries())
			.map(([date, testMap]) => {
				const point: Record<string, number | string> = { date }
				for (const [testId, scores] of testMap) {
					point[testId] = Math.max(...scores)
				}
				return point
			})
			.sort((a, b) => (a.date as string).localeCompare(b.date as string))
	}, [filteredAttempts])

	const availableTests = useMemo(
		() => (testsData?.tests ?? []).filter((t) => !assignedTestIds.has(t.id)),
		[testsData, assignedTestIds]
	)

	const handleAssign = async (testId: string) => {
		if (!userId || assigningTestId) return
		setAssigningTestId(testId)
		try {
			const res = await apiFetch(`/api/users/${userId}/test-assignments`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ testId }),
			})
			if (!res.ok) {
				const data = (await res.json().catch(() => null)) as { error?: string } | null
				throw new Error(data?.error || 'Ошибка назначения теста')
			}
			await mutateAssignments()
			toast.success('Тест назначен')
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Ошибка назначения теста')
		} finally {
			setAssigningTestId(null)
		}
	}

	const handleRemove = async (testId: string) => {
		if (!userId || removingTestId) return
		setRemovingTestId(testId)
		try {
			const res = await apiFetch(`/api/users/${userId}/test-assignments/${testId}`, {
				method: 'DELETE',
			})
			if (!res.ok) {
				const data = (await res.json().catch(() => null)) as { error?: string } | null
				throw new Error(data?.error || 'Ошибка удаления назначения')
			}
			await mutateAssignments()
			toast.success('Назначение удалено')
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Ошибка удаления назначения')
		} finally {
			setRemovingTestId(null)
		}
	}

	const toggleTest = (testId: string) => {
		const next = new Set(selectedTestIds)
		if (next.has(testId)) next.delete(testId)
		else next.add(testId)
		void setTestsParam(next.size > 0 ? Array.from(next).join(',') : null)
		setVisibleCount(5)
	}

	if (usersLoading || (Boolean(userId) && (assignmentsLoading || attemptsLoading))) {
		return (
			<div className="flex items-center justify-center p-12">
				<Loader2 className="h-8 w-8 animate-spin" />
			</div>
		)
	}

	if (!user) {
		return <div className="text-muted-foreground p-8 text-center">Пользователь не найден</div>
	}

	const displayName = user.name || [user.firstName, user.lastName].filter(Boolean).join(' ') || user.login

	const testPickerLabel =
		selectedTestIds.size === 0
			? 'Все тесты'
			: selectedTestIds.size === 1
				? (testOptions.find((t) => selectedTestIds.has(t.id))?.title ?? '1 тест')
				: `${selectedTestIds.size} теста выбрано`

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-semibold">{displayName}</h1>
				<p className="text-muted-foreground">{user.login}</p>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Пройденные тесты</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					{/* Filters */}
					{attempts.length > 0 && (
						<div className="flex flex-wrap gap-2">
							<div className="min-w-45 relative flex-1">
								<Search className="text-muted-foreground absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
								<Input
									placeholder="Поиск по тесту..."
									value={search}
									onChange={(e) => {
										void setSearch(e.target.value)
										setVisibleCount(5)
									}}
									className="h-8 pl-8 text-sm"
								/>
							</div>

							{/* Topic select */}
							<Select
								value={topicFilter}
								onValueChange={(v) => {
									void setTopicFilter(v)
									void setTestsParam(null)
									setVisibleCount(5)
								}}
							>
								<SelectTrigger className="w-45 h-8 text-sm">
									<SelectValue placeholder="Все темы" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">Все темы</SelectItem>
									{topicOptions.map((t) => (
										<SelectItem key={t.slug} value={t.slug}>
											{t.title}
										</SelectItem>
									))}
								</SelectContent>
							</Select>

							{/* Multi-select tests */}
							{testOptions.length > 0 && (
								<Popover>
									<PopoverTrigger asChild>
										<Button variant="outline" size="sm" className="h-8 gap-1.5 text-sm font-normal">
											{testPickerLabel}
											<ChevronDown className="h-3.5 w-3.5 opacity-60" />
										</Button>
									</PopoverTrigger>
									<PopoverContent className="w-64 p-2" align="start">
										<div className="max-h-60 space-y-1 overflow-y-auto">
											{/* "All" option */}
											<button
												className="hover:bg-accent flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm"
												onClick={() => {
													void setTestsParam(null)
													setVisibleCount(5)
												}}
											>
												<div className="flex h-4 w-4 items-center justify-center">
													{selectedTestIds.size === 0 && <Check className="h-3.5 w-3.5" />}
												</div>
												Все тесты
											</button>
											{testOptions.map((t, i) => (
												<label
													key={t.id}
													className="hover:bg-accent flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm"
												>
													<Checkbox checked={selectedTestIds.has(t.id)} onCheckedChange={() => toggleTest(t.id)} />
													<span
														className="mr-1 inline-block h-2 w-2 shrink-0 rounded-full"
														style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
													/>
													<span className="line-clamp-2">{t.title}</span>
												</label>
											))}
										</div>
									</PopoverContent>
								</Popover>
							)}
						</div>
					)}

					{/* Chart */}
					{chartData.length > 0 && activeTestList.length > 0 && (
						<ChartContainer config={chartConfig} className="h-50 w-full">
							<AreaChart data={chartData}>
								<CartesianGrid vertical={false} />
								<XAxis
									dataKey="date"
									tickFormatter={(v: string) => format(new Date(v), 'd MMM', { locale: ru })}
									tick={{ fontSize: 11 }}
								/>
								<YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
								<ChartTooltip
									content={({ active, payload, label }) => {
										if (!active || !payload?.length) return null
										const dateLabel = format(new Date(label as string), 'd MMMM yyyy', { locale: ru })
										return (
											<div className="bg-background min-w-40 space-y-1 rounded-lg border px-3 py-2 text-sm shadow-sm">
												<p className="font-medium">{dateLabel}</p>
												{payload.map((entry) => (
													<p key={entry.dataKey as string} style={{ color: entry.color as string }}>
														{chartConfig[entry.dataKey as string]?.label}: {entry.value}%
													</p>
												))}
											</div>
										)
									}}
								/>
								{activeTestList.length > 1 && (
									<Legend formatter={(value) => chartConfig[value]?.label ?? value} wrapperStyle={{ fontSize: 11 }} />
								)}
								{activeTestList.map((t, i) => {
									const color = CHART_COLORS[i % CHART_COLORS.length]
									return (
										<Area
											key={t.id}
											dataKey={t.id}
											type="monotone"
											stroke={color}
											fill={color}
											fillOpacity={0.2}
											connectNulls
										/>
									)
								})}
							</AreaChart>
						</ChartContainer>
					)}

					{/* List */}
					{attempts.length === 0 ? (
						<p className="text-muted-foreground text-sm">Отправленных попыток пока нет</p>
					) : filteredAttempts.length === 0 ? (
						<p className="text-muted-foreground text-sm">Ничего не найдено</p>
					) : (
						<div className="space-y-2">
							{visibleAttempts.map((attempt) => {
								const testIdx = activeTestList.findIndex((t) => t.id === attempt.testId)
								const dotColor = testIdx >= 0 ? CHART_COLORS[testIdx % CHART_COLORS.length] : undefined
								return (
									<Link
										href={`/admin/attempts/${attempt.attemptId}`}
										key={attempt.attemptId}
										className="hover:bg-secondary flex items-center justify-between gap-3 rounded-md border px-3 py-2 transition hover:border-black/40"
									>
										<div className="min-w-0 flex-1">
											<div className="flex items-center gap-1.5">
												{dotColor && (
													<span
														className="inline-block h-2 w-2 shrink-0 rounded-full"
														style={{ background: dotColor }}
													/>
												)}
												<p className="truncate text-sm font-medium">{attempt.testTitle}</p>
											</div>
											<p className="text-muted-foreground text-xs">
												{new Date(attempt.submittedAt).toLocaleString('ru-RU')} · {attempt.earnedPoints}/
												{attempt.totalPoints} · {attempt.scorePercentage}%
											</p>
										</div>
										<div className="flex items-center gap-2">
											<Badge variant={attempt.passed ? 'default' : 'secondary'}>
												{attempt.passed ? 'Пройден' : 'Не пройден'}
											</Badge>
										</div>
									</Link>
								)
							})}
							{visibleCount < filteredAttempts.length && (
								<Button variant="outline" size="sm" onClick={() => setVisibleCount((c) => c + 5)}>
									Загрузить ещё
								</Button>
							)}
						</div>
					)}
				</CardContent>
			</Card>

			<div className="grid gap-6 lg:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>Назначенные тесты</CardTitle>
					</CardHeader>
					<CardContent>
						{assignments.length === 0 ? (
							<p className="text-muted-foreground text-sm">Нет назначенных тестов</p>
						) : (
							<div className="space-y-2">
								{assignments.map((a) => (
									<div key={a.testId} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
										<div className="min-w-0 flex-1">
											<p className="truncate text-sm font-medium">{a.testTitle}</p>
											<p className="text-muted-foreground text-xs">
												{new Date(a.assignedAt).toLocaleDateString('ru-RU')}
											</p>
										</div>
										<Button
											size="icon"
											variant="ghost"
											aria-label="Удалить назначение"
											onClick={() => handleRemove(a.testId)}
											disabled={removingTestId === a.testId}
										>
											{removingTestId === a.testId ? (
												<Loader2 className="h-4 w-4 animate-spin" />
											) : (
												<Trash2 className="h-4 w-4" />
											)}
										</Button>
									</div>
								))}
							</div>
						)}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Назначить тест</CardTitle>
					</CardHeader>
					<CardContent>
						{testsLoading ? (
							<div className="text-muted-foreground flex items-center gap-2 text-sm">
								<Loader2 className="h-4 w-4 animate-spin" />
								Загрузка тестов...
							</div>
						) : availableTests.length === 0 ? (
							<p className="text-muted-foreground text-sm">Все тесты уже назначены</p>
						) : (
							<div className="max-h-80 space-y-2 overflow-y-auto">
								{availableTests.map((t) => (
									<div key={t.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
										<div className="min-w-0 flex-1">
											<p className="truncate text-sm font-medium">{t.title}</p>
											{t.topicTitle && (
												<Badge variant="secondary" className="mt-0.5 text-xs">
													{t.topicTitle}
												</Badge>
											)}
										</div>
										<Button
											size="sm"
											variant="outline"
											onClick={() => handleAssign(t.id)}
											disabled={assigningTestId === t.id}
										>
											{assigningTestId === t.id ? (
												<Loader2 className="mr-1 h-3 w-3 animate-spin" />
											) : (
												<UserPlus className="mr-1 h-3 w-3" />
											)}
											Назначить
										</Button>
									</div>
								))}
							</div>
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	)
}

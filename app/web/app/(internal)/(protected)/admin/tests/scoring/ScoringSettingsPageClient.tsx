'use client'

import { useEffect, useMemo, useState } from 'react'

import { ArrowLeft, Loader2, Save, Settings } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import useSWR from 'swr'

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { apiFetch } from '@/lib/api-fetch'

import { QuestionTypeScoringRuleEditorFields } from '../components/QuestionTypeScoringRuleEditor'
import {
	TEMPLATE_META,
	isMetricAllowedForTemplate,
	type QuestionTypeDefinition,
	type QuestionTypesResponse,
	type TestsResponse,
	type TopicsResponse,
} from '../types'

type Scope = 'global' | 'test'

const fetcher = async <T,>(url: string): Promise<T> => {
	const res = await fetch(url, { credentials: 'include' })
	if (!res.ok) {
		const data = await res.json().catch(() => null)
		throw new Error(data?.error || 'Ошибка загрузки')
	}
	return (await res.json()) as T
}

function validateScoring(type: QuestionTypeDefinition): string | null {
	const rule = type.scoringRule
	if (!isMetricAllowedForTemplate(type.uiTemplate, rule.mistakeMetric)) {
		return `Тип "${type.title}": метрика ${rule.mistakeMetric} несовместима с шаблоном ${type.uiTemplate}`
	}
	if (!Number.isFinite(rule.correctPoints) || rule.correctPoints < 0) {
		return `Тип "${type.title}": неверные баллы за правильный ответ`
	}
	if (rule.formula === 'one_mistake_partial') {
		if (!Number.isFinite(rule.oneMistakePoints ?? NaN) || (rule.oneMistakePoints ?? -1) < 0) {
			return `Тип "${type.title}": неверные баллы за 1 ошибку`
		}
		if ((rule.oneMistakePoints ?? 0) > rule.correctPoints) {
			return `Тип "${type.title}": баллы за 1 ошибку не могут быть больше полного балла`
		}
	}
	if (rule.formula === 'tiers') {
		if (!rule.tiers || rule.tiers.length === 0) {
			return `Тип "${type.title}": добавьте хотя бы один tier`
		}
		for (const tier of rule.tiers) {
			if (!Number.isFinite(tier.maxMistakes) || tier.maxMistakes < 1)
				return `Тип "${type.title}": tier.maxMistakes должен быть >= 1`
			if (!Number.isFinite(tier.points) || tier.points < 0) return `Тип "${type.title}": tier.points должен быть >= 0`
			if (tier.points > rule.correctPoints) return `Тип "${type.title}": tier.points не может быть больше correctPoints`
		}
	}
	return null
}

export default function ScoringSettingsPageClient() {
	const searchParams = useSearchParams()

	const [scope, setScope] = useState<Scope>((searchParams.get('scope') as Scope) || 'global')
	const [selectedTopicId, setSelectedTopicId] = useState('')
	const [selectedTestId, setSelectedTestId] = useState('')
	const [types, setTypes] = useState<QuestionTypeDefinition[]>([])
	const [overrideEnabled, setOverrideEnabled] = useState<Record<string, boolean>>({})
	const [loadingRules, setLoadingRules] = useState(false)
	const [saving, setSaving] = useState(false)
	const [didResolveQuerySelection, setDidResolveQuerySelection] = useState(false)

	const { data: topicsData } = useSWR<TopicsResponse>('/api/tests/topics', fetcher)
	const { data: testsData } = useSWR<TestsResponse>('/api/tests', fetcher)
	const topics = useMemo(() => topicsData?.topics ?? [], [topicsData])
	const tests = useMemo(() => testsData?.tests ?? [], [testsData])
	const testsForTopic = useMemo(
		() => tests.filter((test) => test.topicId === selectedTopicId),
		[tests, selectedTopicId]
	)
	const selectedTest = useMemo(() => tests.find((test) => test.id === selectedTestId), [tests, selectedTestId])

	useEffect(() => {
		if (didResolveQuerySelection || tests.length === 0 || topics.length === 0) return

		const queryScope = searchParams.get('scope')
		const queryTopicSlug = searchParams.get('topicSlug')
		const queryTestSlug = searchParams.get('testSlug')

		if (queryScope === 'test') setScope('test')
		if (queryTopicSlug && queryTestSlug) {
			const matched = tests.find((test) => test.topicSlug === queryTopicSlug && test.slug === queryTestSlug)
			if (matched) {
				setSelectedTopicId(matched.topicId)
				setSelectedTestId(matched.id)
			}
		}
		setDidResolveQuerySelection(true)
	}, [didResolveQuerySelection, searchParams, tests, topics])

	useEffect(() => {
		if (scope === 'test' && !selectedTestId) return

		let cancelled = false
		const load = async () => {
			setLoadingRules(true)
			try {
				const url =
					scope === 'global'
						? '/api/tests/question-types?includeInactive=true'
						: `/api/tests/question-types?testId=${selectedTestId}&includeInactive=true`
				const data = await fetcher<QuestionTypesResponse>(url)
				if (cancelled) return
				setTypes(data.questionTypes)
				const initialOverrides: Record<string, boolean> = {}
				for (const item of data.questionTypes) {
					initialOverrides[item.key] = Boolean(item.hasOverride)
				}
				setOverrideEnabled(initialOverrides)
			} catch (error) {
				if (!cancelled) toast.error(error instanceof Error ? error.message : 'Ошибка загрузки')
			} finally {
				if (!cancelled) setLoadingRules(false)
			}
		}

		load()
		return () => {
			cancelled = true
		}
	}, [scope, selectedTestId])

	const handleSave = async () => {
		if (scope === 'test' && !selectedTestId) {
			toast.error('Выберите тест')
			return
		}

		for (const type of types) {
			if (scope === 'test' && !overrideEnabled[type.key]) continue
			const error = validateScoring(type)
			if (error) {
				toast.error(error)
				return
			}
		}

		setSaving(true)
		try {
			if (scope === 'global') {
				for (const type of types) {
					const res = await apiFetch(`/api/tests/question-types/${type.key}`, {
						method: 'PATCH',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ scoringRule: type.scoringRule }),
					})
					if (!res.ok) {
						const data = await res.json().catch(() => null)
						throw new Error(data?.error || `Не удалось сохранить тип ${type.key}`)
					}
				}
				toast.success('Глобальные правила сохранены')
				return
			}

			for (const type of types) {
				if (overrideEnabled[type.key]) {
					const res = await apiFetch(`/api/tests/question-types/tests/${selectedTestId}/overrides/${type.key}`, {
						method: 'PUT',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							scoringRuleOverride: type.scoringRule,
							isDisabled: false,
						}),
					})
					if (!res.ok) {
						const data = await res.json().catch(() => null)
						throw new Error(data?.error || `Не удалось сохранить override для ${type.key}`)
					}
				} else {
					await apiFetch(`/api/tests/question-types/tests/${selectedTestId}/overrides/${type.key}`, {
						method: 'DELETE',
					})
				}
			}

			toast.success('Override правил для теста сохранены')
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Ошибка сохранения')
		} finally {
			setSaving(false)
		}
	}

	return (
		<div className="space-y-6">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="space-y-1">
					<h1 className="text-2xl font-semibold">Настройка баллов</h1>
					<p className="text-muted-foreground text-sm">Глобально или для отдельного теста по каждому типу вопроса</p>
				</div>
				<div className="flex gap-2">
					<Button variant="outline" asChild>
						<Link href="/admin/tests">
							<ArrowLeft />К тестам
						</Link>
					</Button>
					<Button variant="outline" asChild>
						<Link href="/admin/tests/question-types">
							<Settings />
							Типы вопросов
						</Link>
					</Button>
					{selectedTest?.topicSlug ? (
						<Button variant="outline" asChild>
							<Link href={`/admin/tests/${selectedTest.topicSlug}/${selectedTest.slug}`}>Открыть тест</Link>
						</Button>
					) : null}
				</div>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Параметры</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="space-y-2">
						<Label>Режим</Label>
						<Select value={scope} onValueChange={(value) => setScope(value as Scope)}>
							<SelectTrigger className="max-w-sm">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="global">Глобально для всех тестов</SelectItem>
								<SelectItem value="test">Только для выбранного теста</SelectItem>
							</SelectContent>
						</Select>
						<p className="text-muted-foreground text-xs">
							В глобальном режиме вы задаете базовую формулу для всех тестов. В режиме теста можно переопределить только
							отдельные типы.
						</p>
					</div>

					{scope === 'test' ? (
						<div className="grid gap-4 md:grid-cols-2">
							<div className="space-y-2">
								<Label>Тема</Label>
								<Select
									value={selectedTopicId}
									onValueChange={(value) => {
										setSelectedTopicId(value)
										setSelectedTestId('')
									}}
								>
									<SelectTrigger>
										<SelectValue placeholder="Выберите тему" />
									</SelectTrigger>
									<SelectContent>
										{topics.map((topic) => (
											<SelectItem key={topic.id} value={topic.id}>
												{topic.title}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div className="space-y-2">
								<Label>Тест</Label>
								<Select value={selectedTestId} onValueChange={setSelectedTestId} disabled={!selectedTopicId}>
									<SelectTrigger>
										<SelectValue placeholder="Выберите тест" />
									</SelectTrigger>
									<SelectContent>
										{testsForTopic.map((test) => (
											<SelectItem key={test.id} value={test.id}>
												{test.title}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<p className="text-muted-foreground text-xs">
									Выберите тест, чтобы включать/отключать override по каждому типу вопроса.
								</p>
							</div>
						</div>
					) : null}
				</CardContent>
			</Card>

			<Card>
				<CardHeader className="flex flex-row items-center justify-between">
					<CardTitle>Правила начисления</CardTitle>
					<Button onClick={handleSave} disabled={saving || loadingRules || (scope === 'test' && !selectedTestId)}>
						{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
						Сохранить
					</Button>
				</CardHeader>
				<CardContent className="space-y-3">
					{loadingRules ? (
						<div className="text-muted-foreground flex items-center gap-2 text-sm">
							<Loader2 className="h-4 w-4 animate-spin" />
							Загрузка правил...
						</div>
					) : scope === 'test' && !selectedTestId ? (
						<p className="text-muted-foreground text-sm">Выберите тест, чтобы настроить override.</p>
					) : (
						<Accordion type="multiple" className="space-y-2">
							{types.map((type) => (
								<AccordionItem value={type.key} key={type.key} className="rounded-md border px-3">
									<AccordionTrigger className="hover:no-underline">
										<div className="pr-4 text-left">
											<p className="font-medium">{type.title}</p>
											<p className="text-muted-foreground text-xs">
												{type.key} | {type.uiTemplate}
												{type.isSystem ? ' | system' : ''}
											</p>
										</div>
									</AccordionTrigger>
									<AccordionContent className="space-y-3 pb-3">
										<div>
											<p className="text-muted-foreground text-xs">{TEMPLATE_META[type.uiTemplate].description}</p>
											<p className="text-muted-foreground text-xs">Пример: {TEMPLATE_META[type.uiTemplate].example}</p>
										</div>
										{scope === 'test' ? (
											<div className="flex items-center justify-between rounded-md border p-2">
												<div>
													<p className="text-sm font-medium">Override для этого теста</p>
													<p className="text-muted-foreground text-xs">
														Если выключено, используется глобальная формула.
													</p>
												</div>
												<Switch
													checked={Boolean(overrideEnabled[type.key])}
													onCheckedChange={(checked) =>
														setOverrideEnabled((prev) => ({
															...prev,
															[type.key]: checked,
														}))
													}
												/>
											</div>
										) : null}
										{scope === 'test' && !overrideEnabled[type.key] ? (
											<p className="text-muted-foreground text-sm">Используется глобальная формула для этого типа.</p>
										) : (
											<QuestionTypeScoringRuleEditorFields
												rule={type.scoringRule}
												uiTemplate={type.uiTemplate}
												onChange={(next) =>
													setTypes((prev) =>
														prev.map((item) => (item.key === type.key ? { ...item, scoringRule: next } : item))
													)
												}
											/>
										)}
									</AccordionContent>
								</AccordionItem>
							))}
						</Accordion>
					)}
				</CardContent>
			</Card>
		</div>
	)
}

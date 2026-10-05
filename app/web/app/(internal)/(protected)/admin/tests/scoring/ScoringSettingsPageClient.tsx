'use client'

import { isAutoScoredTemplate } from '@bio-exam/exam-core'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Loader2, Save } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import useSWR from 'swr'

import { LoadErrorAlert } from '@/components/feedback/LoadErrorAlert'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { failureMessage } from '@/lib/http/errors'
import {
	adminTestsKeys,
	adminTestsListFetcher,
	saveGlobalScoringRules,
	saveTestScoringRules,
	scoringRulesFetcher,
	topicsListFetcher,
	type QuestionTypeOverridePayload,
} from '@/lib/tests/admin-api'

import { QuestionTypeScoringRuleEditorFields } from '../components/QuestionTypeScoringRuleEditor'
import { MISTAKE_METRIC_LABELS, TEMPLATE_META, isMetricAllowedForTemplate, type QuestionTypeDefinition } from '../types'

type Scope = 'global' | 'test'

const RULES_SWR_OPTIONS = { revalidateOnFocus: false, revalidateOnReconnect: false, revalidateOnMount: false }

const KICKER_CLASS = 'font-mono text-[0.6875rem] tracking-[0.22em] text-muted-foreground uppercase'

const SEGMENT_CLASS =
	'h-8 shrink-0 rounded-full px-4 text-muted-foreground hover:bg-transparent hover:text-foreground data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm'

function validateScoring(type: QuestionTypeDefinition): string | null {
	const rule = type.scoringRule
	const name = `Тип «${type.title}»`
	if (!isMetricAllowedForTemplate(type.uiTemplate, rule.mistakeMetric)) {
		return `${name}: подсчёт ошибок «${MISTAKE_METRIC_LABELS[rule.mistakeMetric]}» не подходит к формату «${TEMPLATE_META[type.uiTemplate].label}»`
	}
	if (!Number.isFinite(rule.correctPoints) || rule.correctPoints < 0) {
		return `${name}: неверные баллы за правильный ответ`
	}
	if (rule.formula === 'one_mistake_partial') {
		if (!Number.isFinite(rule.oneMistakePoints ?? NaN) || (rule.oneMistakePoints ?? -1) < 0) {
			return `${name}: неверные баллы за одну ошибку`
		}
		if ((rule.oneMistakePoints ?? 0) > rule.correctPoints) {
			return `${name}: баллы за одну ошибку не могут быть больше полного балла`
		}
	}
	if (rule.formula === 'tiers') {
		if (!rule.tiers || rule.tiers.length === 0) return `${name}: добавьте хотя бы одну ступень шкалы`
		for (const tier of rule.tiers) {
			if (!Number.isFinite(tier.maxMistakes) || tier.maxMistakes < 1)
				return `${name}: порог ошибок в ступени должен быть не меньше 1`
			if (!Number.isFinite(tier.points) || tier.points < 0) return `${name}: баллы ступени не могут быть отрицательными`
			if (tier.points > rule.correctPoints) return `${name}: баллы ступени не могут быть больше полного балла`
		}
	}
	return null
}

function savedOverride(type: QuestionTypeDefinition): QuestionTypeOverridePayload | null {
	if (!type.override) return null
	return {
		titleOverride: type.override.titleOverride ?? null,
		scoringRuleOverride: type.override.scoringRuleOverride ?? null,
		isDisabled: Boolean(type.override.isDisabled),
	}
}

export default function ScoringSettingsPageClient() {
	const searchParams = useSearchParams()

	const [scope, setScope] = useState<Scope>(searchParams.get('scope') === 'test' ? 'test' : 'global')
	const [selectedTopicId, setSelectedTopicId] = useState('')
	const [selectedTestId, setSelectedTestId] = useState('')
	const [types, setTypes] = useState<QuestionTypeDefinition[]>([])
	const [overrideEnabled, setOverrideEnabled] = useState<Record<string, boolean>>({})
	const [openTypes, setOpenTypes] = useState<string[]>(() => {
		const key = searchParams.get('type')
		return key ? [key] : []
	})
	const [seededKey, setSeededKey] = useState<string | null>(null)
	const [saving, setSaving] = useState(false)
	const [didResolveQuerySelection, setDidResolveQuerySelection] = useState(false)
	const rulesTitleRef = useRef<HTMLHeadingElement>(null)

	const topicsQuery = useSWR(adminTestsKeys.topics(), topicsListFetcher)
	const testsQuery = useSWR(adminTestsKeys.list(), adminTestsListFetcher)
	const topicsData = topicsQuery.data
	const testsData = testsQuery.data
	const topicsFailed = topicsQuery.error !== undefined && topicsData === undefined
	const testsFailed = testsQuery.error !== undefined && testsData === undefined
	const topics = useMemo(() => topicsData?.topics ?? [], [topicsData])
	const tests = useMemo(() => testsData?.tests ?? [], [testsData])
	const testsForTopic = useMemo(
		() => tests.filter((test) => test.topicId === selectedTopicId),
		[tests, selectedTopicId]
	)
	const selectedTest = useMemo(() => tests.find((test) => test.id === selectedTestId), [tests, selectedTestId])

	const rulesKey =
		scope === 'global'
			? adminTestsKeys.scoringGlobal()
			: selectedTestId
				? adminTestsKeys.scoringTest(selectedTestId)
				: null
	const rulesQuery = useSWR(rulesKey, scoringRulesFetcher, RULES_SWR_OPTIONS)
	const { mutate: mutateRules } = rulesQuery
	const rulesFailed = rulesQuery.error !== undefined && rulesQuery.data === undefined
	const rulesReady = rulesKey !== null && seededKey === rulesKey
	const loadingRules = rulesKey !== null && !rulesReady && !rulesFailed
	const activeRulesKeyRef = useRef(rulesKey)

	const loadRules = useCallback(
		async (key: string) => {
			const fresh = await mutateRules()
			if (!fresh || activeRulesKeyRef.current !== key) return
			const scoredTypes = fresh.questionTypes.filter((item) => isAutoScoredTemplate(item.uiTemplate))
			setTypes(scoredTypes)
			const initialOverrides: Record<string, boolean> = {}
			for (const item of scoredTypes) {
				initialOverrides[item.key] = Boolean(item.override?.scoringRuleOverride)
			}
			setOverrideEnabled(initialOverrides)
			setSeededKey(key)
		},
		[mutateRules]
	)

	useEffect(() => {
		activeRulesKeyRef.current = rulesKey
		if (rulesKey) void loadRules(rulesKey)
	}, [rulesKey, loadRules])

	useEffect(() => {
		if (didResolveQuerySelection || tests.length === 0 || topics.length === 0) return

		const queryTopicSlug = searchParams.get('topicSlug')
		const queryTestSlug = searchParams.get('testSlug')
		if (queryTopicSlug && queryTestSlug) {
			const matched = tests.find((test) => test.topicSlug === queryTopicSlug && test.slug === queryTestSlug)
			if (matched) {
				setSelectedTopicId(matched.topicId)
				setSelectedTestId(matched.id)
			}
		}
		setDidResolveQuerySelection(true)
	}, [didResolveQuerySelection, searchParams, tests, topics])

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
		const outcome =
			scope === 'global'
				? await saveGlobalScoringRules(types.map((type) => ({ key: type.key, scoringRule: type.scoringRule })))
				: await saveTestScoringRules(
						selectedTestId,
						types.map((type) => ({
							key: type.key,
							scoringRule: type.scoringRule,
							override: Boolean(overrideEnabled[type.key]),
							saved: savedOverride(type),
						}))
					)
		setSaving(false)
		if (!outcome.ok) {
			const message = outcome.message || failureMessage(outcome, 'Ошибка сохранения')
			if (message) toast.error(message)
			return
		}
		toast.success(scope === 'global' ? 'Общие формулы сохранены' : 'Формулы теста сохранены')
		if (rulesKey) void loadRules(rulesKey)
	}

	const retryTopicsAndTests = () =>
		Promise.all([topicsFailed ? topicsQuery.mutate() : null, testsFailed ? testsQuery.mutate() : null])

	return (
		<div className="space-y-5">
			<section className="flex flex-col gap-4 rounded-4xl border border-border/80 bg-card/90 p-unit-mob shadow-sm tab-sm:flex-row tab-sm:items-start tab-sm:justify-between tab-sm:p-unit">
				<div className="min-w-0">
					<p className={KICKER_CLASS}>банк заданий</p>
					<h1 className="mt-2 font-serif text-3xl leading-tight text-foreground tab-sm:text-4xl">Настройка баллов</h1>
					<p className="mt-2 max-w-2xl text-sm text-muted-foreground">
						Формула баллов для каждого типа вопроса — общая для всех тестов или своя для отдельного теста. Формат ответа
						и название типа задаются в{' '}
						<Link
							href="/admin/tests/question-types"
							className="font-medium text-primary underline-offset-4 hover:underline"
						>
							типах вопросов
						</Link>
						.
					</p>
				</div>
				<div className="flex shrink-0 flex-wrap items-center gap-2">
					{scope === 'test' && selectedTest?.topicSlug ? (
						<Button variant="outline" asChild className="rounded-full bg-card">
							<Link href={`/admin/tests/${selectedTest.topicSlug}/${selectedTest.slug}`}>Открыть тест</Link>
						</Button>
					) : null}
					<Button className="rounded-full" onClick={handleSave} disabled={saving || !rulesReady}>
						{saving ? (
							<Loader2 className="size-4 animate-spin" aria-hidden="true" />
						) : (
							<Save className="size-4" aria-hidden="true" />
						)}
						Сохранить
					</Button>
				</div>
			</section>

			<section className="space-y-4 rounded-4xl border border-border/80 bg-card/90 p-unit-mob shadow-sm tab-sm:p-unit">
				{topicsFailed || testsFailed ? (
					<LoadErrorAlert
						title="Не удалось загрузить темы и тесты"
						error={topicsQuery.error ?? testsQuery.error}
						onRetry={retryTopicsAndTests}
					/>
				) : null}
				<ToggleGroup
					type="single"
					value={scope}
					onValueChange={(value) => {
						if (value) setScope(value as Scope)
					}}
					aria-label="Для каких тестов формула"
					className="w-full justify-start gap-1 rounded-full bg-secondary/60 p-1 mob:w-fit"
				>
					<ToggleGroupItem value="global" className={SEGMENT_CLASS}>
						Для всех тестов
					</ToggleGroupItem>
					<ToggleGroupItem value="test" className={SEGMENT_CLASS}>
						Для одного теста
					</ToggleGroupItem>
				</ToggleGroup>
				<p className="text-sm text-muted-foreground">
					{scope === 'global'
						? 'Общая формула действует во всех тестах, где для типа не задана своя.'
						: 'Включите «Своя формула» у нужных типов — остальные считаются по общей формуле.'}
				</p>

				{scope === 'test' ? (
					<div className="grid gap-4 tab-sm:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor="scoring-topic">Тема</Label>
							<Select
								value={selectedTopicId}
								onValueChange={(value) => {
									setSelectedTopicId(value)
									setSelectedTestId('')
								}}
							>
								<SelectTrigger id="scoring-topic" className="w-full">
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
							<Label htmlFor="scoring-test">Тест</Label>
							<Select value={selectedTestId} onValueChange={setSelectedTestId} disabled={!selectedTopicId}>
								<SelectTrigger id="scoring-test" className="w-full">
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
						</div>
					</div>
				) : null}
			</section>

			<section className="space-y-3">
				<h2 ref={rulesTitleRef} tabIndex={-1} className="px-1 font-serif text-2xl text-foreground">
					Формулы по типам вопросов
				</h2>
				{rulesFailed ? (
					<LoadErrorAlert
						title="Не удалось загрузить формулы"
						error={rulesQuery.error}
						onRetry={() => (rulesKey ? loadRules(rulesKey) : undefined)}
						focusTarget={rulesTitleRef}
					/>
				) : loadingRules ? (
					<Skeleton className="h-72 rounded-3xl" aria-label="Загрузка формул" />
				) : rulesKey === null ? (
					<p className="rounded-3xl border border-dashed border-border bg-card/70 px-6 py-10 text-center text-sm text-muted-foreground">
						Выберите тему и тест, чтобы задать для него свои формулы.
					</p>
				) : (
					<Accordion type="multiple" value={openTypes} onValueChange={setOpenTypes} className="space-y-2">
						{types.map((type) => {
							const own = scope === 'test' && Boolean(overrideEnabled[type.key])
							const disabledInTest = scope === 'test' && Boolean(type.override?.isDisabled)
							return (
								<AccordionItem
									value={type.key}
									key={type.key}
									className="rounded-3xl border border-border/80 bg-card px-4 shadow-sm last:border-b"
								>
									<AccordionTrigger className="hover:no-underline">
										<div className="min-w-0 pr-4 text-left">
											<p className="font-medium text-foreground">{type.title}</p>
											<p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
												<span>{TEMPLATE_META[type.uiTemplate].label}</span>
												{own ? (
													<Badge variant="default" className="rounded-full">
														Своя формула
													</Badge>
												) : null}
												{disabledInTest ? (
													<Badge variant="secondary" className="rounded-full">
														Отключён в тесте
													</Badge>
												) : null}
												{!type.isActive && !disabledInTest ? (
													<Badge variant="secondary" className="rounded-full">
														Отключён
													</Badge>
												) : null}
											</p>
										</div>
									</AccordionTrigger>
									<AccordionContent className="space-y-3 pb-4">
										<p className="text-sm text-muted-foreground">{TEMPLATE_META[type.uiTemplate].description}</p>
										{scope === 'test' ? (
											<label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl bg-secondary/50 px-3 py-2">
												<span>
													<span className="block text-sm font-medium text-foreground">
														Своя формула для этого теста
													</span>
													<span className="block text-xs text-muted-foreground">
														Если выключено, действует общая формула.
													</span>
												</span>
												<Switch
													checked={own}
													onCheckedChange={(checked) =>
														setOverrideEnabled((prev) => ({
															...prev,
															[type.key]: checked,
														}))
													}
												/>
											</label>
										) : null}
										{scope === 'test' && !own ? (
											<p className="text-sm text-muted-foreground">Используется общая формула.</p>
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
							)
						})}
					</Accordion>
				)}
			</section>
		</div>
	)
}
